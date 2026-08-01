import React from 'react'
import ReactDOM from 'react-dom/client'
import './services/openapi'
import './styles/tokens.css'
import App from './App'

// 第二轮修改单：UI 永久锁定暗色，不再提供浅色切换。
document.documentElement.setAttribute('data-theme', 'dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
