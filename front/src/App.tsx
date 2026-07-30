import type React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import NotFound from './pages/NotFound'
import ProjectLobby from './pages/aiStudio/project/ProjectLobby'
import ProjectCanvasGallery from './pages/aiStudio/project/ProjectCanvasGallery'
import CanvasPage from './pages/Canvas'
import ProjectAssetLibraryPage from './pages/aiStudio/project/ProjectAssetLibraryPage'
import ProjectAssetLibraryEntry from './pages/aiStudio/project/ProjectAssetLibraryEntry'
import HotRanking from './pages/aiStudio/ranking/HotRanking'
import './App.css'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<ProjectLobby />} />
          <Route path="canvases" element={<ProjectCanvasGallery />} />
          <Route path="projects/:projectId" element={<CanvasPage />} />
          <Route path="projects/:projectId/asset-library" element={<ProjectAssetLibraryPage />} />
          <Route path="asset-library" element={<ProjectAssetLibraryEntry />} />
          <Route path="ranking" element={<HotRanking />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
