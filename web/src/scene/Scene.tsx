import { Suspense, useMemo, useRef, useEffect, type MutableRefObject } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import Env from './Env'
import { FOCUS_POINTS, FRAMES_PER_NODE } from '../data/focusPoints'
import { MODULE_INDEX, OVERVIEW_INDEX } from '../data/modules'
import { useStore } from '../store'
import { parallax } from '../stage/parallax'

useGLTF.preload(`${import.meta.env.BASE_URL}models/me.glb`)

// 聚焦锚点（glb 内 focus-* 空对象），顺序对应履历节点；名单是唯一真源，见 data/focusPoints.ts
const POINTS = FOCUS_POINTS as readonly string[]
const M = POINTS.length // 时间轴节点数（= 履历条数），从名单推导，不写死
const RESUME_FRAMES = M * FRAMES_PER_NODE // 时间轴帧数：每节点 FRAMES_PER_NODE 帧（模块 k → 第 k·50 帧）
const FPS = 24 // 所有 clip @24fps 共享时间轴

// 机位过渡的进度曲线：五次平滑（两端速度、加速度都为 0）叠加一个轻微前倾 t^0.7。
//
// 为什么不是纯 smootherstep：它起步太黏 —— 前 300ms 只走 5%，而面板的入场延迟是
// 0.14s / 0.3s（ModulePanel.tsx），结果面板先盖上来、镜头再在背后飞完，观感是「点完没反应」。
// 为什么不是一阶缓动（`frame += Δ·a`）：那种缓动起步瞬间速度最大，一大段行程会在头 100ms
// 走完，看上去就是「切了一下」—— 这正是原来「两个机位硬切」的来源。
// 前倾后峰值速度只从 1.875×平均 升到 1.81×平均（几乎没变，只是峰值位置从 t=0.5 前移到 t=0.3），
// 300ms 的进度从 5% 提到 23%，600ms 从 38% 提到 61%。
const easeShot = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1)
  const u = Math.pow(t, 0.7)
  return u * u * u * (u * (u * 6 - 15) + 10)
}

/**
 * 一台机位：相机停在某个整数帧时的姿态（世界坐标）。
 * body 是同一帧上人物自身的朝向（glb 的 `man` 节点）。
 *
 * 为什么要把机位预烘成表，而不是让相机沿帧轴滑过去：
 * me.glb 烘焙的运镜是「绕脸巡游」，第 0 帧 → 第 200 帧之间相机累计转了约 213°
 * （净转角只有 55°），人物自身还转了整整一圈（330°）。沿帧轴滑过去 = 把这段
 * 巡游按 5 倍速播一遍，实测峰值 31°/帧，观感就是两个机位硬切。
 * 改成在「出发机位」和「目标机位」之间直接插值后，峰值降到 1.25°/帧。
 */
interface Shot {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  body: THREE.Quaternion
}

