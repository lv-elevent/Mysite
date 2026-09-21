// 渲染器无关的适配层契约。
//
// 交互层（Hotspots / ModulePanel / Overview）只依赖这个接口，不直接碰 three.js。
// 因此将来把 3D 形象换成 2D 插画时，只需新增一个实现（如 stage/flat2d.ts），
// 数据层、状态层、交互层、面板内容都不用改。

import type { ModuleId } from '../data/modules'

/** 热点在屏幕上的位置与可见性 */
export interface HotspotFrame {
  id: ModuleId
  /** 相对视口的百分比坐标，0-100 */
  x: number
  y: number
  /** 0-1，用于随相机远近缩放热点；2D 实现可恒为 1 */
  scale: number
  visible: boolean
}

export interface StageAdapter {
  /** 把视图切到某模块；传 null 表示回总览 */
  setView(moduleId: ModuleId | null): void
  /**
   * 绑定热点层的根元素，实现方可在每帧同步它的位移
   * （3D 实现用来跟随相机视差，2D 实现可以什么都不做）。
   * 返回解绑函数。
   */
  bindHotspotLayer(el: HTMLElement | null): () => void
}
