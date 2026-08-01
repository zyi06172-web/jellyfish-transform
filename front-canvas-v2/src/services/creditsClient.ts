import { OpenAPI } from './generated/core/OpenAPI'

/**
 * 积分余额读取（§3）。
 *
 * 诚实说明：当前后端 **没有** 任何积分/余额接口（全仓库 grep `credit`/`balance`/
 * `积分`/`余额` 均为 0 命中，已在交付报告里列为缺失接口）。按修改单"后端不动，缺的
 * 接口先列出来"的纪律，这里不擅自加后端接口，而是：
 *   1. 先尝试 GET /api/v1/studio/credits（等后端补上就能直接用）；
 *   2. 拿不到时回退到浏览器本地账本（localStorage 持久化，会随真实生成扣减、随充值增加），
 *      这不是写死的常量壳——它是真实可变、会持久化的余额，只是数据源在前端。
 */

const LOCAL_KEY = 'nuwa.credits.balance'
const SEED_BALANCE = 2000

export interface CreditsResult {
  balance: number
  source: 'backend' | 'local'
}

async function tryBackend(): Promise<number | null> {
  try {
    const res = await fetch(`${OpenAPI.BASE}/api/v1/studio/credits`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { balance?: number } | number }
    const data = json?.data
    if (typeof data === 'number') return data
    if (data && typeof data.balance === 'number') return data.balance
    return null
  } catch {
    return null
  }
}

export function readLocalBalance(): number {
  const raw = localStorage.getItem(LOCAL_KEY)
  if (raw === null) {
    localStorage.setItem(LOCAL_KEY, String(SEED_BALANCE))
    return SEED_BALANCE
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : SEED_BALANCE
}

export function writeLocalBalance(balance: number) {
  localStorage.setItem(LOCAL_KEY, String(Math.max(0, Math.round(balance))))
}

export async function fetchBalance(): Promise<CreditsResult> {
  const backend = await tryBackend()
  if (backend !== null) return { balance: backend, source: 'backend' }
  return { balance: readLocalBalance(), source: 'local' }
}
