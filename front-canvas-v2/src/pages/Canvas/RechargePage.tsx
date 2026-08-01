import { useState } from 'react'
import { Modal, message } from 'antd'
import { CloseOutlined, WechatOutlined, AlipayOutlined, CreditCardOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import './rechargePage.css'

interface Pkg {
  credits: number
  price: number
  bonus?: number
  tag?: string
  recommended?: boolean
}

const PACKAGES: Pkg[] = [
  { credits: 1000, price: 68 },
  { credits: 3000, price: 198, bonus: 300, tag: '推荐', recommended: true },
  { credits: 8000, price: 498, bonus: 1200 },
  { credits: 20000, price: 1198, bonus: 4000, tag: '超值' },
]

const PAY_METHODS = [
  { key: 'wechat', label: '微信支付', icon: <WechatOutlined /> },
  { key: 'alipay', label: '支付宝', icon: <AlipayOutlined /> },
  { key: 'card', label: '银行卡', icon: <CreditCardOutlined /> },
]

/** §7 充值页（照文字描述实现，暗色；设计图未随本轮附到）。套餐选择 / 金额计算 /
 *  余额联动真实；支付本轮占位（点立即支付弹"支付功能开发中"，不接真实支付、不加积分）。 */
export function RechargePage() {
  const open = useUiStore((s) => s.rechargeOpen)
  const setOpen = useUiStore((s) => s.setRechargeOpen)
  const credits = useUiStore((s) => s.credits)
  const creditsSource = useUiStore((s) => s.creditsSource)
  const [pkgIdx, setPkgIdx] = useState(1)
  const [pay, setPay] = useState('wechat')

  const pkg = PACKAGES[pkgIdx]
  const arrive = pkg.credits + (pkg.bonus ?? 0)
  const afterBalance = credits + arrive

  return (
    <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={560} closable={false} className="nw-recharge-modal">
      <div className="nw-recharge">
        <div className="nw-recharge-head">
          <div>
            <div className="nw-recharge-title">充值积分</div>
            <div className="nw-recharge-sub">积分用于生成图片、视频与配音，永久有效</div>
          </div>
          <button className="nw-icon-btn" onClick={() => setOpen(false)}>
            <CloseOutlined />
          </button>
        </div>

        <div className="nw-recharge-balance">
          <div>
            <div className="nw-recharge-balance-label">当前积分余额{creditsSource === 'local' ? '（本地账本）' : ''}</div>
            <div className="nw-recharge-balance-num">{credits}</div>
          </div>
          <button className="nw-recharge-records" onClick={() => message.info('充值记录：本轮占位')}>
            充值记录 ›
          </button>
        </div>

        <div className="nw-recharge-section-title">选择套餐</div>
        <div className="nw-recharge-pkgs">
          {PACKAGES.map((p, i) => (
            <div key={p.credits} className={`nw-recharge-pkg ${i === pkgIdx ? 'active' : ''} ${p.recommended ? 'recommended' : ''}`} onClick={() => setPkgIdx(i)}>
              {p.tag && <span className="nw-recharge-pkg-tag">{p.tag}</span>}
              <div className="nw-recharge-pkg-credits">{p.credits} 积分</div>
              {p.bonus ? <div className="nw-recharge-pkg-bonus">含赠 {p.bonus}</div> : <div className="nw-recharge-pkg-bonus">&nbsp;</div>}
              <div className="nw-recharge-pkg-price">¥{p.price}</div>
              <div className="nw-recharge-pkg-unit">¥{(p.price / p.credits).toFixed(3)}/积分</div>
            </div>
          ))}
        </div>

        <div className="nw-recharge-section-title">支付方式</div>
        <div className="nw-recharge-pays">
          {PAY_METHODS.map((m) => (
            <div key={m.key} className={`nw-recharge-pay ${pay === m.key ? 'active' : ''}`} onClick={() => setPay(m.key)}>
              <span className="nw-recharge-pay-icon">{m.icon}</span>
              {m.label}
            </div>
          ))}
        </div>

        <div className="nw-recharge-note">
          1 张图约 20 积分 · 1 页六格故事板约 30 积分 · 1 条 8 秒视频约 800 积分 · 1 段配音约 30 积分。积分不足时会在生成前提示，不会中途扣款。
        </div>

        <div className="nw-recharge-footer">
          <div className="nw-recharge-summary">
            应付 <b>¥{pkg.price}</b> · 到账 {arrive} 积分 · 充值后余额 {afterBalance}
          </div>
          <button className="nw-btn nw-recharge-pay-btn" onClick={() => message.info('支付功能开发中')}>
            立即支付
          </button>
        </div>
      </div>
    </Modal>
  )
}
