import type { ComponentType, SVGProps } from 'react'
import type { ModuleId } from '../data/modules'

// 热点实物图标。
//
// 交互层改造前，热点是一个发光白点 —— 用户看到的是「屏幕上有个点」，
// 而不是「形象身上挂着的东西」。这里把四个热点各自对应到形象上的一件实物：
//   个人信息 → 工牌 / 学历经历 → 眼镜 / 兴趣旅行 → 背包 / 联系方式 → 名片
// 图标本身不表达「点这里」，表达「这里有个东西」；可点性由外层的呼吸环与标签卡承担。
//
// 与 SocialIcons.tsx 同样是内联单色 SVG（currentColor），不引外部依赖。
// 统一 24×24 视口、线描风格、strokeWidth 1.8 —— 在 ~24px 渲染尺寸下仍能看清结构。
// （1.6 那版在浅绿背景 + 图片缩放的组合下会糊成一个深色圆点，看不出画的是什么。）

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function BadgeIcon(props: SVGProps<SVGSVGElement>) {
  // 工牌：挂绳孔 + 卡体 + 头像 + 两行信息
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="3.5" r="1.3" {...STROKE} />
      <rect x="5.6" y="5.6" width="12.8" height="15" rx="2.2" {...STROKE} />
      <circle cx="12" cy="10.4" r="2.1" {...STROKE} />
      <path d="M8.7 15.9h6.6M9.7 18.1h4.6" {...STROKE} />
    </svg>
  )
}

function GlassesIcon(props: SVGProps<SVGSVGElement>) {
  // 眼镜：双镜片 + 鼻梁 + 两条镜腿
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="7.3" cy="13.3" r="3.7" {...STROKE} />
      <circle cx="16.7" cy="13.3" r="3.7" {...STROKE} />
      <path d="M11 12.5c.5-.85 1.5-.85 2 0" {...STROKE} />
      <path d="M3.6 12.3 2.3 10.9M20.4 12.3l1.3-1.4" {...STROKE} />
    </svg>
  )
}

function BackpackIcon(props: SVGProps<SVGSVGElement>) {
  // 背包：提手 + 包体 + 分隔线 + 前袋
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9.3 7.3V6.1a2.7 2.7 0 0 1 5.4 0v1.2" {...STROKE} />
      <rect x="4.9" y="7.3" width="14.2" height="12.9" rx="3.3" {...STROKE} />
      <path d="M4.9 11.6h14.2" {...STROKE} />
      <rect x="8.7" y="14.3" width="6.6" height="4.9" rx="1.6" {...STROKE} />
    </svg>
  )
}

function CardIcon(props: SVGProps<SVGSVGElement>) {
  // 名片：卡体 + 头像位 + 三行信息
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.4" y="6.4" width="17.2" height="11.2" rx="2.1" {...STROKE} />
      <rect x="6.4" y="9.4" width="4" height="4" rx="1" {...STROKE} />
      <path d="M12.9 10.2h4.8M12.9 12.6h4.8M6.4 15.5h11.3" {...STROKE} />
    </svg>
  )
}

// 模块 → 实物图标。热点层按 module id 取，不用在数据层重复声明图标。
export const HOTSPOT_ICONS: Record<ModuleId, ComponentType<SVGProps<SVGSVGElement>>> = {
  profile: BadgeIcon,
  career: GlassesIcon,
  life: BackpackIcon,
  contact: CardIcon,
}
