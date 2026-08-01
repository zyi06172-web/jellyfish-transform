import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import CanvasPage from './pages/Canvas'

/** 第二轮修改单：UI 永久锁定暗色，antd 固定走 darkAlgorithm，不再有明暗切换。 */
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: '#0a84ff',
          borderRadius: 10,
          fontFamily: '-apple-system, "SF Pro", "PingFang SC", system-ui, sans-serif',
        },
      }}
    >
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/canvas/:projectId" element={<CanvasPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ConfigProvider>
  )
}
