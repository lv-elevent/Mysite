// 逐帧读相机状态，验证「点模块 → 镜头飞过去」到底连不连贯。
//
// 为什么需要它：R3F 没把 store 挂到 canvas 上，运行时拿不到相机对象；
// 无头 Chrome 的 Page.startScreencast 又抓不到 WebGL 图层（只出黑帧），
// 循环 captureScreenshot 单次 300ms+（缓动总共才 1 秒多，等于整段漏掉）。
// 所以走 Scene.tsx 在 DEV 下挂的 window.__scene：每帧写一次相机状态，
// 这里用 rAF 采样，拿到的是真正的逐帧轨迹。
//
// 判据：镜头连贯 ⇒ 每步位移/转角是「单峰」曲线；硬切 ⇒ 会出现一两个尖峰。
//
// 用法：node scripts/cdp-camera-trace.mjs <baseUrl> [热点下标] [采样时长ms]

import { launch, setViewport, goto, evaluate, sleep } from './lib/cdp.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const IDX = Number(process.argv[3] ?? 3) // 0=个人信息 1=实习与项目 2=兴趣与旅行 3=联系方式
const HOLD = Number(process.argv[4] ?? 2600)

const SAMPLER = `
window.__trace = [];
window.__t0 = performance.now();
let lastN = -1;
(function tick() {
  const s = window.__scene;
  if (s && s.n !== lastN) {
    lastN = s.n;
    window.__trace.push({
      t: performance.now() - window.__t0,
      frame: s.frame, k: s.k, pull: s.pull, dt: s.dt,
      pos: s.pos.slice(), quat: s.quat.slice(),
    });
  }
  requestAnimationFrame(tick);
})();
'tracing'
`

const qAngle = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

async function main() {
  const { cdp, close } = await launch()
  try {
    await setViewport(cdp, { w: 1440, h: 900, dpr: 1 })
    await goto(cdp, BASE, 9000)

    const ready = await evaluate(cdp, `typeof window.__scene !== 'undefined'`)
    if (!ready) {
      console.error('window.__scene 不存在 —— 确认跑的是 dev 模式（DEV 才挂这个口子）')
      return
    }

    await evaluate(cdp, SAMPLER)
    await sleep(500)
    const tClick = await evaluate(cdp, `performance.now() - window.__t0`)
    await evaluate(cdp, `document.querySelectorAll('.hotspot')[${IDX}].click()`)
    await sleep(HOLD)

    const trace = await evaluate(cdp, `JSON.stringify(window.__trace)`)
    const rows = JSON.parse(trace)

    console.log(`热点下标 ${IDX} / 点击发生在 ${Math.round(tClick)}ms / 共采到 ${rows.length} 帧`)
    console.log()

    const hdr =
      '   ms' + '  帧'.padStart(9) + '    k' + ' pull' + ' dt_ms' + '  位移/步' + '  转角/步'
    console.log(hdr)
    console.log('-'.repeat(52))

    const dpos = []
    const dang = []
    let prev = null
    for (const r of rows) {
      let dp = 0
      let da = 0
      if (prev) {
        dp = dist3(r.pos, prev.pos)
        da = qAngle(r.quat, prev.quat)
      }
      dpos.push(dp)
      dang.push(da)
      const rel = r.t - tClick
      // 只打点击后那一小段，且每 2 帧一行，避免刷屏
      if (rel >= -100 && rel <= 2200 && rows.indexOf(r) % 2 === 0) {
        console.log(
          `${Math.round(rel).toString().padStart(6)} ${r.frame.toFixed(1).padStart(7)} ` +
            `${r.k.toFixed(2).padStart(5)} ${r.pull.toFixed(2).padStart(5)} ` +
            `${(r.dt * 1000).toFixed(1).padStart(6)} ${dp.toFixed(4).padStart(8)} ${da.toFixed(3).padStart(8)}`
        )
      }
      prev = r
    }

    // 只看点击后的采样，算峰值
    const after = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.t >= tClick)
    const win = after.slice(1, 140)
    const maxDp = Math.max(...win.map(({ i }) => dpos[i]))
    const maxDa = Math.max(...win.map(({ i }) => dang[i]))
    const maxDt = Math.max(...win.map(({ i }) => rows[i].dt)) * 1000

    console.log()
    console.log(`点击后前 ${win.length} 帧：`)
    console.log(`  单步最大位移 ${maxDp.toFixed(4)} 世界单位`)
    console.log(`  单步最大转角 ${maxDa.toFixed(3)}°  （硬切时会出现 >10°/步 的尖峰）`)
    console.log(`  最长一帧耗时 ${maxDt.toFixed(1)} ms  （>100ms 说明掉帧，缓动会被一步吃掉）`)
    console.log(`  平均帧间隔 ${(win.reduce((s, { i }) => s + rows[i].dt, 0) / Math.max(1, win.length) * 1000).toFixed(1)} ms`)
  } finally {
    close()
  }
}

main().catch((err) => {
  console.error('采样失败：', err.message)
  process.exit(1)
})
