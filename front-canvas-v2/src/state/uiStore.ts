import { create } from 'zustand'
import { fetchBalance, readLocalBalance, writeLocalBalance } from '../services/creditsClient'

/** 左侧竖栏可打开的面板（§1.3 / §4 / §6）。null = 都关闭。 */
export type LeftPanel = 'assets' | 'presets' | 'history' | null

interface UiState {
  /** 左侧竖栏当前打开的面板 */
  activePanel: LeftPanel
  setActivePanel: (p: LeftPanel) => void
  togglePanel: (p: Exclude<LeftPanel, null>) => void

  /** agent 引导对话（右侧面板）开关，由左栏底部女娲球控制 */
  agentOpen: boolean
  toggleAgent: () => void
  setAgentOpen: (v: boolean) => void

  projectName: string
  setProjectName: (n: string) => void

  rechargeOpen: boolean
  setRechargeOpen: (v: boolean) => void

  /** 真实积分余额（§3）。source 标明数据来自后端还是本地账本。 */
  credits: number
  creditsSource: 'backend' | 'local' | 'unknown'
  refreshCredits: () => Promise<void>
  /** 生成真实发生时扣减积分（本地账本会持久化） */
  spendCredits: (amount: number) => void
  /** 充值成功后加积分（本轮支付占位，仅本地账本联动） */
  addCredits: (amount: number) => void

  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  activeDialogNodeId: string | null
  setActiveDialogNodeId: (id: string | null) => void

  fullscreenPromptNodeId: string | null
  setFullscreenPromptNodeId: (id: string | null) => void

  cumulativeCostCny: number
  addCumulativeCost: (cny: number) => void

  /** 左栏白色加号触发的"添加节点"菜单位置（屏幕坐标），null = 不显示 */
  railAddMenu: { x: number; y: number } | null
  setRailAddMenu: (p: { x: number; y: number } | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: null,
  setActivePanel: (p) => set({ activePanel: p }),
  togglePanel: (p) => set((s) => ({ activePanel: s.activePanel === p ? null : p })),

  agentOpen: false,
  toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
  setAgentOpen: (v) => set({ agentOpen: v }),

  projectName: '未命名画布',
  setProjectName: (n) => set({ projectName: n || '未命名画布' }),

  rechargeOpen: false,
  setRechargeOpen: (v) => set({ rechargeOpen: v }),

  credits: readLocalBalance(),
  creditsSource: 'unknown',
  refreshCredits: async () => {
    const result = await fetchBalance()
    set({ credits: result.balance, creditsSource: result.source })
  },
  spendCredits: (amount) =>
    set((s) => {
      const next = Math.max(0, Math.round(s.credits - amount))
      if (s.creditsSource !== 'backend') writeLocalBalance(next)
      return { credits: next }
    }),
  addCredits: (amount) =>
    set((s) => {
      const next = Math.max(0, Math.round(s.credits + amount))
      if (s.creditsSource !== 'backend') writeLocalBalance(next)
      return { credits: next }
    }),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  activeDialogNodeId: null,
  setActiveDialogNodeId: (id) => set({ activeDialogNodeId: id }),

  fullscreenPromptNodeId: null,
  setFullscreenPromptNodeId: (id) => set({ fullscreenPromptNodeId: id }),

  cumulativeCostCny: 0,
  addCumulativeCost: (cny) => set((s) => ({ cumulativeCostCny: Math.round((s.cumulativeCostCny + cny) * 100) / 100 })),

  railAddMenu: null,
  setRailAddMenu: (p) => set({ railAddMenu: p }),
}))

// 应用启动时拉一次真实余额（后端没有接口就落到本地账本）
void useUiStore.getState().refreshCredits()
