/** 比例小图标：形象化展示宽高比（计划书 §11.3 比例下拉，每项前放一个屏幕比例示意图） */
export function RatioIcon({ ratio }: { ratio: string }) {
  if (ratio === 'auto') {
    return <span className="nw-ratio-icon nw-ratio-auto">A</span>
  }
  const [wStr, hStr] = ratio.split(':')
  const w = Number(wStr) || 1
  const h = Number(hStr) || 1
  const scale = 14 / Math.max(w, h)
  const boxW = Math.max(4, Math.round(w * scale))
  const boxH = Math.max(4, Math.round(h * scale))
  return (
    <span className="nw-ratio-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
      <span style={{ width: boxW, height: boxH, border: '1.4px solid currentColor', borderRadius: 2, display: 'inline-block' }} />
    </span>
  )
}
