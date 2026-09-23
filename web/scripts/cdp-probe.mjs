// 读一次运行时的相机状态，不做动画录制 —— 回答「总览态到底离焦点多远 / fov 多少」这类问题。
//
// 用法：node scripts/cdp-probe.mjs [url] [--mobile] [--module=<id>] [--wait=9000]
//
// 为什么单独做一个：`cdp-camera-trace.mjs` 是逐帧录制的重型工具，而多数问题只是
// 「某个静态状态下某个值是多少」。以前靠手估，估错过（MEMORY.md 硬约束 5 把总览态
// 距焦点写成约 5 世界单位，实际是 14.7），所以把读数固化下来。
//
// 读的是 Scene.tsx 的 `window.__scene`（仅 DEV 构建存在，见那边的注释）。

import { launch, setViewport, goto, evaluate } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const MOBILE = argv.includes('--mobile')
const modArg = argv.find((a) => a.startsWith('--module='))
const waitArg = argv.find((a) => a.startsWith('--wait='))
const BASE = argv.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5173'
const WAIT = waitArg ? Number(waitArg.split('=')[1]) : 9000

const VIEW = MOBILE ? { w: 390, h: 844, dpr: 2, mobile: true } : { w: 1440, h: 900, dpr: 1 }

// ?intro=0 跳过入场推近，读到的一定是「已落位」的值
const url =
  `${BASE}/?intro=0` + (modArg ? `&module=${modArg.split('=')[1]}` : '')

const { cdp, close } = await launch({ port: 9343 })
try {
  await setViewport(cdp, VIEW)
  await goto(cdp, url, WAIT)

  const raw = await evaluate(
    cdp,
    `JSON.stringify(window.__scene ? {
       dist: window.__scene.dist, fov: window.__scene.fov, pull: window.__scene.pull,
       intro: window.__scene.intro, frame: window.__scene.frame,
       pos: window.__scene.pos, focus: window.__scene.focus
     } : null)`
  )
  const s = JSON.parse(raw)
  if (!s) {
    console.log('⚠️ 读不到 window.__scene —— 生产构建会摇掉这段，只有 dev server 有')
    process.exit(1)
  }

  const aspect = VIEW.w / VIEW.h
  const visH = 2 * s.dist * Math.tan(((s.fov || 23) * Math.PI) / 180 / 2)
  console.log(`视口 ${VIEW.w}×${VIEW.h}${MOBILE ? '（移动）' : ''}  ${modArg ? '模块 ' + modArg.split('=')[1] : '总览态'}`)
  console.log(`  相机距焦点      ${s.dist.toFixed(3)} 世界单位`)
  console.log(`  fov（垂直）     ${s.fov}`)
  console.log(`  overviewPullback ${s.pull.toFixed(3)}`)
  console.log(`  intro 倍率      ${s.intro.toFixed(4)}`)
  console.log(`  时间轴帧        ${s.frame}`)
  console.log(`  焦点平面上可见   高 ${visH.toFixed(3)} / 宽 ${(visH * aspect).toFixed(3)} 世界单位`)
  console.log(`  相机位置        [${s.pos.map((v) => v.toFixed(3)).join(', ')}]`)
  console.log(`  焦点位置        [${s.focus.map((v) => v.toFixed(3)).join(', ')}]`)
} finally {
  close()
}
