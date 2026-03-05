from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 웹 푸시 구독 정보 (JSON 형태로 저장)
    push_subscription = db.Column(db.Text, nullable=True) 
    
    # 사용자와 1:N 관계 설정
    todos = db.relationship('Todo', backref='owner', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

class Todo(db.Model):
    __tablename__ = 'todos'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_completed = db.Column(db.Boolean, default=False)
    
    # 시간 관련 컬럼
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    due_date = db.Column(db.DateTime, nullable=True)     # 마감일
    alarm_time = db.Column(db.DateTime, nullable=True)   # 알람 푸시 시간
    
    # 알림 발송 여부 추적
    is_notified = db.Column(db.Boolean, default=False)
    
    # Foreign Key
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'is_completed': self.is_completed,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'due_date': self.due_date.strftime('%Y-%m-%d %H:%M:%S') if self.due_date else None,
            'alarm_time': self.alarm_time.strftime('%Y-%m-%d %H:%M:%S') if self.alarm_time else None,
            'is_notified': self.is_notified,
            'user_id': self.user_id
        }
