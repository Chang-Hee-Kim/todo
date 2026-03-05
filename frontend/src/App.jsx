import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Calendar, Clock, Bell, X, CalendarDays, BellPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'

const API_BASE_URL = '/api'

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function App() {
  const [todos, setTodos] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // 모달(팝업) 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tempTodoTitle, setTempTodoTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [alarmTime, setAlarmTime] = useState('')

  // 인증(Authentication) 관련 상태
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('rabbit_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // In-App Toast Notification State
  const [toast, setToast] = useState(null)

  // Service Worker 로부터 웹 푸시 데이터를 In-App Toast로 띄우기 위한 리스너
  useEffect(() => {
    const handleSwMessage = (event) => {
      if (event.data && event.data.type === 'PUSH_TOAST') {
        setToast({ title: event.data.title, body: event.data.body });
        setTimeout(() => setToast(null), 5000);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  // 웹 푸시 관련 상태
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')

  // 로그아웃 처리
  const handleLogout = () => {
    setCurrentUser(null);
    setTodos([]);
    localStorage.removeItem('rabbit_user');
  };

  // 로그인/회원가입 요청 처리
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }
    try {
      const endpoint = authMode === 'login' ? '/login' : '/register';
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, {
        username: authUsername.trim(),
        password: authPassword.trim()
      });
      setCurrentUser(response.data.user);
      localStorage.setItem('rabbit_user', JSON.stringify(response.data.user));
      setAuthUsername('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(err.response?.data?.error || '인증 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    const initializeUserEnv = async () => {
      if (currentUser) {
        fetchTodos();
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          setPushSupported(true);
          setPushPermission(Notification.permission);

          // 브라우저 권한은 이미 허용되어 있는데, 백엔드가 바뀌었거나 새 유저로 로그인했을 경우 토큰 강제 갱신
          if (Notification.permission === 'granted') {
            try {
              const response = await axios.get(`${API_BASE_URL}/vapid_public_key`);
              const vapidPublicKey = response.data.public_key;
              const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

              const registration = await navigator.serviceWorker.register('/sw.js');
              await navigator.serviceWorker.ready;

              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
              });

              await axios.post(`${API_BASE_URL}/subscribe`, {
                subscription: subscription,
                user_id: currentUser.id
              });
              console.log("백그라운드 푸시 토큰 자동 갱신 완료");
            } catch (err) {
              console.error("자동 푸시 갱신 실패:", err);
            }
          }
        }
      }
    };
    initializeUserEnv();
  }, [currentUser]);

  const fetchTodos = async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/todos?user_id=${currentUser.id}&t=${Date.now()}`)
      let fetchedTodos = response.data.todos;

      // Auto-cleanup: keep only top 5 newest passed (completed/overdue) tasks
      const passedTodos = fetchedTodos.filter(todo => todo.is_completed || isOverdue(todo.due_date));
      if (passedTodos.length > 5) {
        passedTodos.sort((a, b) => b.id - a.id); // Descending by ID normally correlates to newest
        const todosToDelete = passedTodos.slice(5);
        todosToDelete.forEach(todo => {
          axios.delete(`${API_BASE_URL}/todos/${todo.id}`).catch(e => console.error(e));
        });
        const deletedIds = new Set(todosToDelete.map(t => t.id));
        fetchedTodos = fetchedTodos.filter(t => !deletedIds.has(t.id));
      }

      setTodos(fetchedTodos)
    } catch (error) {
      console.error("Todo 목록을 불러오지 못했습니다.", error)
    } finally {
      setIsLoading(false);
    }
  }

  const isOverdue = (dueDateStr) => {
    if (!dueDateStr) return false;
    // Replace space with 'T' for iOS Safari compatibility
    const safeDateStr = dueDateStr.replace(' ', 'T');
    const dueTime = new Date(safeDateStr).getTime();
    return dueTime < Date.now();
  }

  const formatBackendDateTime = (localDateTime) => {
    if (!localDateTime) return null;
    return localDateTime.replace('T', ' ') + ':00';
  }

  const formatDisplayDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const date = new Date(dateTimeStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${month}월 ${day}일 ${ampm} ${hours}:${minutes}`;
  }

  // --- Web Push 관련 헬퍼 ---
  const subscribeUserToPush = async () => {
    if (!pushSupported) return

    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)

      if (permission === 'granted') {
        const response = await axios.get(`${API_BASE_URL}/vapid_public_key`)
        const vapidPublicKey = response.data.public_key
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)

        const registration = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        })

        await axios.post(`${API_BASE_URL}/subscribe`, {
          subscription: subscription,
          user_id: currentUser.id
        })

        console.log("웹 푸시 구독 완료");
      }
    } catch (error) {
      console.error("푸시 알림 구독 중 오류:", error)
      alert("알림 구독 중 문제가 발생했습니다.")
    }
  }

  // --- 기존 Todo 관련 로직 ---
  const handleOpenModal = (e) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    setTempTodoTitle(inputValue.trim())
    setIsModalOpen(true)
  }

  const handleSaveTodo = async () => {
    try {
      await axios.post(`${API_BASE_URL}/todos`, {
        title: tempTodoTitle,
        user_id: currentUser.id,
        due_date: formatBackendDateTime(dueDate),
        alarm_time: formatBackendDateTime(alarmTime)
      })

      setInputValue('')
      setTempTodoTitle('')
      setDueDate('')
      setAlarmTime('')
      setIsModalOpen(false)
      fetchTodos()
    } catch (error) {
      console.error("Todo 추가 실패:", error)
    }
  }



  const deleteTodo = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/todos/${id}`)
      setTodos(todos.filter(todo => todo.id !== id))
    } catch (error) {
      console.error("Todo 삭제 실패:", error)
    }
  }

  if (!currentUser) {
    return (
      <div className="app-container">
        <header className="rabbit-header">
          <span className="rabbit-icon">🐰</span>
          <h1 className="title">까먹지 마!</h1>
          <p className="subtitle">{authMode === 'login' ? '로그인하여 할 일을 확인하세요' : '새로운 토끼를 등록하세요'}</p>
        </header>

        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease: "easeInOut", duration: 0.4 }}
        >
          <form className="auth-form" onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="토끼 아이디"
              value={authUsername}
              onChange={e => setAuthUsername(e.target.value)}
              className="auth-input"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              className="auth-input"
            />
            {authError && <div className="auth-error">{authError}</div>}
            <button type="submit" className="auth-submit-btn">
              {authMode === 'login' ? '시작하기' : '가입하기'}
            </button>
          </form>
          <div className="auth-switch">
            <button
              onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
              className="auth-switch-btn"
            >
              {authMode === 'login' ? '처음 지동을 뵙나요? 회원가입하기 👉' : '이미 계정이 있으신가요? 로그인 👉'}
            </button>
          </div>
        </motion.div>

        <footer className="app-footer">
          Designed by BLUEFISH Corporation 2026.
        </footer>
      </div>
    );
  }

  return (
    <div className="app-container">
      {toast && (
        <div className="in-app-toast">
          <div className="toast-content">
            <strong>{toast.title}</strong>
            <p>{toast.body}</p>
          </div>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      <header className="rabbit-header">
        <span className="rabbit-icon">🐰</span>
        <h1 className="title">까먹지 마!</h1>
        <p className="subtitle">토끼가 당신의 할 일을 기억해줄게요</p>

        {pushSupported && pushPermission !== 'granted' && (
          <button className="push-allow-btn" onClick={subscribeUserToPush}>
            <BellPlus size={16} /> 푸시 알림 허용하기
          </button>
        )}
      </header>

      <hr className="header-divider" />

      <div className="user-info-box" style={{ width: '100%' }}>
        <span className="user-greeting">🐰 {currentUser.username}님의 할 일 기록장</span>
        <button onClick={handleLogout} className="logout-btn">로그아웃</button>
      </div>

      <main className="todo-container">

        <form className="input-group" onSubmit={handleOpenModal}>
          <input
            type="text"
            className="todo-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="새로운 할 일을 입력하세요..."
            maxLength={50}
          />
          <button type="submit" className="add-btn" aria-label="Add Todo Details">
            <Plus size={28} />
          </button>
        </form>

        {isLoading ? (
          <div className="empty-state">
            <p>토끼가 할 일을 불러오는 중이에요... 🥕</p>
          </div>
        ) : todos.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🥕</span>
            <p>아직 할 일이 없어요!<br />새로운 할 일을 추가해보세요.</p>
          </div>
        ) : (
          <motion.ul className="todo-list" layout>
            <AnimatePresence>
              {todos.map(todo => {
                const overdue = isOverdue(todo.due_date);
                const isCrossed = todo.is_completed || overdue;
                const hasTimeSet = Boolean(todo.due_date || todo.alarm_time);
                const isActiveTimed = hasTimeSet && !isCrossed;
                return (
                  <motion.li
                    key={todo.id}
                    className={`todo-item ${isCrossed ? 'completed' : ''} ${isActiveTimed ? 'active-timed' : ''}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ ease: "easeInOut", duration: 0.3 }}
                  >


                    <div className="todo-content">
                      <span className="todo-text" style={{ textDecoration: isCrossed ? 'line-through' : 'none', color: isCrossed ? '#a09292' : 'inherit' }}>{todo.title}</span>

                      <div className="todo-details">
                        <span className="todo-badge date-badge" title="작성일">
                          <Calendar size={12} />
                          {todo.created_at.split(' ')[0]}
                        </span>

                        {todo.due_date && (
                          <span className="todo-badge due-badge" title="마감일">
                            <CalendarDays size={12} />
                            마감: {formatDisplayDateTime(todo.due_date)}
                          </span>
                        )}

                        {todo.alarm_time && (
                          <span className="todo-badge alarm-badge" title="알람 설정 시간">
                            <Bell size={12} />
                            알람: {formatDisplayDateTime(todo.alarm_time)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      className="delete-btn"
                      onClick={() => deleteTodo(todo.id)}
                    >
                      <Trash2 size={20} />
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </main>

      {/* 모달 오버레이 */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="modal-overlay"
            onClick={() => setIsModalOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal-content"
              onClick={e => e.stopPropagation()}
              initial={{ y: 50, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            >
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={24} />
              </button>
              <h2 className="modal-title">상세 설정 🥕</h2>
              <p className="modal-preview">"{tempTodoTitle}"</p>

              <div className="modal-field">
                <label><CalendarDays size={18} /> 마감 기한 (선택)</label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-field">
                <label><Bell size={18} /> 푸시 알람 시간 (선택)</label>
                <input
                  type="datetime-local"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="modal-input alarm-input"
                />
              </div>

              <button className="modal-submit-btn" onClick={handleSaveTodo}>
                할 일 추가하기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="app-footer">
        Designed by BLUEFISH Corporation 2026.
      </footer>
    </div>
  )
}

export default App
