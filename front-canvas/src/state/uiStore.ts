import { create } from 'zustand'
import type { CanvasType } from '../types/canvas'

export type ThemeMode = 'light' | 'dark'

interface SettingsState {
  apiKeyLabel: string
  showPerfMonitor: boolean
  autoLayout: boolean
  promptEnhanceModel: string
  downloadPath: string
  autoQualityCheck: boolean
  autoNodePlacement: boolean
  confirmEachStep: boolean
  modelPrefText: string
  modelPrefImage: string
  modelPrefVideo: string
}

interface UiState {
  theme: ThemeMode
  toggleTheme: () => void

  canvasType: CanvasType
  setCanvasType: (t: CanvasType) => void

  projectName: string
  setProjectName: (n: string) => void

  assetDrawerOpen: boolean
  toggleAssetDrawer: () => void

  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

  chatPanelOpen: boolean
  toggleChatPanel: () => void

  rechargeOpen: boolean
  setRechargeOpen: (v: boolean) => void

  credits: number

  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  activeDialogNodeId: string | null
  setActiveDialogNodeId: (id: string | null) => void

  fullscreenPromptNodeId: string | null
  setFullscreenPromptNodeId: (id: string | null) => void

  cumulativeCostCny: number
  addCumulativeCost: (cny: number) => void

  settings: SettingsState
  patchSettings: (patch: Partial<SettingsState>) => void

  ballPos: { x: number; y: number } | null
  setBallPos: (p: { x: number; y: number } | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: (localStorage.getItem('nuwa.theme') as ThemeMode) ?? 'light',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('nuwa.theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    }),

  canvasType: 'aigc',
  setCanvasType: (t) => set({ canvasType: t }),

  projectName: '未命名画布',
  setProjectName: (n) => set({ projectName: n || '未命名画布' }),

  assetDrawerOpen: false,
  toggleAssetDrawer: () => set((s) => ({ assetDrawerOpen: !s.assetDrawerOpen })),

  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),

  rechargeOpen: false,
  setRechargeOpen: (v) => set({ rechargeOpen: v }),

  credits: 320,

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  activeDialogNodeId: null,
  setActiveDialogNodeId: (id) => set({ activeDialogNodeId: id }),

  fullscreenPromptNodeId: null,
  setFullscreenPromptNodeId: (id) => set({ fullscreenPromptNodeId: id }),

  cumulativeCostCny: 0,
  addCumulativeCost: (cny) => set((s) => ({ cumulativeCostCny: Math.round((s.cumulativeCostCny + cny) * 100) / 100 })),

  settings: {
    apiKeyLabel: '',
    showPerfMonitor: false,
    autoLayout: true,
    promptEnhanceModel: 'm-deepseek',
    downloadPath: '~/Downloads/nuwa',
    autoQualityCheck: true,
    autoNodePlacement: true,
    confirmEachStep: true,
    modelPrefText: 'm-deepseek',
    modelPrefImage: 'seedream-5.0-pro',
    modelPrefVideo: 'seedance-2.0',
  },
  patchSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  ballPos: null,
  setBallPos: (p) => set({ ballPos: p }),
}))
