/** 本次操作预估费用（用于成本闸门文案）。
 *  诚实说明：后端目前不落库真实 token/费用（已在研究中确认），这里只能给出
 *  基于单价表的估算，UI 上一律标注"预估"而非"实际花费"，顶栏累计花费同理。 */

export const PRICE_TABLE = {
  'seedream-5.0-pro': { unit: '张', cny: 0.35 },
  'seedream-5.0-lite': { unit: '张', cny: 0.11 },
  'seedance-2.0': { unit: '8秒', cny: 7.99 },
  'seedance-2.0-fast': { unit: '8秒', cny: 5.5 },
  'seedance-2.0-lite': { unit: '8秒', cny: 4.2 },
  'm-deepseek': { unit: '次', cny: 0.02 },
} as const

export type PriceKey = keyof typeof PRICE_TABLE

export function estimateCost(model: PriceKey, count = 1): number {
  const row = PRICE_TABLE[model]
  if (!row) return 0
  return Math.round(row.cny * count * 100) / 100
}

export function useGenerationCost() {
  return { estimateCost, PRICE_TABLE }
}
