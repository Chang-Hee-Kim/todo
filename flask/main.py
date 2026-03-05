import os
import json
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, jsonify, request
from models import db, User, Todo
from datetime import datetime
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)

# --- 웹 푸시 인증 정보 (VAPID) ---
VAPID_PRIVATE_KEY = "UNyLVcgte1httYuHS3huuxSc2vdXvQlMmd-CiRKfexY"
VAPID_PUBLIC_KEY = "BI_jeqwx2WAoTSrqS7-sUZatB-6UQxktLa8dgRHziP-XWsB-XvCvAMBdHYq6Y-DB59G-jEmgmPpaXuGNC24s4l0"
VAPID_CLAIMS = {
    "sub": "mailto:admin@bf-tech.duckdns.org"
}

# 데이터베이스 설정 (SQLite 파일 형태)
base_dir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(base_dir, 'app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# SQLAlchemy 앱에 초기화
db.init_app(app)

# 서버 시작 시 데이터베이스(테이블) 자동 생성
with app.app_context():
    db.create_all()

def check_alarms():
    """주기적으로 알람 시간을 확인하여 푸시 알림을 보냅니다."""
    with app.app_context():
        # 프론트엔드에서 보낸 시각이 로컬 시간(KST)이므로 check_alarms도 로컬 시간과 비교해야 합니다.
        now = datetime.now()
        todos_to_notify = Todo.query.filter(
            Todo.alarm_time != None,
            Todo.alarm_time <= now,
            Todo.is_notified == False
        ).all()
        
        for todo in todos_to_notify:
            user = User.query.get(todo.user_id)
            if user and user.push_subscription:
                try:
                    subscription_info = json.loads(user.push_subscription)
                    webpush(
                        subscription_info=subscription_info,
                        data=json.dumps({
                            "title": "⏰ 할 일 알람!",
                            "body": f"\"{todo.title}\" 할 시간이에요!"
                        }),
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims=VAPID_CLAIMS
                    )
                    todo.is_notified = True  # 성공적으로 보냈으면 플래그 업데이트
                except Exception as ex:
                    print(f"Failed to send background push for Todo [{todo.id}]: {ex}")
        
        db.session.commit()

# 백그라운드 스케줄러 초기화: 60초마다 check_alarms 함수 실행
scheduler = BackgroundScheduler()
scheduler.add_job(func=check_alarms, trigger="interval", seconds=60)
scheduler.start()

@app.route('/')
def hello():
    return "🐰 까먹지 마! API 서버에 연결성공! (SQLAlchemy & SQLite 적용 완료)"

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "서버가 정상적으로 동작 중입니다."})

# -------------------------------------------------------------
# Web Push API
# -------------------------------------------------------------
@app.route('/vapid_public_key', methods=['GET'])
def get_vapid_public_key():
    return jsonify({"public_key": VAPID_PUBLIC_KEY})

@app.route('/subscribe', methods=['POST'])
def subscribe():
    data = request.get_json()
    if not data or 'subscription' not in data or 'user_id' not in data:
        return jsonify({'error': '잘못된 요청입니다.'}), 400

    user = User.query.get(data['user_id'])
    if not user:
        return jsonify({'error': '존재하지 않는 사용자입니다.'}), 404
        
    # 구독 객체를 JSON 문자열로 직렬화하여 DB에 저장
    user.push_subscription = json.dumps(data['subscription'])
    db.session.commit()
    return jsonify({'success': True, 'message': '알림 구독이 완료되었습니다!'})

@app.route('/test_push', methods=['POST'])
def test_push():
    data = request.get_json()
    user_id = data.get('user_id')
    
    user = User.query.get(user_id)
    if not user or not user.push_subscription:
        return jsonify({'error': '등록된 푸시 알림 구독 정보가 없습니다.'}), 404
        
    subscription_info = json.loads(user.push_subscription)
    
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({"title": "까먹지 마! 🐰", "body": "토끼가 보낸 알림이 잘 도착했어요!"}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return jsonify({'success': True, 'message': '푸시가 성공적으로 발송되었습니다.'})
    except WebPushException as ex:
        print("Web Push Error:", repr(ex))
        # VAPID 서명 문제 등일 때 Mozilla 디버깅 정보(response.text)를 확인
        if ex.response and ex.response.text:
            print("Web Push Response Payload:", ex.response.text)
        return jsonify({'error': repr(ex)}), 500

# -------------------------------------------------------------
# User API
# -------------------------------------------------------------
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'username과 password는 필수입니다.'}), 400
    
    # 중복 체크
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': '이미 존재하는 사용자 이름입니다.'}), 409

    hashed_pw = generate_password_hash(data['password'], method='pbkdf2:sha256')
    new_user = User(username=data['username'], password_hash=hashed_pw)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True, 'user': new_user.to_dict()}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'username과 password는 필수입니다.'}), 400

    user = User.query.filter_by(username=data['username']).first()
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': '아이디 또는 비밀번호가 올바르지 않습니다.'}), 401

    return jsonify({'success': True, 'user': user.to_dict()}), 200

