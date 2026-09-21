import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'

// 全屏开场动画：取景器校准 → 人物线稿描出 → 四个热点依次点亮 → 交棒给总览层。
//
// 为什么是这套动作（而不是一个转圈）：
//   1. 发丝内框 + 四角定位标与首屏的 .hero-chrome 用同一套尺寸（--m）和同一位置，
//      淡出时「取景器」是留在原地交棒，视觉上没有断裂感。
//   2. 线稿上的四个热点位置对应 me.glb 里四个 focus-* 锚点贴的部位，
//      它们亮起来本身就在告诉第一次来的人「这个形象身上有东西可以点」——
//      这正是总览层那句引导文字要传达的信息，用动画先讲一遍比只给文字有效。
//
// 用 CSS 过渡 + setTimeout 控制淡出/卸载（不依赖 rAF，后台/离屏也可靠）。

// 开场动画的最短总时长（毫秒）。
// ⚠️ 与 styles.css 里 ls-* 的关键帧时间轴强耦合，改一边必须同步另一边：
//   四角标 0/80/160/240ms → 扫描线 100–720ms → 线稿 300–1150ms
//   → 四个热点 1150/1300/1450/1600ms → 状态行 1650ms
const INTRO_MS = 1900

// 淡出时长（毫秒），与 .loading-screen 的 transition 一致
const FADE_MS = 550

// 资源就绪后的停顿（毫秒）：让「四个热点全亮」这个高光时刻被看清再淡出
const HOLD_MS = 240

// 兜底放行：资源迟迟加载不完（网络异常）时也强制进场。
// 没有这层保护，一次失败的请求就是一块永远擦不掉的遮罩。
const MAX_WAIT_MS = 12000

// 会话内只播一次：首次访问播完整开场，同一会话内再进来（刷新 / 后退）直接跳过，
// 让「仪式感」只付一次成本。
// ?intro=1 强制播放、?intro=0 强制跳过（调试用，生产构建同样生效）。
const SEEN_KEY = 'intro-seen'

// 人物线稿上的四个热点，坐标是 .ls-figure 的 viewBox 内的用户单位。
//
// viewBox 是 "18 4 164 296"（不是 0 0 360 420）：原画布留了大片空白，
// 图形只占中间一小块，渲染出来比真实角色小一大截，淡出交棒时会有一次
// 明显的「由小变大」跳变。收紧到线稿外扩 8 单位后图形填满元素。
//
// 四点的相对布局照抄总览里真实热点的位置关系（modules.ts 的 hotspot）：
//   眼镜 50%/33%（上中）· 工牌 50%/66%（中）· 背包 63%/55%（右）· 名片 37%/62%（左）
// 不直接做视口百分比换算 —— 真实热点有的落在形象轮廓之外（背包挂在身后的包上），
// 换算过来会跑到线稿外面。这里只在轮廓内取解剖学上对应的部位，保持同样的疏密关系。
// 顺序 = 点亮顺序。
const SPOTS = [
  { id: 'glasses', x: 100, y: 84 }, // 脸部 → 实习与项目
  { id: 'badge', x: 100, y: 244 }, // 胸口 → 个人信息
  { id: 'backpack', x: 128, y: 216 }, // 右肩 → 兴趣与旅行
  { id: 'card', x: 70, y: 234 }, // 左胸 → 联系方式
] as const

// 热点逐个点亮的起始时间（秒），与 styles.css 里 ls-spot-in 的延迟一致
const SPOT_START = 1.15
const SPOT_STEP = 0.15

export default function LoadingScreen() {
  const { progress } = useProgress()
  const [hiding, setHiding] = useState(false) // 开始淡出
  const [removed, setRemoved] = useState(false) // 彻底卸载
  const [forced, setForced] = useState(false) // 兜底放行
  const startedAt = useRef(performance.now())

  // 是否播完整开场。三件事会让它跳过：参数显式关闭、本会话已播过、用户要求减少动效。
  const [playIntro] = useState(() => {
    const flag = new URLSearchParams(window.location.search).get('intro')
    if (flag === '1') return true
    if (flag === '0') return false
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return false
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // 无痕模式等场景下 sessionStorage 不可用：退化成「每次都播」，不影响功能
    }
    return true
  })

  const ready = progress >= 100 || forced

  useEffect(() => {
    const id = setTimeout(() => setForced(true), MAX_WAIT_MS)
    return () => clearTimeout(id)
  }, [])

  // 最短时长：开场动画必须播完，哪怕资源早就加载好了（本地 glb 只要 0.3s）
  const [introDone, setIntroDone] = useState(!playIntro)
  useEffect(() => {
    if (!playIntro) return
    const left = INTRO_MS - (performance.now() - startedAt.current)
    if (left <= 0) {
      setIntroDone(true)
      return
    }
    const id = setTimeout(() => setIntroDone(true), left)
    return () => clearTimeout(id)
  }, [playIntro])

  // 两个条件都满足 → 停顿 → 淡出 → 卸载（一次性，锁定不受后续进度变化影响）
  useEffect(() => {
    if (!ready || !introDone) return
    const t1 = setTimeout(() => setHiding(true), HOLD_MS)
    const t2 = setTimeout(() => setRemoved(true), HOLD_MS + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [ready, introDone])

  if (removed) return null

  const pct = Math.min(Math.max(progress, 0), 100)

  return (
    <div
      className={`loading-screen${playIntro ? '' : ' is-static'}${hiding ? ' is-hidden' : ''}`}
      aria-hidden="true"
    >
      <div className="ls-frame" />
      <span className="ls-mark tl" />
      <span className="ls-mark tr" />
      <span className="ls-mark bl" />
      <span className="ls-mark br" />
      {playIntro && <div className="ls-scan" />}

      <svg className="ls-figure" viewBox="18 4 164 296">
        <defs>
          {/* 描边用的纵向渐变：躯干下缘淡出。
              线稿是「半身像」，底部必然被裁一刀；硬切口看着像没画完，
              淡出则读成「全息投影正在成形」，和扫描线是同一套语汇。
              userSpaceOnUse 而不是默认的 objectBoundingBox：
              要让淡出位置钉在用户坐标 y=252（躯干下缘），与元素实际尺寸无关。 */}
          <linearGradient id="ls-stroke" x1="0" y1="4" x2="0" y2="300" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f4f1ea" stopOpacity="0.55" />
            <stop offset="0.84" stopColor="#f4f1ea" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f4f1ea" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="ls-outline"
          pathLength={100}
          d="M26 300C26 240 50 186 78 176L78 152C70 150 62 148 58 142C46 124 42 102 42 74C42 34 66 12 100 12C134 12 158 34 158 74C158 102 154 124 142 142C138 148 130 150 122 152L122 176C150 186 174 240 174 300"
        />
        {SPOTS.map((s, i) => {
          const delay = `${SPOT_START + i * SPOT_STEP}s`
          return (
            <g className="ls-spot" key={s.id} style={{ animationDelay: delay }}>
              <circle className="ls-spot-ring" cx={s.x} cy={s.y} r="13" style={{ animationDelay: delay }} />
              <circle className="ls-spot-disc" cx={s.x} cy={s.y} r="9" />
              <circle className="ls-spot-dot" cx={s.x} cy={s.y} r="3" />
            </g>
          )
        })}
      </svg>

      <p className="ls-hint">正在校准形象</p>

      {/* 进度条用真实加载进度驱动（transition 抹平分批加载的跳变），
          不做假进度：它慢就是在慢，快就是在快。 */}
      <div className="ls-bar">
        <i style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  )
}