// 上下渐变背景球（包裹相机），两端颜色可调
function GradientBackground() {
  // glb 相机视角很窄(~23°)，只看到渐变中间一条；陡度把可见窄带拉伸出完整过渡
  const top = '#6f906f'
  const bottom = '#dbd3b5'
  const steep = 1.4

  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSteep: { value: 1 },
    }),
    []
  )
  uniforms.uTop.value.set(top)
  uniforms.uBottom.value.set(bottom)
  uniforms.uSteep.value = steep

  return (
    <mesh scale={100}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          uniform float uSteep;
          varying vec3 vDir;
          void main() {
            // 以地平线(y=0)为中心按陡度拉伸，narrow-fov 下也能看到完整过渡
            float t = clamp(vDir.y * uSteep * 0.5 + 0.5, 0.0, 1.0);
            gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
          }
        `}
      />
    </mesh>
  )
}

// 所有光源（HDRI 环境 + 半球 + 主/补方向光）
function Lights() {
  const c = {
    envIntensity: 0.85,
    hemiIntensity: 1.15,
    hemiSky: '#ffffff',
    hemiGround: '#404040',
    keyIntensity: 2.35,
    keyColor: '#ffd9c6',
    keyPos: [5, 8, 5] as [number, number, number],
    fillIntensity: 2.25,
    fillColor: '#9fc6ff',
    fillPos: [-5, 4, -4] as [number, number, number],
  }

  return (
    <>
      <Env
        intensity={c.envIntensity}
        rotationX={0}
        rotationY={0}
        rotationZ={0}
        asBackground={false}
        bgIntensity={0.4}
        bgBlur={0}
      />
      <hemisphereLight args={[c.hemiSky, c.hemiGround, c.hemiIntensity]} />
      <directionalLight
        position={c.keyPos}
        intensity={c.keyIntensity}
        color={c.keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={c.fillPos} intensity={c.fillIntensity} color={c.fillColor} />
    </>
  )
}

// me.glb：模型 + glb 自带相机动画（滚动分 5 段擦除）+ 自动对焦 + 眼睛跟随
function Man2({
  focusRef,
  frameRef,
  dofBokehRef,
  dofRangeRef,
}: {
  focusRef: MutableRefObject<THREE.Vector3>
  frameRef: MutableRefObject<number>
  dofBokehRef: MutableRefObject<number>
  dofRangeRef: MutableRefObject<number>
}) {
  const posX = 0
  const posY = 0.4
  const posZ = -0.7
  const scale = 2.25
  const rotationY = 0

  // mobilePullback：移动端相机沿「焦点→相机」方向拉远的倍率（1 = 不变，1.2 = 远 20%）
  // mobileTimelineShift：移动端「时间轴阶段」相机水平位移，单位=视距占比（正=左移，负=右移，0=关）
  const cam = {
    // 相机过渡的缓动与时长不在配置里：由预烘机位表 + smootherstep 决定，
    // 时长按两台机位之间的行程算（见 shotDuration）。改这里没用。
    // 鼠标视差最大角度（度）
    parallax: 4,
    parallaxEase: 0.1,
    mobilePullback: 1.2,
    mobileTimelineShift: 0.12,
    // 总览态相机拉远倍率。
    // me.glb 烘焙的运镜是「脸部贴纸巡游」：第 0 帧停在脸部微距，后面几帧在
    // 眼睛、脸颊、鼻梁之间移动（focus 锚点全部落在 x ±0.21 / y 0.26–0.49 的头部范围内）。
    // 也就是说身体上的东西 —— 工牌、背包、名片 —— 在任何一帧都不在画面里。
    // 这里在总览态沿「焦点→相机」方向整体拉远，露出上半身，让热点有处可贴；
    // 进入模块时平滑归零，把构图交回 glb 的运镜。
    //
    // 2.0 → 1.7：人物在画面里偏小、留白偏多，收紧一档让主体更实。
    // ⚠️ 改这个值必须重新校准 data/modules.ts 的 hotspot 坐标（桌面 + 移动各一组），
    //    本次已同步校准。
    overviewPullback: 1.7,
  }

  const eye = {
    enabled: true,
    gain: 3,
    maxYaw: 15,
    maxPitch: 8,
    invertX: false,
    invertY: false,
    smooth: 0.44,
    crossEye: 45,
    crossRadius: 0.25,
  }

  const get = useThree((s) => s.get)
  const { scene, animations } = useGLTF(`${import.meta.env.BASE_URL}models/me.glb`)

  // 克隆模型；收集眼睛对象、聚焦锚点对象、glb 自带相机、各锚点景深开关
  const { model, eyes, points, startPoint, glbCam, manNode, dof } = useMemo(() => {
    const clone = scene.clone(true)
    const eyes: any[] = []
    const pmap: Record<string, any> = {}
    let startPoint: any = null
    let glbCam: any = null
    let focusNode: any = null
    // 人物根节点：manAction 只动它一个（整段 0→97 帧转了一整圈）。
    // 过渡时要把它的朝向也拉成直线插值，否则人物会在镜头飞行途中高速自转。
    let manNode: any = null
    clone.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
      if (o.isCamera) glbCam = o
      if (o.name === 'man') manNode = o
      // 首页锚点：兼容旧名 focus-start 与 intro3d 统一命名 focus-0
      if (o.name === 'focus-start' || o.name === 'focus-0') startPoint = o
      if (o.name === 'focus-works') focusNode = o
      if (POINTS.includes(o.name)) pmap[o.name] = o
      if (/eye/i.test(o.name)) {
        // 平滑着色：重算平滑顶点法线 + 关闭 flatShading
        if (o.isMesh) {
          o.geometry.computeVertexNormals()
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m: any) => {
            m.flatShading = false
            m.needsUpdate = true
          })
        }
        eyes.push({ obj: o, base: o.quaternion.clone(), x: o.position.x })
      }
    })
    // 按本地 x 定左右：最左眼 sx=-1、最右眼 sx=+1，用于斗鸡眼内转方向
    if (eyes.length > 1) {
      const xs = eyes.map((e) => e.x)
      const min = Math.min(...xs)
      const max = Math.max(...xs)
      const mid = (min + max) / 2
      eyes.forEach((e) => {
        e.sx = e.x < mid ? -1 : 1
      })
    } else {
      eyes.forEach((e) => (e.sx = 0))
    }
    const glassesParent = eyes[0]?.obj.parent
    if (eyes.length >= 2 && glassesParent === eyes[1]?.obj.parent) {
      const left = eyes[0].obj.position
      const right = eyes[1].obj.position
      const eyeDistance = left.distanceTo(right)
      const glasses = new THREE.Group()
      const center = left.clone().add(right).multiplyScalar(0.5)
      const frameRadius = eyeDistance * 0.4
      const frameTube = eyeDistance * 0.04
      const frameMaterial = new THREE.MeshStandardMaterial({
        color: '#171717',
        metalness: 0.25,
        roughness: 0.28,
      })
      const rimGeometry = new THREE.TorusGeometry(frameRadius, frameTube, 12, 32)
      const leftRim = new THREE.Mesh(rimGeometry, frameMaterial)
      const rightRim = new THREE.Mesh(rimGeometry, frameMaterial)
      leftRim.position.x = -eyeDistance / 2
      rightRim.position.x = eyeDistance / 2
      glasses.add(leftRim, rightRim)

      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(eyeDistance * 0.24, frameTube * 2, frameTube * 2),
        frameMaterial
      )
      glasses.add(bridge)

      glasses.position.copy(center)
      glasses.position.z += eyeDistance * 0.35
      glasses.name = 'generated-glasses'
      glassesParent.add(glasses)
    }
    const pts = POINTS.map((n) => pmap[n] || null)
    // 作品区锚点：优先 focus-works（旧 glb）；缺省（intro3d 统一命名不导）则复用末时间轴节点 focus-M。
    const works = focusNode || pts[pts.length - 1] || null
    // 首页锚点：focus-start / focus-0；都没有则回退首个时间轴节点。
    const start = startPoint || pts[0] || null
    // 逐锚点景深参数（intro3d 导出写入 userData/extras）：dofBokeh 虚化强度、dofFocusRange 清晰范围、
    // dofEnabled 开关（关→有效 bokeh 记 0）。has=false（老 glb 无这些字段）→ Post2 走原全局帧混合，行为不变。
    const ud = (o: any): any => o?.userData ?? {}
    const hasDofParams = [...pts, start, works].some((o) => ud(o).dofBokeh !== undefined)
    const effBokeh = (o: any): number => (ud(o).dofEnabled === false ? 0 : (ud(o).dofBokeh ?? 0))
    const effRange = (o: any): number => ud(o).dofFocusRange ?? 0
    return {
      model: clone,
      eyes,
      points: pts,
      startPoint: start,
      glbCam,
      manNode,
      focusNode: works,
      dof: {
        has: hasDofParams,
        bokeh: pts.map(effBokeh),
        range: pts.map(effRange),
        startBokeh: effBokeh(start),
        startRange: effRange(start),
        worksBokeh: effBokeh(works),
        worksRange: effRange(works),
      },
    }
  }, [scene])

  // 预烘的机位表：下标 = 帧号（0…RESUME_FRAMES），由下面那个 effect 填。
  const shots = useRef<Shot[]>([])
  // 过渡状态：在「出发机位」和「目标机位」之间插值。
  // 出发端每次都取「当前实际所在的位置」（baseCur/quatCur/bodyCur），
  // 所以中途再点别的模块也是接力，不会跳。
  const shot = useRef({
    baseFrom: new THREE.Vector3(),
    quatFrom: new THREE.Quaternion(),
    bodyFrom: new THREE.Quaternion(),
    baseTo: new THREE.Vector3(),
    quatTo: new THREE.Quaternion(),
    bodyTo: new THREE.Quaternion(),
    frameFrom: 0,
    frameTo: 0,
    pullFrom: cam.overviewPullback,
    pullTo: cam.overviewPullback,
    baseCur: new THREE.Vector3(),
    quatCur: new THREE.Quaternion(),
    bodyCur: new THREE.Quaternion(),
    frameCur: 0,
    pullCur: cam.overviewPullback,
    // k = 原始进度 0→1；dur = 本次过渡时长（秒）；target = 当前目标帧（用于识别换目标）
    k: 1,
    dur: 1,
    target: 0,
    ready: false,
  })

  // 动画混合器：把全部 clip（manAction + CameraAction）都挂上，逐帧设 time + update(0) 擦除
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const actions = useRef<any[]>([])
  useEffect(() => {
    if (!animations || animations.length === 0) return
    mixer.stopAllAction()
    actions.current = animations.map((clip) => {
      const a = mixer.clipAction(clip)
      a.play()
      a.paused = true
      return { action: a, duration: clip.duration }
    })
    // 逐整数帧烘一遍相机与人物姿态（只跑一次，RESUME_FRAMES+1 ≈ 251 次 update(0)）。
    // 必须在这里做：运行时拿不到 R3F 的相机对象（store 没挂到 canvas 上），
    // 只能靠 mixer 擦除到指定帧后 decompose 出世界变换。
    const table: Shot[] = []
    if (glbCam) {
      const p = new THREE.Vector3()
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3()
      for (let f = 0; f <= RESUME_FRAMES; f++) {
        const t = f / FPS
        for (const { action: act, duration } of actions.current) act.time = Math.min(t, duration)
        mixer.update(0)
        glbCam.updateWorldMatrix(true, false)
        glbCam.matrixWorld.decompose(p, q, s)
        table.push({
          pos: p.clone(),
          quat: q.clone(),
          body: manNode ? manNode.quaternion.clone() : new THREE.Quaternion(),
        })
      }
      // 复位到第 0 帧，避免首帧闪一下
      for (const { action: act } of actions.current) act.time = 0
      mixer.update(0)
    }
    shots.current = table
    shot.current.ready = false
    return () => {
      mixer.stopAllAction()
      actions.current = []
      shots.current = []
    }
  }, [mixer, animations, glbCam, manNode])

  // 不切换激活相机（避免后处理 CoC 缓存旧相机 near/far 导致整体糊）。
  // 改为每帧把 glb 相机的世界变换 + fov 拷到默认相机上。

  // window 级鼠标输入（smouse 为缓动后的值）
  const mouse = useRef({ x: 0, y: 0 })
  const smouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // 移动端 / 触屏（无鼠标可跟随）：关闭眼睛跟随，眼睛保持默认朝向。
  // 判定 = 触屏指针 或 窄视口（≤640px，与移动端样式断点一致）。
  const isMobile = useRef(
    typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches === true ||
        window.innerWidth <= 640)
  )

  // 复用对象，避免每帧分配
  const posA = useRef(new THREE.Vector3())
  const posB = useRef(new THREE.Vector3())

  const tmpEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const tmpQuat = useRef(new THREE.Quaternion())
  const desiredQuat = useRef(new THREE.Quaternion())
  const tmpVec = useRef(new THREE.Vector3())

  // 拷贝 glb 相机世界变换用
  const camPos = useRef(new THREE.Vector3())
  const camQuat = useRef(new THREE.Quaternion())
  const camScl = useRef(new THREE.Vector3())
  const paraEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const paraQuat = useRef(new THREE.Quaternion())

  // 过渡时长按「行程」定：位置距离（世界单位）+ 角度（度）× 0.06 折算。
  // 定长会让相邻机位之间慢吞吞、跨越全场的又太急；按行程给时长，观感速度才一致。
  const shotDuration = () => {
    const st = shot.current
    const posDist = st.baseFrom.distanceTo(st.baseTo)
    const angDeg = THREE.MathUtils.radToDeg(st.quatFrom.angleTo(st.quatTo))
    return THREE.MathUtils.clamp(0.55 + (posDist + angDeg * 0.06) * 0.075, 0.7, 1.9)
  }

  useFrame((_, dt) => {
    // 1) 交互驱动：目标时间轴索引直接由 store 的 active 决定
    //    （总览 = -1 → 第 0 帧；模块 k → 第 (k+1)·FRAMES_PER_NODE 帧）
    //    用 getState() 直读而不是订阅：切换模块不触发整棵树重渲染。
    const activeId = useStore.getState().active
    const sTarget = activeId ? MODULE_INDEX[activeId] : OVERVIEW_INDEX
    const frameTarget = THREE.MathUtils.clamp((sTarget + 1) * FRAMES_PER_NODE, 0, RESUME_FRAMES)

    // 2) 机位过渡：在「出发机位」和「目标机位」之间插值（位置 lerp + 朝向 slerp）。
    //    不再让相机沿帧轴滑过中间所有机位 —— 那段是「绕脸巡游」，滑过去就是硬切。
    const st = shot.current
    if (!st.ready) {
      // 机位表刚烘好：把出发端与当前值钉在第 0 帧，避免首帧从原点弹出去。
      // 表还没烘好（首帧）就什么都不做 —— 下面相机会走实时 decompose 兜底，不会闪。
      const s0 = shots.current[0]
      if (s0) {
        st.baseFrom.copy(s0.pos)
        st.quatFrom.copy(s0.quat)
        st.bodyFrom.copy(s0.body)
        st.baseTo.copy(s0.pos)
        st.quatTo.copy(s0.quat)
        st.bodyTo.copy(s0.body)
        st.baseCur.copy(s0.pos)
        st.quatCur.copy(s0.quat)
        st.bodyCur.copy(s0.body)
        st.frameFrom = st.frameTo = st.frameCur = 0
        st.pullFrom = st.pullTo = st.pullCur = cam.overviewPullback
        st.target = 0
        st.ready = true
      }
    }
    if (frameTarget !== st.target) {
      // 换目标：以「当前实际所在的位置」为新的出发点接力，中途再点别的模块也是连续变向
      st.target = frameTarget
      st.baseFrom.copy(st.baseCur)
      st.quatFrom.copy(st.quatCur)
      st.bodyFrom.copy(st.bodyCur)
      st.frameFrom = st.frameCur
      st.pullFrom = st.pullCur
      const dest = shots.current[frameTarget]
      if (dest) {
        st.baseTo.copy(dest.pos)
        st.quatTo.copy(dest.quat)
        st.bodyTo.copy(dest.body)
      }
      st.frameTo = frameTarget
      // 总览 → 拉远露出上半身；任一模块 → 归零，构图交回 glb 运镜
      st.pullTo = frameTarget === 0 ? cam.overviewPullback : 1
      st.k = 0
      st.dur = shotDuration()
    }
    // 单帧步长上限 50ms：切模块时会挂面板（React 渲染 + 二维码解码），实测能卡到 110ms。
    // 不封顶的话那一帧会一口气推进 8% 的进度，看上去就是「跳了一下」——
    // 缓动本身再平滑也救不了。封顶后卡顿只会让过渡稍慢一点，不会跳。
    const step = Math.min(dt, 0.05)
    st.k = Math.min(1, st.k + step / Math.max(0.1, st.dur))
    const k = easeShot(st.k)
    st.frameCur = st.frameFrom + (st.frameTo - st.frameFrom) * k
    st.pullCur = st.pullFrom + (st.pullTo - st.pullFrom) * k
    st.baseCur.lerpVectors(st.baseFrom, st.baseTo, k)
    st.quatCur.copy(st.quatFrom).slerp(st.quatTo, k)
    st.bodyCur.copy(st.bodyFrom).slerp(st.bodyTo, k)
    const frame = st.frameCur

    // 所有 clip 共享时间轴：time = frame/FPS，各自钳到自身时长
    // （较短的 clip 播完后保持末帧，相机 clip CameraAction 走满 totalFrames）
    if (actions.current.length) {
      const t = frame / FPS
      for (const { action: act, duration } of actions.current) {
        act.time = Math.min(t, duration)
      }
      mixer.update(0)
    }
    // 人物朝向同样走直线插值：glb 里 manAction 在第 0→97 帧让角色转了整整一圈，
    // 跟着时间轴走的话，镜头飞行途中人物会高速自转（还能看到后脑勺）。
    // 必须在 mixer.update(0) 之后覆盖 —— 否则会被 clip 重新写回去。
    // 没有烘焙动画时不要动它，保持 glb 里的静态朝向。
    if (manNode && shots.current.length) manNode.quaternion.copy(st.bodyCur)
    if (frameRef) frameRef.current = frame

    // 履历段用于对焦的连续索引：由平滑后的帧反推，确保对焦与镜头同步
    const s = THREE.MathUtils.clamp(frame / FRAMES_PER_NODE - 1, -1, M - 1)

    // 3) 自动对焦：作品区跟随 glb focus-works 空对象；履历区按 focus 锚点插值
    //    （在 mixer.update 之后取世界坐标，保证与当前帧一致）
    if (focusRef) {
      if (s < 0 && startPoint && points[0]) {
        startPoint.getWorldPosition(posA.current)
        points[0].getWorldPosition(posB.current)
        focusRef.current.lerpVectors(posA.current, posB.current, THREE.MathUtils.clamp(s + 1, 0, 1))
      } else {
        const sc = THREE.MathUtils.clamp(s, 0, M - 1)
        const iA = Math.floor(sc)
        const iB = Math.min(iA + 1, M - 1)
        const f = sc - iA
        if (points[iA] && points[iB]) {
          points[iA].getWorldPosition(posA.current)
          points[iB].getWorldPosition(posB.current)
          focusRef.current.lerpVectors(posA.current, posB.current, f)
        }
      }
    }

    // 3b) 景深：glb 带逐锚点参数（intro3d 导出）时，沿当前连续索引在相邻锚点间插值 bokeh/focusRange，
    //     写入 refs 供 Post2 直接采用（忠实还原 intro3d）；无参数（老 glb）则写哨兵 -1 → Post2 走原全局帧混合。
    if (dofBokehRef && dofRangeRef) {
      if (!dof.has) {
        dofBokehRef.current = -1
      } else {
        const sample = (arr: number[], sv: number): number => {
          if (s < 0) return THREE.MathUtils.lerp(sv, arr[0] ?? sv, THREE.MathUtils.clamp(s + 1, 0, 1))
          const sc = THREE.MathUtils.clamp(s, 0, M - 1)
          const iA = Math.floor(sc)
          const iB = Math.min(iA + 1, M - 1)
          return THREE.MathUtils.lerp(arr[iA] ?? 0, arr[iB] ?? 0, sc - iA)
        }
        dofBokehRef.current = sample(dof.bokeh, dof.startBokeh)
        // focusRange 按模型 group 缩放折算到世界单位（scene 被放大 scale 倍，清晰范围需同比放大才与 intro3d 观感一致）。
        dofRangeRef.current = sample(dof.range, dof.startRange) * scale
      }
    }

    // 2b) 拷贝 glb 相机世界变换到默认相机，并绕焦点做轨道式鼠标视差（焦点屏幕位置不变）
    const camera: any = get().camera
    if (glbCam && camera.isPerspectiveCamera) {
      // 机位姿态取自预烘表（上面已按 k 插值好）。
      // 表为空（glb 没有烘焙动画）时退回实时 decompose，行为与旧版一致。
      if (shots.current.length) {
        camPos.current.copy(st.baseCur)
        camQuat.current.copy(st.quatCur)
      } else {
        glbCam.updateWorldMatrix(true, false)
        glbCam.matrixWorld.decompose(camPos.current, camQuat.current, camScl.current)
      }
      // 鼠标缓动：无限趋近目标值
      const me = 1 - Math.pow(cam.parallaxEase, dt)
      smouse.current.x += (mouse.current.x - smouse.current.x) * me
      smouse.current.y += (mouse.current.y - smouse.current.y) * me
      const ax = THREE.MathUtils.degToRad(cam.parallax)
      paraEuler.current.set(-smouse.current.y * ax, -smouse.current.x * ax, 0)
      paraQuat.current.setFromEuler(paraEuler.current)
      // 绕焦点旋转相机位置 + 同步旋转朝向 → 焦点不动，仅四周产生视差
      tmpVec.current
        .copy(camPos.current)
        .sub(focusRef.current)
        .applyQuaternion(paraQuat.current)
      // 移动端沿「焦点→相机」方向整体拉远：焦点屏幕位置不变，主体更小、留白更多。
      // 总览态同样拉远（overviewPullback，已按过渡进度插值），两者相乘 —— 手机上首屏离得更远。
      tmpVec.current.multiplyScalar(st.pullCur)
      if (isMobile.current) tmpVec.current.multiplyScalar(cam.mobilePullback)
      tmpVec.current.add(focusRef.current)
      camera.position.copy(tmpVec.current)
      camera.quaternion.multiplyQuaternions(paraQuat.current, camQuat.current)
      // 移动端「时间轴阶段」把镜头整体左移，让主体从满宽文字后错开。
      // 权重：从 Hero 渐入(s: -0.8→0.3)、进入作品区随 smoothOff 渐出 → 无跳变。
      if (isMobile.current && cam.mobileTimelineShift !== 0) {
        const tlWeight = THREE.MathUtils.smoothstep(s, -0.8, 0.3)
        if (tlWeight > 0) {
          // translateX 沿局部 +X（屏幕右）；取负 → 相机左移
          const dist = camera.position.distanceTo(focusRef.current)
          camera.translateX(-dist * cam.mobileTimelineShift * tlWeight)
        }
      }
      if (camera.fov !== glbCam.fov) {
        camera.fov = glbCam.fov
        camera.updateProjectionMatrix()
      }

      // 2c) 把鼠标视差换算成热点层的屏幕位移（视口百分比），供 stage/scene3d 每帧同步。
      //     热点是 HTML 层、不参与 3D 变换，不同步的话相机一旋转就和形象脱开。
      //     小角度近似：位移 ≈ 旋转角 / 相机视角；焦点处不动，整体按平移处理。
      const fovRad = THREE.MathUtils.degToRad(camera.fov || 23)
      const aspect = window.innerWidth / Math.max(1, window.innerHeight)
      parallax.x = ((smouse.current.x * ax) / (fovRad * aspect)) * 100
      parallax.y = ((-smouse.current.y * ax) / fovRad) * 100

      // 开发期把相机状态挂到 window.__scene，供 scripts/cdp-camera-trace.mjs 逐帧读。
      // 为什么要开这个口子：R3F 没把 store 挂到 canvas 上（只有 __reactFiber），
      // 运行时拿不到相机对象，「镜头过渡连不连贯」这类问题就只能靠猜。
      // 生产构建里 import.meta.env.DEV 是静态 false，整段会被摇掉。
      if (import.meta.env.DEV) {
        const dbg: any = (window as any).__scene ?? ((window as any).__scene = { n: 0 })
        dbg.n++
        dbg.frame = frame
        dbg.k = st.k
        dbg.pull = st.pullCur
        dbg.dt = dt
        dbg.pos = camera.position.toArray()
        dbg.quat = camera.quaternion.toArray()
        dbg.focus = focusRef.current.toArray()
      }
    }

    // 4) 眼睛跟随（用当前激活相机做屏幕投影）；移动端 / 触屏则跳过
    if (!eye.enabled || eyes.length === 0 || isMobile.current) return
    const sx = eye.invertX ? -1 : 1
    const sy = eye.invertY ? -1 : 1

    let ax = 0
    let ay = 0
    for (const e of eyes) {
      e.obj.getWorldPosition(tmpVec.current).project(camera)
      ax += tmpVec.current.x
      ay += tmpVec.current.y
    }
    ax /= eyes.length
    ay /= eyes.length

    const mx = mouse.current.x - ax
    const my = mouse.current.y - ay
    const yawBase = sx * mx * THREE.MathUtils.degToRad(eye.maxYaw) * eye.gain
    const pitch = sy * -my * THREE.MathUtils.degToRad(eye.maxPitch) * eye.gain

    const dist = Math.hypot(mx, my)
    const convWeight = THREE.MathUtils.clamp(1 - dist / eye.crossRadius, 0, 1)
    const convRad = THREE.MathUtils.degToRad(eye.crossEye) * convWeight

    for (const e of eyes) {
      const yaw = yawBase - e.sx * convRad
      tmpEuler.current.set(pitch, yaw, 0)
      tmpQuat.current.setFromEuler(tmpEuler.current)
      desiredQuat.current.copy(tmpQuat.current).multiply(e.base)
      e.obj.quaternion.slerp(desiredQuat.current, eye.smooth)
    }
  })

  return (
    <group
      position={[posX, posY, posZ]}
      rotation={[0, (rotationY * Math.PI) / 180, 0]}
      scale={scale}
    >
      <primitive object={model} />
    </group>
  )
}

// 后处理：DepthOfField → Bloom → SMAA。
// DoF 焦点逐帧跟随 focusRef（自动对焦）；30–220 帧间收紧清晰范围、加大虚化。
function Post2({
  focusRef,
  frameRef,
  dofBokehRef,
  dofRangeRef,
}: {
  focusRef: MutableRefObject<THREE.Vector3>
  frameRef: MutableRefObject<number>
  dofBokehRef: MutableRefObject<number>
  dofRangeRef: MutableRefObject<number>
}) {
  const post = {
    bloomIntensity: 0.6,
    bloomThreshold: 0.82,
    dof: true,
    startBokeh: 7.4,
    startRange: 2.0,
    focusBokeh: 11.0,
    focusRange: 0.15,
    startBlendFrame: 48,
    endBlendFrame: RESUME_FRAMES - 50, // 末节点附近回到"起始帧"景深档（原 250−50=200）
  }

  const dofRef = useRef<any>(null)
  useFrame(() => {
    const e = dofRef.current
    if (!e) return
    if (e.target && focusRef) e.target.copy(focusRef.current)
    // 权重 w=1 用"开始帧档"，w=0 用"聚焦点档"。
    // 开头(f→0)和末节点(f→RESUME_FRAMES)都取开始帧档；中间各节点取聚焦点档。
    const f = frameRef ? frameRef.current : 0
    const wStart = 1 - THREE.MathUtils.smoothstep(f, 0, post.startBlendFrame)
    const wEnd = THREE.MathUtils.smoothstep(f, post.endBlendFrame, RESUME_FRAMES)
    const w = Math.max(wStart, wEnd)
    if (dofBokehRef && dofBokehRef.current >= 0) {
      // glb 自带逐锚点景深参数（intro3d 导出）：直接采用，忠实还原 intro3d 的虚化强度/清晰范围（bokeh=0 即该点关景深）。
      e.bokehScale = dofBokehRef.current
      if (e.cocMaterial) e.cocMaterial.focusRange = Math.max(1e-4, dofRangeRef ? dofRangeRef.current : post.focusRange)
    } else {
      // 老 glb（无逐锚点参数）：沿用原全局帧混合档位。
      e.bokehScale = THREE.MathUtils.lerp(post.focusBokeh, post.startBokeh, w)
      if (e.cocMaterial) e.cocMaterial.focusRange = THREE.MathUtils.lerp(post.focusRange, post.startRange, w)
    }
  })

  return (
    <EffectComposer multisampling={0} stencilBuffer={false} depthBuffer>
      {(post.dof ? (
        <DepthOfField
          ref={dofRef}
          target={[0, 1.3, 0]}
          worldFocusRange={post.focusRange}
          bokehScale={post.focusBokeh}
          height={480}
        />
      ) : null) as any}
      <Bloom
        mipmapBlur
        intensity={post.bloomIntensity}
        luminanceThreshold={post.bloomThreshold}
        luminanceSmoothing={0.3}
      />
      <SMAA />
    </EffectComposer>
  )
}

// 场景根组件：展示 me.glb（相机由 glb 动画 + 滚动驱动）
export default function Scene() {
  const focusRef = useRef(new THREE.Vector3(0, 1.3, 0))
  const frameRef = useRef(0)
  // 逐锚点景深（intro3d 导出的 glb 携带）：Man2 每帧写、Post2 读。dofBokeh=-1 表示无参数 → Post2 走旧全局混合。
  const dofBokehRef = useRef(-1)
  const dofRangeRef = useRef(0.15)
  return (
    <>
      <GradientBackground />

      <Suspense fallback={null}>
        <Lights />
        <Man2 focusRef={focusRef} frameRef={frameRef} dofBokehRef={dofBokehRef} dofRangeRef={dofRangeRef} />
      </Suspense>

      <Post2 focusRef={focusRef} frameRef={frameRef} dofBokehRef={dofBokehRef} dofRangeRef={dofRangeRef} />
    </>
  )
}
