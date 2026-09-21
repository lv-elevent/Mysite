// 录制「点击热点 → 相机飞到模块」的过渡过程，拼成横向故事板。
//
// 用法：node scripts/cdp-transition.mjs <baseUrl> <outDir> [热点下标] [总时长ms]
//
// 为什么不用 Page.startScreencast：无头 Chrome 下它抓不到 WebGL 图层，出来的全是黑帧
// （已实测，82 帧全黑）。所以改用循环 captureScreenshot —— 单次 150~350ms，
// 拿到的是「关键帧」而不是逐帧，但足够看出镜头是连贯飞行还是硬切。
// 需要逐帧数据时用 cdp-camera-trace.mjs（走 window.__scene）。
//
// 拼图交给 scripts/strip.py（Pillow，在 ~/.workbuddy-ai 的 default venv 里）。

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, setViewport, goto, evaluate, shot } from './lib/cdp.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const OUT = process.argv[3] ?? 'shots/transition'
const IDX = Number(process.argv[4] ?? 3) // 0=个人信息 1=实习与项目 2=兴趣与旅行 3=联系方式
const DURATION = Number(process.argv[5] ?? 2000)

async function main() {
  mkdirSync(OUT, { recursive: true })

  const { cdp, close } = await launch()
  try {
    await setViewport(cdp, { w: 1280, h: 800, dpr: 1 })
    await goto(cdp, BASE, 9000)

    const t0 = await evaluate(cdp, `performance.now()`)
    await evaluate(cdp, `document.querySelectorAll('.hotspot')[${IDX}].click()`)

    const meta = []
    const deadline = Date.now() + DURATION
    let i = 0
    while (Date.now() < deadline) {
      const png = await shot(cdp)
      const ms = Math.round((await evaluate(cdp, `performance.now()`)) - t0)
      const name = `t${String(i).padStart(2, '0')}.png`
      writeFileSync(join(OUT, name), png)
      meta.push({ name, ms })
      i++
    }
    writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ hotspot: IDX, frames: meta }, null, 2))
    console.log(`共 ${meta.length} 帧：` + meta.map((m) => `${m.ms}ms`).join(' '))
    console.log(`输出目录 ${OUT}`)
  } finally {
    close()
  }
}

main().catch((err) => {
  console.error('录制失败：', err.message)
  process.exit(1)
})
