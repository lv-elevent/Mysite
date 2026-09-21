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
//   active  —— 当前展开的模块 id（null = 总览态）。Scene.tsx 每帧用 getState() 直读，
//              不订阅，避免切换模块时整棵树重渲染。
//   hovered —— 当前悬停的模块 id，用于热点与导航的高亮联动。
//   entered —— 是否已通过入场（保留给加载完成后的入场动效）。
interface StoreState {
  active: ModuleId | null
  hovered: ModuleId | null
  entered: boolean
  setActive: (id: ModuleId | null) => void
  setHovered: (id: ModuleId | null) => void
  enter: () => void
}

export const useStore = create<StoreState>((set) => ({
  active: initialActive(),
  hovered: null,
  entered: false,
  setActive: (id) => set({ active: id }),
  setHovered: (id) => set({ hovered: id }),
  enter: () => set({ entered: true }),
}))

// 开发期调试钩子：可在 console 用 __store.getState().setActive('profile')
declare global {
  interface Window {
    __store?: typeof useStore
  }
}
if (import.meta.env.DEV) window.__store = useStore
