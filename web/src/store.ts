import { create } from 'zustand'
import { MODULE_IDS, type ModuleId } from './data/modules'

// 支持用 ?module=<id> 直接打开某个模块。
// 用途有两个：一是无头截图验证时没法「点」，可以直接指定要看哪个模块；
// 二是将来做分享链接（把某个模块直接发给别人打开）。
function initialActive(): ModuleId | null {
  if (typeof window === 'undefined') return null
  const id = new URLSearchParams(window.location.search).get('module')
  if (!id) return null
  return (MODULE_IDS as readonly string[]).includes(id) ? (id as ModuleId) : null
}

// 全站交互状态。
//
// 改造前这里是「滚动驱动」时代留下的通用领域状态，一直没被真正用起来；
// 现在收敛为交互层的单一真源：
//   active     —— 当前展开的模块 id（null = 总览态）。Scene.tsx 每帧用 getState() 直读，
//                 不订阅，避免切换模块时整棵树重渲染。
//   hovered    —— 当前悬停的模块 id，用于热点与导航的高亮联动。
//   sceneReady —— 3D 场景是否已渲染出第一帧（Scene.tsx 置位）。
//                 ⚠️ 它与 useProgress 到 100 不是一回事：进度到 100 只说明 glb resolve 了，
//                 之后还有 scene.clone() + 251 帧机位预烘 + 着色器编译，全是同步阻塞，
//                 实测能再花 700ms。遮罩必须等这一帧再交棒，否则会在场景还是空的
//                 （只剩 canvas 底色）时就淡出，露一个黑色空档。
//   entered    —— 是否已交棒（= 遮罩开始淡出的那一刻）。热点层等它置位后才开始入场，
//                 否则热点会停在按「总览位」算的百分比坐标上，而那时镜头还在往总览位飞。
//   introWanted —— 交棒时是否做入场推近（用户要求减少动效 / ?intro=0 时为 false）。
interface StoreState {
  active: ModuleId | null
  hovered: ModuleId | null
  sceneReady: boolean
  entered: boolean
  introWanted: boolean
  setActive: (id: ModuleId | null) => void
  setHovered: (id: ModuleId | null) => void
  markSceneReady: () => void
  enter: (introWanted: boolean) => void
}

export const useStore = create<StoreState>((set) => ({
  active: initialActive(),
  hovered: null,
  sceneReady: false,
  entered: false,
  introWanted: false,
  setActive: (id) => set({ active: id }),
  setHovered: (id) => set({ hovered: id }),
  markSceneReady: () => set({ sceneReady: true }),
  enter: (introWanted) => set({ entered: true, introWanted }),
}))

// 开发期调试钩子：可在 console 用 __store.getState().setActive('profile')
declare global {
  interface Window {
    __store?: typeof useStore
  }
}
if (import.meta.env.DEV) window.__store = useStore
