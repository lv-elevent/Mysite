import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useStore } from '../store'

// 加载遮罩：深色底 + 一个字标 + 它下面的进度线，然后交棒给 3D 场景。
//
// 两条时间轴，方向一致，读起来是一次连续的「从暗处飞进场景」：
//   1) 遮罩里的字标块（.ls-lockup）推近放大 + 淡出，300ms 里只有前 28%（≈84ms）
//      看得见 —— 本文件只管触发，动画写在 styles.css 的 ls-lockup-out，
//      挂在 .is-hidden 上（基准时刻 = 交棒）。为什么这么短：见那边的注释，
//      太长会与场景里的 .overview 名字块并存，同屏读出两个「Lv Guoqing」；
//   2) Scene.tsx 的相机推镜，1150ms，从 1.4 倍距离沿 easeShot 滑进总览位。
//
// ⚠️ 遮罩里只有「一个整体」在动。2026-09-22 那版堆了取景框、扫描线、线稿人形、
//    四个热点，被否掉：「只不过是把所有的堆叠到一起了」。别再往回加 ——
//    遮罩里每多一个独立元素，「进入」就弱一分。
//
// ⚠️ 字标不是装饰，是必需品：加载期（实测场景首帧落在 2.0~2.5s —— glb 加载 +
//    251 帧机位预烘 + 着色器编译）屏幕上能动的只有幕布和进度线，而幕布是纯色、
//    放大看不出运动。没有字标就只剩一条 2px 的线，
//    2026-09-23 被老大一眼看成「开场动画没了，只剩一个进度条」。
//
// ⚠️ FADE_MS 是「推镜能不能被看见」的关键参数，不是随便定的：
//    easeShot 是前倾曲线（t^0.7），推镜前 40% 的行程集中在开头。
//    淡出取 600ms 时，等遮罩让开推镜已经走完 70%，用户只看到最后 30% ——
//    2026-09-23 实测就是这么读成「淡入」的。压到 360ms 后可见行程从 30% 提到 61%。
//    改这个值必须同步 .loading-screen 的 transition 时长。
//
// 底色与 body / Canvas 的 #0a0e16 一致：遮罩出现前是 body 在撑，色值不同会闪一下。

// 遮罩保持全不透明的最短时长：加载太快时也要让深色底站住一下，否则一闪而过像闪屏。
const MIN_MS = 600

// 资源就绪后、以及场景出第一帧后，各再等一小会儿才交棒。
// 前者是给 R3F 留出首帧的时间，后者是让首帧之后再多走几帧（着色器编译可能还没完）。
const SETTLE_MS = 150

// 淡出时长（毫秒），必须与 .loading-screen 的 transition 一致。
// 短于 Scene.tsx 的 INTRO_PULL_MS（1150）是有意的：遮罩先让开，
// 镜头再在清晰的画面里收完剩下的行程 —— 这样「进入」在遮罩消失后还在继续。
const FADE_MS = 360

// 兜底放行：资源迟迟加载不完（网络异常）时也强制进场。
// 没有这层保护，一次失败的请求就是一块永远擦不掉的遮罩。
const MAX_WAIT_MS = 12000

// ?intro=1 强制播放、?intro=0 强制跳过（调试用，生产构建同样生效）。
// 曾经的 SEEN_KEY（会话内只播一次）已删除，原因见下面 pushIntro 处的注释。

