# 🐰 까먹지 마! (Don't Forget! - Rabbit Todo)

귀여운 토끼가 당신의 할 일을 기억해주는 PWA(Progressive Web App) 기반의 스마트 할 일 관리 애플리케이션입니다.

## ✨ 주요 기능
- **할 일 추가 및 기한 설정:** 직관적인 Glassmorphism UI를 통한 간편한 할 일 관리
- **스마트 푸시 알람:** 원하는 날짜와 시간을 지정하면 백그라운드에서 브라우저 Web Push 알림 제공
- **자동 정리 기능:** 완료되거나 마감 기한이 지난 할 일은 최근 5개만 남기고 자동으로 데이터베이스에서 영구 삭제되어 깔끔한 화면 유지
- **PWA 지원:** 데스크톱(PC) 및 모바일 기기에 기본 앱처럼 설치 가능 (`manifest.json` 및 Service Worker 완비)
- **개별 유저 기록장:** 간단한 아이디/비밀번호 기반의 사용자 인증 및 개인별 할 일 관리

## 🛠 기술 스택
- **Frontend:** React, Vite, Framer Motion (애니메이션), Axios, Lucide-React (아이콘)
- **Backend:** Python Flask, SQLAlchemy (SQLite), PyWebPush (웹 푸시 알림 전송), APScheduler (백그라운드 작업 스케줄링)
- **Styling:** CSS3 (Apple Glassmorphism 테마, 다크 모드 배경 색상 동기화)

## 🚀 설치 및 실행 방법

### 1. Repository 가져오기
```bash
git clone https://github.com/Chang-Hee-Kim/todo.git
cd todo
```

### 2. 백엔드 (Backend) 설정 및 실행
Python 3.8 이상 환경이 필요합니다.
```bash
cd flask

# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # (Windows의 경우 venv\Scripts\activate)

# 필요한 패키지 설치
pip install flask flask-sqlalchemy werkzeug pywebpush apscheduler flask-cors

# 서버 실행 (기본 포트: 5050)
python main.py
```
> **Tip:** 애플리케이션 최초 실행 시 `app.db` (SQLite 데이터베이스)가 자동으로 생성됩니다. 백그라운드에서는 60초마다 `APScheduler`가 돌아가며 알림 보낼 항목을 검사합니다.

### 3. 프론트엔드 (Frontend) 설정 및 실행
Node.js 18 이상 환경이 필요합니다.
```bash
cd ../frontend

# 의존성 패키지 설치
npm install

# 개발 환경 로컬 서버 실행
npm run dev

# 프로덕션 빌드 파일 생성 (dist 경로에 생성)
npm run build
```

## 📂 프로젝트 구조
- `/frontend`: 사용자 인터페이스와 Service Worker 푸시 수신, 디자인 테마가 위치합니다.
- `/flask`: 실시간 백그라운드 푸시 알람 발송과 데이터베이스 관리 등 비즈니스 로직을 처리는 백엔드 API 서버입니다.

## 📄 라이선스
Designed by BLUEFISH Corporation 2026.
