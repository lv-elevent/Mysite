// 全屏内容面板。
//
// 关闭方式统一收敛到 setActive(null)：Esc、点击遮罩、关闭按钮。
// 打开时锁定 body 滚动（记录原值，关闭时还原）并把焦点移到关闭按钮。
// 底部提供直达其它模块的跳转条，避免「关闭 → 再找热点」的往返。
//
// 时序编排（本轮重点）：
// 点热点 → 相机开始缓动飞向该部位（Scene 里 damping 0.1，约 0.9s 走完全程）。
// 如果面板同时立刻全屏展开，飞行过程会被完全盖住 —— 用户只看到「一闪就到了」。
// 所以这里把面板的进入拆成两拍：
//   遮罩 延迟 0.14s 淡入（且只到半透明 + 轻模糊，后面的形象仍可见）
//   面板 延迟 0.30s 淡入，0.54s 走完 → 完全展开时相机已基本到位
// 退出不加延迟，保证关闭是「立刻」的。

import { useEffect, useRef, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MODULE_ORDER, getModule, type ModuleId } from '../data/modules'
import { useStore } from '../store'
import ProfilePanel from '../panels/ProfilePanel'
import CareerPanel from '../panels/CareerPanel'
import LifePanel from '../panels/LifePanel'
import ContactPanel from '../panels/ContactPanel'

const PANELS: Record<ModuleId, ComponentType> = {
  profile: ProfilePanel,
  career: CareerPanel,
  life: LifePanel,
  contact: ContactPanel,
}

const EASE = [0.22, 1, 0.36, 1] as const

// 与相机飞行对齐的进入延迟（秒）。
// 改这两个值前先看 Scene.tsx 的 easeShot + shotDuration：机位过渡的时长按行程算
// （0.7–1.9s），进度曲线是「五次平滑 + t^0.7 前倾」，300ms 走 23%、600ms 走 61%。
// 面板压在这条曲线的前段上，才读得出「镜头飞过去、面板跟着铺开」。
const SCRIM_DELAY = 0.14
const SHELL_DELAY = 0.3

// 校准开关：?nopanel=1 时只驱动相机、不渲染面板。
// 热点坐标必须对着「相机停在第 N 帧」的画面来定，面板一挡就看不见形象了，
// 所以留这个口子。仅在 dev 构建下生效，生产构建里该参数无效。
const HIDE_PANEL =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('nopanel')

export default function ModulePanel() {
  const active = useStore((s) => s.active)
  const setActive = useStore((s) => s.setActive)
  const closeRef = useRef<HTMLButtonElement>(null)

  const spec = getModule(active)
  const Body = active ? PANELS[active] : null
  const show = !HIDE_PANEL

  // Esc 关闭
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, setActive])

  // 锁 body 滚动：记录原值而不是写死 'visible'，避免破坏别处对 body 的样式控制
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [active])

  // 面板打开时给 body 打标记：背景 3D 层据此轻微推近，制造「进入模块」的纵深
  useEffect(() => {
    document.body.classList.toggle('is-module-open', active !== null)
    return () => document.body.classList.remove('is-module-open')
  }, [active])

  // 焦点管理：打开时移到关闭按钮，保证键盘用户能立刻关闭
  useEffect(() => {
    if (active) closeRef.current?.focus()
  }, [active])

  return (
    <AnimatePresence>
      {show && spec && Body && (
        <motion.div
          className="panel"
          role="dialog"
          aria-modal="true"
          aria-label={spec.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          <motion.div
            className="panel-scrim"
            onClick={() => setActive(null)}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
            transition={{ duration: 0.44, delay: SCRIM_DELAY, ease: EASE }}
          />
          <motion.div
            className="panel-shell"
            initial={{ y: 34, opacity: 0, scale: 0.975 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.99, transition: { duration: 0.24, ease: EASE } }}
            transition={{ duration: 0.54, delay: SHELL_DELAY, ease: EASE }}
          >
            <header className="panel-head">
              <div className="panel-head-text">
                <h2 className="panel-title">{spec.title}</h2>
                <p className="panel-subtitle">{spec.subtitle}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="panel-close"
                onClick={() => setActive(null)}
                aria-label="关闭面板"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="panel-body">
              <Body />
            </div>

            <footer className="panel-foot">
              {MODULE_ORDER.filter((id) => id !== active).map((id) => {
                const m = getModule(id)
                if (!m) return null
                return (
                  <button key={id} type="button" className="panel-jump" onClick={() => setActive(id)}>
                    {m.title}
                  </button>
                )
              })}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