export default function LoadingScreen() {
  const { progress } = useProgress()
  const [hiding, setHiding] = useState(false) // 开始淡出
  const [removed, setRemoved] = useState(false) // 彻底卸载
  const [forced, setForced] = useState(false) // 兜底放行
  const [readyAt, setReadyAt] = useState<number | null>(null) // 资源就绪的时刻
  const startedAt = useRef(performance.now())
  const enter = useStore((s) => s.enter)

// 是否做入场推近。两件事会让它跳过：参数显式关闭、用户要求减少动效。
// 注意只影响「推不推镜」—— 遮罩的淡出任何时候都要做。
//
// ⚠️ 2026-09-23 删掉了原来的「同一会话只播一次」门禁（sessionStorage['intro-seen']）。
//    理由：本站在会话内**没有任何页面级导航**（热点是 SPA 内切换，不重新加载），
//    所以那个门禁唯一会触发的场合就是「用户主动刷新」—— 恰恰是最想看动画的时候。
//    实测后果：第 2 次加载推镜只剩 162ms（等于没有），看上去像「开场动画被删了」。
//    代价也不对等：真实访客通常只加载一次，门禁对他们几乎从不生效，
//    却让「刷新一下」变成「动画坏了」。所以去掉，行为变成可预期的「每次都播」。
const [pushIntro] = useState(() => {
  const flag = new URLSearchParams(window.location.search).get('intro')
  if (flag === '1') return true
  if (flag === '0') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
})

  const ready = progress >= 100 || forced
  // 场景渲染出第一帧才算真的可以看。⚠️ 不能用 progress >= 100 代替 —— 那只说明 glb
  // resolve 了，之后还有 clone + 251 帧机位预烘 + 着色器编译（实测约 700ms 同步阻塞）。
  // 不等它，遮罩会在场景还是空的时候就开始淡出，露一个黑色空档。
  const sceneReady = useStore((s) => s.sceneReady)
  const canGo = (ready && sceneReady) || forced

  useEffect(() => {
    const id = setTimeout(() => setForced(true), MAX_WAIT_MS)
    return () => clearTimeout(id)
  }, [])

  // 记录「两个都就绪」的时刻（只记一次，后续抖动不改）
  useEffect(() => {
    if (canGo && readyAt === null) setReadyAt(performance.now())
  }, [canGo, readyAt])

  // 交棒：取「最短停留」与「就绪后留一点余量」中更晚的那个，到点后开始淡出，
  // 并通知 Scene.tsx 可以做入场推近了（它的起始时刻由 Scene 自己记，见那边注释）。
  useEffect(() => {
    if (readyAt === null) return
    const sinceMount = performance.now() - startedAt.current
    const target = Math.max(MIN_MS, readyAt - startedAt.current + SETTLE_MS)
    const id = setTimeout(
      () => {
        setHiding(true)
        enter(pushIntro)
      },
      Math.max(0, target - sinceMount)
    )
    return () => clearTimeout(id)
  }, [readyAt, pushIntro, enter])

  useEffect(() => {
    if (!hiding) return
    const id = setTimeout(() => setRemoved(true), FADE_MS)
    return () => clearTimeout(id)
  }, [hiding])

  if (removed) return null

  const pct = Math.min(Math.max(progress, 0), 100)

  return (
    <div className={`loading-screen${hiding ? ' is-hidden' : ''}`} aria-hidden="true">
      {/* 加载期唯一的视觉重心：字标 + 它下面的进度线，两者作为**一个整体**运动。
          ⚠️ 别再往里加东西 —— 2026-09-22 那版堆了取景框 / 扫描线 / 线稿人形 / 四个热点，
          被否成「把所有的堆叠到一起了」。这里只有一个整体。

          为什么需要字标：加载期场景还没渲染出来，幕布又是纯色（放大看不出动），
          屏幕上能承载「视觉重心」的只有它。交棒时整体推近放大 + 淡出
          （styles.css 的 ls-lockup-out），与 Scene.tsx 的相机推镜同向 ——
          字标冲过眼前消失、场景显形、镜头继续推进，是一次连续的前进。

          进度线用真实加载进度驱动（transition 抹平分批加载的跳变），不做假进度：
          它慢就是在慢，快就是在快。 */}
      <div className="ls-lockup">
        <div className="ls-mark">
          <span className="ls-mark-name">Lv Guoqing</span>
          <span className="ls-mark-role">AI Agent · AI 应用开发</span>
        </div>
        <div className="ls-bar">
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>
    </div>
  )
}
