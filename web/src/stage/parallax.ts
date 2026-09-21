// 渲染层与适配层之间的共享视差量。
//
// Scene.tsx 每帧写入（相机绕焦点做鼠标视差时，画面整体产生的位移），
// scene3d 适配器读取后同步到热点层 —— 这样 DOM 热点才能始终贴在 3D 形象上。
//
// 单独成文件是为了避免渲染层（Scene.tsx）与适配层（scene3d.ts）互相 import。
// 单位：视口百分比（x 相对视口宽、y 相对视口高），与 modules.ts 的热点坐标同一套单位。

export const parallax = { x: 0, y: 0 }

/** 供 2D 等其它实现复用的重置入口 */
export function resetParallax(): void {
  parallax.x = 0
  parallax.y = 0
}
