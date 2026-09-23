// 量「加载遮罩淡出」与「遮罩内字标淡出」两条 CSS 时间轴的交叠，判断交棒是否干净。
//
// 用法：node scripts/cdp-handoff.mjs [url] [轮数] [--mobile]
//
// 为什么需要这个脚本（2026-09-23 写）：
//   交棒窗口里截图只能看出「两个都在」，看不出字标当时还剩多少不透明度 ——
//   而「字标归零时遮罩已经多透明」恰恰是干净与否的全部依据。
//   读 getComputedStyle().opacity 的逐帧序列才能定量。
//
// 判据（两个量合起来看，不能只看一个）：
//   1) .ls-lockup 的 opacity 是否已归零 —— 决定字标还在不在；
//   2) 那一刻 .loading-screen 的 opacity 还剩多少 —— 决定场景里的 .overview
//      名字块被压暗到什么程度。
//   ⚠️ getComputedStyle(子元素).opacity 返回**自身值**，不含祖先 opacity 的乘算，
//      所以必须把父容器那个数一起看。
//
//   实测（2026-09-23）：
//     sinceHide= 84ms → 遮罩 0.61、字标 0.00  ← 场景名字块只露 39% 且被压暗 ✓
//     sinceHide=187ms → 遮罩 0.23、字标 0.03  ← 场景名字块已 77% 亮度，同屏两个名字 ✗
//   所以 ls-lockup-out 的 opacity 归零点定在 28%（≈84ms）。
//
// ⚠️ 无头 Chrome 默认按 prefers-reduced-motion: reduce 走，会落到 styles.css 的降级分支
//    （遮罩 0.15s 同步淡出、字标 animation:none），量出来的两条曲线会完全重合、
//    与真实访客看到的毫无关系。所以下面必须先 setEmulatedMedia 覆盖掉。

import { launch } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const MOBILE = argv.includes('--mobile')
const pos = argv.filter((a) => !a.startsWith('--'))
const URL = pos[0] ?? 'http://127.0.0.1:5173/'
const ROUNDS = Number(pos[1] ?? 1)

// 注入时机必须是导航**之前**（addScriptToEvaluateOnNewDocument）：
// 导航后再注入会漏掉遮罩出现的头几帧，而交棒窗口只有 300ms 量级。
const SAMPLER = `
window.__op = []
;(function tick() {
  var mask = document.querySelector('.loading-screen')
  var lock = document.querySelector('.ls-lockup')
  if (mask || lock) {
    window.__op.push({
      t: performance.now(),
      cls: mask ? mask.className : 'GONE',
      mo: mask ? +getComputedStyle(mask).opacity : -1,
      lo: lock ? +getComputedStyle(lock).opacity : -1,
    })
  }
  requestAnimationFrame(tick)
})()
`

for (let r = 1; r <= ROUNDS; r++) {
  const { cdp, close } = await launch({
    port: 9350 + r,
    profile: `C:/Users/LX/AppData/Local/Temp/cdp-handoff-${r}`,
  })
  try {
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })
    if (MOBILE) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      })
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    }
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SAMPLER })
    await cdp.send('Page.navigate', { url: URL })
    await new Promise((res) => setTimeout(res, 7000))

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__op || [])',
      returnByValue: true,
    })
    const rows = JSON.parse(result.value)
    if (!rows.length) {
      console.log(`\n===== round ${r}：没采到任何样本（页面没加载出来？）=====`)
      continue
    }
    const t0 = rows[0].t

    console.log(`\n===== round ${r}  ${MOBILE ? '移动端' : '桌面端'}  samples=${rows.length} =====`)
    let prevCls = null
    let hideAt = null
    let zeroAt = null // 字标归零的时刻

    for (const s of rows) {
      const rel = Math.round(s.t - t0)
      const changed = s.cls !== prevCls
      if (changed) prevCls = s.cls
      if (s.cls.includes('is-hidden') && hideAt === null) hideAt = s.t
      if (hideAt !== null && zeroAt === null && s.lo <= 0.001) zeroAt = s.t

      const sinceHide = hideAt === null ? null : Math.round(s.t - hideAt)
      const inWindow = hideAt !== null && sinceHide <= 700
      if (changed || inWindow) {
        console.log(
          `  +${String(rel).padStart(5)}ms  sinceHide=${sinceHide === null ? '   -' : String(sinceHide).padStart(4)}  ` +
            `遮罩=${s.mo.toFixed(3)}  字标=${s.lo.toFixed(3)}  ${changed ? '<' + s.cls + '>' : ''}`
        )
      }
    }

    // 结论行：这是唯一真正要看的数
    if (hideAt === null) {
      console.log('  ⚠️ 没抓到 is-hidden 切换（遮罩没进入淡出？）')
    } else if (zeroAt === null) {
      console.log('  ⚠️ 采样窗口内字标没归零（是不是没加 .ls-lockup，或窗口太短？）')
    } else {
      const at = Math.round(zeroAt - hideAt)
      const maskThen = rows.find((s) => s.t >= zeroAt)?.mo ?? -1
      const verdict = maskThen > 0.45 ? '✓ 干净' : '✗ 遮罩太透明，会出现两个同名元素'
      console.log(
        `\n  字标归零于 sinceHide=${at}ms，此刻遮罩还剩 ${maskThen.toFixed(3)} → ${verdict}`
      )
    }
  } catch (e) {
    console.error(`round ${r} 失败：${e.message}`)
  } finally {
    // Chrome 退出与 profile 目录删除是竞态，删不掉不影响测量结果
    try {
      close()
    } catch {
      /* ignore */
    }
  }
}
