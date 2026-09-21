// 3D 渲染器的 StageAdapter 实现。
//
// 职责只有两件：
//   1. setView —— 把模块 id 写进 store。Scene.tsx 每帧用 useStore.getState()
//      直读（不订阅）来决定相机目标帧，所以这里不产生任何 React 重渲染。
//   2. bindHotspotLayer —— 每帧把相机的鼠标视差位移同步到热点层根元素。
//      热点是 HTML 层、不参与 3D 变换，不同步的话相机一旋转就和形象脱开。
//
// 全程不引入 React state：热点层位移用 rAF 直接写 style.transform。

import { useStore } from '../store'
import type { ModuleId } from '../data/modules'
import type { StageAdapter } from './types'
import { parallax } from './parallax'

export function createScene3dAdapter(): StageAdapter {
  let el: HTMLElement | null = null
  let raf = 0
  let lastX = Number.NaN
  let lastY = Number.NaN

  const tick = () => {
    raf = requestAnimationFrame(tick)
    if (!el) return
    // 只在数值真的变了才写样式，避免每帧触发无谓的样式重算
    if (parallax.x !== lastX || parallax.y !== lastY) {
      lastX = parallax.x
      lastY = parallax.y
      el.style.transform = `translate3d(${parallax.x}%, ${parallax.y}%, 0)`
    }
  }

  return {
    setView(moduleId: ModuleId | null) {
      useStore.getState().setActive(moduleId)
    },
    bindHotspotLayer(next: HTMLElement | null) {
      el = next
      if (next && !raf) raf = requestAnimationFrame(tick)
      if (!next && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      return () => {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        el = null
      }
    },
  }
}

// 降级（无 WebGL2）用的适配器。
//
// 没有 3D 就没有相机视差、也没有「相机飞过去」，这两个能力都退化为空实现；
// 只保留 setView 把状态写进 store。热点层由 CSS 排成整齐的入口按钮
// （见 styles.css 的 .hotspots.is-flat），点击直接开面板。
export function createFlatAdapter(): StageAdapter {
  return {
    setView(moduleId: ModuleId | null) {
      useStore.getState().setActive(moduleId)
    },
    bindHotspotLayer() {
      return () => {}
    },
  }
}