@app.route('/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify({'users': [user.to_dict() for user in users]})

# -------------------------------------------------------------
# Todo API
# -------------------------------------------------------------
@app.route('/todos', methods=['POST'])
def create_todo():
    data = request.get_json()
    if not data or 'title' not in data or 'user_id' not in data:
        return jsonify({'error': 'title과 user_id는 필수입니다.'}), 400

    user = User.query.get(data['user_id'])
    if not user:
        return jsonify({'error': '존재하지 않는 사용자입니다.'}), 404

    due_date = None
    if 'due_date' in data and data['due_date']:
        try:
            due_date = datetime.strptime(data['due_date'], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return jsonify({'error': 'due_date 형식이 올바르지 않습니다.'}), 400

    alarm_time = None
    if 'alarm_time' in data and data['alarm_time']:
        try:
            alarm_time = datetime.strptime(data['alarm_time'], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return jsonify({'error': 'alarm_time 형식이 올바르지 않습니다.'}), 400

    new_todo = Todo(
        title=data['title'],
        description=data.get('description', ''),
        user_id=data['user_id'],
        due_date=due_date,
        alarm_time=alarm_time
    )
    db.session.add(new_todo)
    db.session.commit()
    
    return jsonify({'success': True, 'todo': new_todo.to_dict()}), 201

@app.route('/todos', methods=['GET'])
def get_todos():
    user_id = request.args.get('user_id')
    if user_id:
        todos = Todo.query.filter_by(user_id=user_id).order_by(Todo.created_at.desc()).all()
    else:
        todos = Todo.query.order_by(Todo.created_at.desc()).all()
    return jsonify({'todos': [todo.to_dict() for todo in todos]})

@app.route('/todos/<int:todo_id>', methods=['PUT'])
def update_todo(todo_id):
    todo = Todo.query.get(todo_id)
    if not todo:
        return jsonify({'error': '존재하지 않는 할 일입니다.'}), 404

    data = request.get_json()
    if 'title' in data:
        todo.title = data['title']
    if 'description' in data:
        todo.description = data['description']
    if 'is_completed' in data:
        todo.is_completed = data['is_completed']
    if 'due_date' in data:
        if data['due_date']:
            try:
                todo.due_date = datetime.strptime(data['due_date'], '%Y-%m-%d %H:%M:%S')
            except ValueError:
                return jsonify({'error': 'due_date 형식이 올바르지 않습니다.'}), 400
        else:
            todo.due_date = None
    if 'alarm_time' in data:
        if data['alarm_time']:
            try:
                todo.alarm_time = datetime.strptime(data['alarm_time'], '%Y-%m-%d %H:%M:%S')
            except ValueError:
                return jsonify({'error': 'alarm_time 형식이 올바르지 않습니다.'}), 400
        else:
            todo.alarm_time = None

    db.session.commit()

    # Automatically delete oldest completed items if count > 4
    if todo.is_completed:
        completed_todos = Todo.query.filter_by(user_id=todo.user_id, is_completed=True)\
            .order_by(Todo.created_at.desc()).all()
        
        if len(completed_todos) > 4:
            # Drop the first 4 (newest), keep the rest for deletion
            todos_to_delete = completed_todos[4:]
            for old_todo in todos_to_delete:
                db.session.delete(old_todo)
            db.session.commit()

    return jsonify({'success': True, 'todo': todo.to_dict()})

@app.route('/todos/<int:todo_id>', methods=['DELETE'])
def delete_todo(todo_id):
    todo = Todo.query.get(todo_id)
    if not todo:
        return jsonify({'error': '존재하지 않는 할 일입니다.'}), 404

    db.session.delete(todo)
    db.session.commit()
    return jsonify({'success': True, 'message': '할 일이 삭제되었습니다.'})

if __name__ == '__main__':
    # 0.0.0.0으로 바인딩해야 외부 접속 가능
    app.run(host='0.0.0.0', port=5050)
