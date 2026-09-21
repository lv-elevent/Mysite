import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from './scene/Scene'
import NoiseOverlay from './ui/NoiseOverlay'
import LoadingScreen from './ui/LoadingScreen'
import Overview from './ui/Overview'
import Hotspots from './ui/Hotspots'
import ModulePanel from './ui/ModulePanel'
import { createFlatAdapter, createScene3dAdapter } from './stage/scene3d'
import { useStore } from './store'
import { hasWebGL2 } from './utils/webgl'

// 点击 3D 空白处回到总览（等价于面板的关闭动作）
function Backdrop() {
  const setActive = useStore((s) => s.setActive)
  return (
    <mesh position={[0, 0, -40]} onClick={() => setActive(null)}>
      <planeGeometry args={[600, 300]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export default function App() {
  // WebGL2 能力检测：three.js r163+ 无 WebGL1 回退，不支持时挂 Canvas 会抛错，
  // 且本项目没有 ErrorBoundary，整棵树会被卸载成白屏。详见 utils/webgl.ts。
  const [webgl2Ok] = useState(() => hasWebGL2())

  // 适配器只创建一次，承担两件事：把 active 写进 store（视图切换）、
  // 每帧把相机视差同步到热点层。具体实现由渲染方式决定（3D / 降级），
  // 交互层不需要知道区别 —— 这正是把渲染层与交互层解耦的意义。
  const adapter = useMemo(
    () => (webgl2Ok ? createScene3dAdapter() : createFlatAdapter()),
    [webgl2Ok]
  )

  return (
    <>
      {/* 加载遮罩：模型全部加载完成前覆盖全屏，完成后淡出。
          降级（无 WebGL2）时必须跳过——没有 Canvas 就不会有加载进度，
          遮罩会一直停在初始值、永久挡住下面的内容 */}
      {webgl2Ok && <LoadingScreen />}

      {/* 固定背景层。
          WebGL2 可用时挂 3D 场景；不可用时换成同色 CSS 渐变兜底。
          兜底是必要的：正常态的浅绿渐变由 WebGL 的 GradientBackground 渐变球渲染，
          Canvas 一没了，整页就只剩 body 的近黑底色，手机上看着就是「黑屏」。
          两层复用同一个 .scene-bg（fixed 满屏、z-index 0）。 */}
      {webgl2Ok ? (
        <div className="scene-bg">
          <Canvas
            shadows={{ type: THREE.PCFShadowMap }}
            dpr={[1, 1.5]}
            camera={{ position: [0, 5, 19], fov: 39, near: 0.1, far: 500 }}
            gl={{ antialias: false, stencil: false, depth: true, toneMapping: THREE.ACESFilmicToneMapping }}
          >
            <color attach="background" args={['#0a0e16']} />
            <Suspense fallback={null}>
              <Backdrop />
              <Scene />
            </Suspense>
          </Canvas>
        </div>
      ) : (
        <div className="scene-bg scene-bg--fallback" aria-hidden="true" />
      )}

      {/* 首屏装饰：发丝内框 + 四角定位标 + 角标元数据。
          交互驱动下没有滚动，所以不再随滚动淡出，恒显示。 */}
      <div className="hero-chrome" aria-hidden="true">
        <div className="hero-frame" />
        <span className="hero-mark tl">+</span>
        <span className="hero-mark tr">+</span>
        <span className="hero-mark bl">+</span>
        <span className="hero-mark br">+</span>
        <div className="hero-meta hm-tl">
          <span className="hm-name">Lv Guoqing 吕国庆</span>
          <span>AI Agent Developer</span>
        </div>
        <div className="hero-meta hm-tr">Resume — 2026</div>
        <div className="hero-meta hm-bl">Python · Go · React</div>
        <div className="hero-meta hm-right">Open to AI roles</div>
      </div>

      {/* 全屏胶片噪点蒙层（multiply 混合） */}
      <NoiseOverlay />

      {/* 总览层：姓名 + 「点击形象上的元素」引导，打开面板时淡出 */}
      <main className="content">
        <Overview />
      </main>

      {/* 热点层：挂在形象上的可点元素，位置由 data/modules.ts 定义 */}
      <Hotspots adapter={adapter} flat={!webgl2Ok} />

      {/* 全屏内容面板：active 非空时出现 */}
      <ModulePanel />
    </>
  )
}
