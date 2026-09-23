// 热点层：挂在 3D 形象上的可点元素。
//
// 位置来自 data/modules.ts 的 hotspot（视口百分比，桌面 / 移动各一组）。
// 渲染层通过 adapter.bindHotspotLayer 每帧同步相机的鼠标视差位移，
// 保证相机绕焦点旋转时热点始终贴在形象上、不会脱开。
//
// 每个热点 = 一件「实物」（工牌 / 眼镜 / 背包 / 名片），而不是一个发光点：
//   图标节点（实物）  —— 表达「这里有个东西」
//   呼吸环           —— 表达「这个东西可以点」
//   标签卡           —— 表达「点了会看到什么」
// 三者叠加，用户看到的是「形象身上挂着的物件」，而不是「屏幕上浮着的 UI」。
//
// 用 <button> 而不是 <div>：键盘可达、自带 role 与焦点样式。
// 命中区在样式里保证最小 44×44px（移动端可点性要求，见方案 5.4）。

import { useEffect, useRef, useState } from 'react'
import { MODULES } from '../data/modules'
import { useStore } from '../store'
import { HOTSPOT_ICONS } from './HotspotIcons'
import type { StageAdapter } from '../stage/types'

// 窄屏判定：断点与样式里的 @media (max-width: 640px) 保持一致。
// 窄屏下人物占位与桌面端不同，热点要换一组坐标（见 modules.ts 的 hotspot.mobile）。
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return narrow
}

export default function Hotspots({
  adapter,
  flat = false,
}: {
  adapter: StageAdapter
  /** 降级态（无 WebGL2）：没有 3D 形象可贴，改排成整齐的入口按钮 */
  flat?: boolean
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const active = useStore((s) => s.active)
  const hovered = useStore((s) => s.hovered)
  const setHovered = useStore((s) => s.setHovered)
  // 是否已交棒（加载遮罩开始淡出）。热点要等它置位后才开始入场：
  // 这里的位置是按「总览位」算的静态视口百分比（见下方 style 的 left/top），
  // 而交棒那一刻 Scene.tsx 的入场推近才刚开始把镜头从 1.4 倍距离拉回来 ——
  // 提前出现就会明显脱离形象。CSS 里的延迟（1.0s 起）就是按推镜时长配的。
  const entered = useStore((s) => s.entered)
  const narrow = useIsNarrow()
  const overview = active === null

  // 把根元素交给适配器：3D 实现每帧写入视差位移，2D / 降级实现什么都不做
  useEffect(() => adapter.bindHotspotLayer(layerRef.current), [adapter])

  return (
    <div
      className={
        'hotspots' +
        (overview ? '' : ' is-hidden') +
        (entered ? ' is-entered' : '') +
        (flat ? ' is-flat' : '')
      }
      ref={layerRef}
      aria-hidden={!overview}
    >
      {MODULES.map((m) => {
        const pos = narrow && m.hotspot.mobile ? m.hotspot.mobile : m.hotspot
        const Icon = HOTSPOT_ICONS[m.id]
        const side = m.hotspot.side ?? 'bottom'
        return (
          <button
            key={m.id}
            type="button"
            className={
              'hotspot' +
              (hovered === m.id ? ' is-hovered' : '') +
              (side === 'top' ? ' is-top' : '')
            }
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            tabIndex={overview ? 0 : -1}
            aria-label={`${m.hotspot.label} · ${m.title} —— ${m.subtitle}`}
            onClick={() => adapter.setView(m.id)}
            onMouseEnter={() => setHovered(m.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(m.id)}
            onBlur={() => setHovered(null)}
          >
            {/* 实物图标节点：玻璃底 + 线描图标；呼吸环叠在下面表示「可点」 */}
            <span className="hotspot-node" aria-hidden="true">
              <span className="hotspot-ring" />
              <span className="hotspot-icon">
                <Icon />
              </span>
            </span>

            {/* 标签卡：默认收起，hover / 焦点 / 窄屏时展开 */}
            <span className="hotspot-card" aria-hidden="true">
              <span className="hotspot-card-title">{m.title}</span>
              <span className="hotspot-card-sub">{m.subtitle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
