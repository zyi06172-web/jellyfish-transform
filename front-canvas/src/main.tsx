import React from 'react'
import ReactDOM from 'react-dom/client'
import './services/openapi'
import './styles/tokens.css'
import App from './App'

document.documentElement.setAttribute('data-theme', localStorage.getItem('nuwa.theme') ?? 'light')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
