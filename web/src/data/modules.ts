// 交互模块的唯一真源：四个模块的 id / 文案 / 相机锚点 / 热点位置。
//
// 两个位置概念是解耦的，这点很关键：
//   anchor  —— 相机锚点，对应 me.glb 里的 `focus-*` 空对象，决定「相机飞到哪」。
//   hotspot —— 热点位置，决定「元素贴在形象的哪个位置」，用视口百分比表示。
// 两者互不影响，调整热点不需要回 Blender 重烘焙相机动画。
//
// 增删模块：只改本文件的 MODULES 数组 + 在 src/panels/ 里加对应面板组件，
// Scene.tsx / Hotspots.tsx / ModulePanel.tsx 都会自动跟随，无需改别处。

export const MODULE_IDS = ['profile', 'career', 'life', 'contact'] as const

export type ModuleId = (typeof MODULE_IDS)[number]

export interface HotspotSpec {
  /** hover / 聚焦时显示的标签 */
  label: string
  /** 桌面端坐标：视口百分比（0-100） */
  x: number
  y: number
  /**
   * 标签卡展开方向，缺省 'bottom'（挂在节点下方）。
   * 眼镜那个热点贴在脸上，卡片往下的位置正好是鼻子和嘴，挡住形象；
   * 改成 'top' 让它往上展开，避开脸部。
   */
  side?: 'top' | 'bottom'
  /**
   * 移动端覆盖坐标，缺省沿用桌面端。
   * 窄屏下相机会沿「焦点→相机」方向拉远 1.2 倍（见 Scene.tsx 的 mobilePullback），
   * 人物在画面里的占位与桌面端差别很大，共用一组坐标会明显错位，所以分开校准。
   */
  mobile?: { x: number; y: number }
}

export interface ModuleSpec {
  id: ModuleId
  /** 面板标题 */
  title: string
  /** 面板副标题 */
  subtitle: string
  /** 相机锚点：glb 内 `focus-*` 空对象名 */
  anchor: string
  /** 热点：挂在形象上的可点元素 */
  hotspot: HotspotSpec
}

// 顺序 = 时间轴顺序：模块 k 对应相机动画第 (k+1)·FRAMES_PER_NODE 帧。
//
// ⚠️ 校准前提：热点坐标是在「总览态」的画面上量的，而总览态的相机会被
// Scene.tsx 的 cam.overviewPullback 拉远（glb 烘焙的第 0 帧是脸部微距，
// 身体完全在画面外，热点无处可贴）。所以改 overviewPullback 后必须重新校准这里。
//
// 当前基线（overviewPullback = 1.7，2026-09-21 由 2.0 收紧一档，让主体更实）：
//   桌面 1440×900  眼镜 ~33% / 右肩外 ~55% / 胸口 ~66% / 左肩外 ~62%
//   移动 390×844   眼镜 ~34% / 右肩外 ~55% / 胸口 ~60% / 左肩外 ~58%
//
// 复核方式：`node scripts/cdp-shot.mjs <url> --probe` 直接读出四个热点在视口里的
// 实际百分比中心（热点是 HTML 层，不参与 3D 变换，读到的就是最终屏幕位置），
// 再对照截图上的目标部位微调。别用肉眼估读 —— 实测有 ±2% 的系统偏差。
//
// 换形象或调相机参数后需要重新校准，只改这里，不用回 Blender。
export const MODULES: readonly ModuleSpec[] = [
  {
    id: 'profile',
    title: '个人信息',
    subtitle: '关于我 · 项目与技能',
    anchor: 'focus-1',
    hotspot: { x: 50, y: 66, label: '工牌', mobile: { x: 50, y: 60 } },
  },
  {
    id: 'career',
    title: '实习与项目',
    subtitle: '从教育背景到项目经历',
    anchor: 'focus-2',
    hotspot: { x: 50, y: 33, label: '眼镜', side: 'top', mobile: { x: 50, y: 34 } },
  },
  {
    id: 'life',
    title: '兴趣与旅行',
    subtitle: '工作之外的我',
    anchor: 'focus-3',
    hotspot: { x: 63, y: 55, label: '背包', mobile: { x: 72, y: 55 } },
  },
  {
    id: 'contact',
    title: '联系方式',
    subtitle: '电话 · 邮箱 · GitHub',
    anchor: 'focus-4',
    hotspot: { x: 37, y: 62, label: '名片', mobile: { x: 30, y: 58 } },
  },
] as const

/** 模块 id → 时间轴索引（0 起）。Scene.tsx 用它把 active 映射成相机帧 */
export const MODULE_INDEX: Record<ModuleId, number> = MODULES.reduce(
  (acc, m, i) => {
    acc[m.id] = i
    return acc
  },
  {} as Record<ModuleId, number>
)

/** 总览态的时间轴索引，对应相机动画第 0 帧 */
export const OVERVIEW_INDEX = -1

/** 模块顺序（= 时间轴顺序），供面板导航用 */
export const MODULE_ORDER: readonly ModuleId[] = MODULES.map((m) => m.id)

export function getModule(id: ModuleId | null): ModuleSpec | null {
  if (!id) return null
  return MODULES.find((m) => m.id === id) ?? null
}
