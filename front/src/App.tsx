import type React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import ProjectLobby from './pages/aiStudio/project/ProjectLobby'
import ProjectWorkbench from './pages/aiStudio/project/ProjectWorkbench'
import RoleDetailPage from './pages/aiStudio/project/ProjectWorkbench/RoleDetailPage'
import ChapterStudio from './pages/aiStudio/chapter/ChapterStudio'
import AssetManager from './pages/aiStudio/asset-library/AssetManager'
import ActorAssetEditPage from './pages/aiStudio/asset-library/ActorAssetEditPage.tsx'
import SceneAssetEditPage from './pages/aiStudio/asset-library/SceneAssetEditPage.tsx'
import PropAssetEditPage from './pages/aiStudio/asset-library/PropAssetEditPage.tsx'
import CostumeAssetEditPage from './pages/aiStudio/asset-library/CostumeAssetEditPage.tsx'
import PromptTemplateManager from './pages/aiStudio/prompts/PromptTemplateManager'
import FileManager from './pages/aiStudio/files/FileManager'
import VideoEditor from './pages/aiStudio/editor/VideoEditor'
import AgentManagement from './pages/aiStudio/agents/AgentManagement'
import AgentEdit from './pages/aiStudio/agents/AgentEdit.tsx'
import ModelManagement from './pages/aiStudio/models/ModelManagement'
import { ChapterShotsPage } from './pages/aiStudio/shots/ChapterShotsPage'
import { ChapterShotEditPage } from './pages/aiStudio/shots/ChapterShotEditPage'
import CommunityTV from './pages/aiStudio/community/CommunityTV'
import './App.css'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<ProjectLobby />} />
          <Route path="projects/:projectId" element={<ProjectWorkbench />} />
          <Route path="projects/:projectId/roles/:characterId/edit" element={<RoleDetailPage />} />
          <Route path="projects/:projectId/chapters/:chapterId/prep/*" element={<Navigate to="../shots" replace />} />
          <Route path="projects/:projectId/chapters/:chapterId/studio" element={<ChapterStudio />} />
          <Route path="projects/:projectId/chapters/:chapterId/shots/:shotId/edit" element={<ChapterShotEditPage />} />
          <Route path="projects/:projectId/chapters/:chapterId/shots" element={<ChapterShotsPage />} />
          <Route path="projects/:projectId/chapters/:chapterId/prep-drafts" element={<Navigate to="../shots" replace />} />
          <Route path="projects/:projectId/editor" element={<VideoEditor />} />
          <Route path="asset-library" element={<AssetManager />} />
          <Route path="asset-library/actors/:actorImageId/edit" element={<ActorAssetEditPage />} />
          <Route path="asset-library/scenes/:sceneId/edit" element={<SceneAssetEditPage />} />
          <Route path="asset-library/props/:propId/edit" element={<PropAssetEditPage />} />
          <Route path="asset-library/costumes/:costumeId/edit" element={<CostumeAssetEditPage />} />
          <Route path="prompts" element={<PromptTemplateManager />} />
          <Route path="files" element={<FileManager />} />
          <Route path="agents/:id/edit" element={<AgentEdit />} />
          <Route path="agents" element={<AgentManagement />} />
          <Route path="models" element={<ModelManagement />} />
          <Route path="settings" element={<Settings />} />
          <Route path="community-tv" element={<CommunityTV />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
