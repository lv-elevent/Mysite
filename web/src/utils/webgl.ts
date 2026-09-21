// WebGL2 能力检测（带缓存）。
//
// 背景：three.js r163+ 的 WebGLRenderer 只创建 `webgl2` 上下文，创建失败会直接
// throw new Error('Error creating WebGL context.')，**没有 WebGL1 回退**
// （见 three.module.js 中 `const contextName = 'webgl2'`）。
//
// 影响：在仅支持 WebGL1 的环境（例如 PC 微信内置浏览器，内核较旧）里，任何一处
// <Canvas> 挂载都会抛错。本项目没有 ErrorBoundary 兜底，React 会把整棵树卸载，
// 页面直接白屏——连 HTML 内容层都看不到。
//
// 所以：凡是可能挂 <Canvas> 的地方（App 的主场景、NoiseOverlay 的噪点层），
// 都必须先过这个检测；不支持时跳过该 Canvas，页面降级为纯内容层。
//
// 结果在会话内不会变化，故缓存复用，避免重复创建 canvas 元素。

let cached: boolean | null = null

export function hasWebGL2(): boolean {
  if (cached !== null) return cached
  if (typeof document === 'undefined') return (cached = false)
  try {
    cached = !!document.createElement('canvas').getContext('webgl2')
  } catch {
    cached = false
  }
  return cached
}
