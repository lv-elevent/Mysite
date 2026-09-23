// 录制「加载遮罩淡出 → 相机入场推近 → 热点落位」的入场过程，并校验镜头是否连贯。
//
// 用法：node scripts/cdp-intro.mjs <baseUrl> <outDir> [抓图时长ms] [--mobile]
//
// 为什么要重写：2026-09-22 起遮罩里已经没有 CSS 动画了（旧的「取景框 → 线稿 → 热点」
// 那套被否掉），入场完全由两条时间轴驱动 —— 遮罩 opacity 过渡 + Scene.tsx 的相机推近。
// 所以抓帧必须从页面加载那一刻就开始，不能再等 goto() 的固定 9s。
//
// 两条证据链，缺一不可：
//   1. 截图故事板（strip.py 拼）—— 看画面：遮罩是否干净淡出、镜头是否在推进、热点有没有脱开形象
//   2. window.__scene 逐帧采样 —— 看数据：intro 倍率是否单调、相机单步位移有没有尖峰
// 截图单次 150~350ms，只能拿关键帧；所以数值采样单独走页面内 rAF，不漏帧。
//
// 拼图交给 scripts/strip.py（Pillow，在 ~/.workbuddy-ai 的 default venv 里）。

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, setViewport, evaluate, shot } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const MOBILE = argv.includes('--mobile')
// --no-intro：用 ?intro=0 跳过推镜，用来做 A/B 对照 ——
// 「推镜落位后」必须与「全程不推镜」逐像素一致（终点严格等于总览位），
// 这是热点坐标不用重校的唯一依据。同时也是对 ?intro=0 这条降级路径的验证。
const NO_INTRO = argv.includes('--no-intro')
const pos = argv.filter((a) => !a.startsWith('--'))
const BASE = pos[0] ?? 'http://127.0.0.1:5173'
const OUT = pos[1] ?? 'shots/intro'
const DURATION = Number(pos[2] ?? 2600)

const VIEW = MOBILE ? { w: 390, h: 844, dpr: 2, mobile: true } : { w: 1440, h: 900, dpr: 1 }

async function main() {
  mkdirSync(OUT, { recursive: true })
  const { cdp, close } = await launch({ port: 9335 })

  try {
    await setViewport(cdp, VIEW)
    // headless 默认按 prefers-reduced-motion: reduce 走 —— 那会命中热点入场的无障碍守护
    // （动画直接不创建），必须覆盖掉才能看到真实效果。
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })

    // 页面内 rAF 采样：每帧记一次 intro 倍率、相机位置与焦点。
    // 用 addScriptToEvaluateOnNewDocument 而不是导航后再注入 —— 后者会漏掉开头几十毫秒，
    // 而入场最关键的恰恰是开头（遮罩开始淡出、镜头开始推进那一刻）。
    // 记 focus 是为了算「感知位移」：推镜是沿「焦点→相机」方向缩放，
    // 真正被眼睛感知的是距离的相对变化 dDist/dist，不是世界坐标下的绝对位移。
    // 记 dt 是为了算「速度」：采样器自己的 rAF 间隔与 useFrame 的 dt 不同源
    //   （采样器若先于 R3F 注册，读到的是上一帧末尾的状态，两者会错位一帧），
    //   拿采样器间隔去除位移会把正常帧算成毛刺。用帧内 dt 才能自洽。
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function(){
        window.__trace = [];
        var f = function(){
          var s = window.__scene;
          var st = window.__store ? window.__store.getState() : null;
          if (s && s.intro !== undefined) {
            window.__trace.push({
              t: performance.now(),
              intro: s.intro, pull: s.pull, frame: s.frame, pos: s.pos, focus: s.focus, fdt: s.dt,
              entered: st ? st.entered : null, sceneReady: st ? st.sceneReady : null,
            });
          }
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      })();`,
    })

    // ?intro=1 强制做入场推近（否则同一会话第二次进来会跳过推镜）
    // ?intro=0 强制跳过（--no-intro），用于 A/B 对照
    //
    // 必须等导航提交（frameNavigated）再开始抓：about:blank → http 是跨进程导航，
    // 提交之前发任何命令都会报 {"code":-32000,"message":"Not attached to an active page"}。
    // 等提交而不是等 load：Vite dev 的 load 要等整个模块图，那会儿入场早演完了。
    // 遮罩有 MIN_MS(600) 的最短停留，所以这点等待不会漏掉任何画面。
    const navigated = cdp.once('Page.frameNavigated')
    await cdp.send('Page.navigate', { url: `${BASE}/?intro=${NO_INTRO ? '0' : '1'}` })
    await Promise.race([navigated, new Promise((r) => setTimeout(r, 1500))])

    // 循环截图：从导航提交就开始，不等加载完成。
    // 用 JPEG 而不是 PNG：推镜只有约 1.15s，PNG 单张 200ms 只能拿到 5 帧，
    // 故事板看不出运动；JPEG q=72 约 60ms 一张，密度翻 3 倍（见 lib/cdp.mjs 的 shot）。
    const meta = []
    const deadline = Date.now() + DURATION
    let i = 0
    while (Date.now() < deadline) {
      let jpg
      try {
        jpg = await shot(cdp, { format: 'jpeg', quality: 72 })
      } catch (err) {
        // 导航边缘仍可能撞上一两帧，跳过而不是整轮失败
        if (String(err.message).includes('Not attached')) continue
        throw err
      }
      const ms = Math.round(await evaluate(cdp, `performance.now()`))
      const name = `t${String(i).padStart(2, '0')}.jpg`
      writeFileSync(join(OUT, name), jpg)
      meta.push({ name, ms })
      i++
    }

    // 数值采样：等采样窗口结束后一次性取回
    await new Promise((r) => setTimeout(r, 600))
    const trace = JSON.parse(await evaluate(cdp, `JSON.stringify(window.__trace || [])`))

    writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames: meta }, null, 2))
    writeFileSync(join(OUT, 'trace.json'), JSON.stringify(trace, null, 2))

    // 截图时刻对齐到 trace 的起点，这样故事板上的 ms 与下面的数据是同一个坐标系
    const t0 = trace.length ? trace[0].t : meta.length ? meta[0].ms : 0
    console.log(`截图 ${meta.length} 帧：` + meta.map((m) => `${Math.round(m.ms - t0)}ms`).join(' '))

    if (trace.length === 0) {
      console.log('⚠️ 没采到 window.__scene（生产环境会摇掉这段调试代码）')
    } else {
      const from = trace[0].intro
      console.log(`\nintro 倍率（${from.toFixed(2)} → 1 为推近完成）：`)
      for (let ms = 0; ms <= DURATION; ms += 100) {
        const s = trace.find((x) => x.t - t0 >= ms)
        if (s) console.log(`  ${String(ms).padStart(4)}ms  intro=${s.intro.toFixed(4)}`)
      }
      // 连贯性判据：只在「推镜窗口」内统计（intro 还没回到 1 的那些帧）。
      //
      // ⚠️ 不能用「全时段平均」做分母 —— 推镜结束后相机是静止的，那些 ~0 的帧会把
      //    平均值稀释掉，峰值/平均这个比值就变成一个没意义的数字（实测虚高到 5.6×）。
      //    改为与窗口内中位数比，且用感知量：推镜是沿「焦点→相机」方向的缩放，
      //    眼睛看到的是距离的相对变化 dDist/dist，不是世界坐标下的绝对位移。
      //
      // ⚠️ 判毛刺必须用「速度」而不是「位移」。easeShot 是中段最快、首尾接近静止的
      //    S 曲线，位移峰值/中位天然在 2~4× 之间 —— 拿位移比当判据会把曲线自己的
      //    速度平台报成尖峰（2026-09-23 移动端实测误报 3 个）。速度 = dDist/dist ÷ dt
      //    才是「相机走得顺不顺」的直接度量，且必须用帧内 dt（见上面注入处的说明）。
      const eIdx = trace.findIndex((x) => x.entered)
      const win = []
      for (let k = Math.max(1, eIdx); k < trace.length; k++) {
        const a = trace[k - 1]
        const b = trace[k]
        if (b.intro <= 1.0002) continue // 已落位
        if (!b.focus || !a.focus || !b.fdt) continue
        const d = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2])
        const dist = Math.hypot(
          b.pos[0] - b.focus[0],
          b.pos[1] - b.focus[1],
          b.pos[2] - b.focus[2]
        )
        const rel = dist > 0 ? d / dist : 0
        win.push({ at: b.t - t0, dt: b.fdt * 1000, d, rel, vel: rel / b.fdt, intro: b.intro, dist })
      }
      if (win.length < 8) {
        console.log('\n⚠️ 推镜窗口内样本不足，跳过连贯性统计')
      } else {
        const sorted = [...win].map((x) => x.rel).sort((a, b) => a - b)
        const med = sorted[Math.floor(sorted.length / 2)]
        const peak = sorted[sorted.length - 1]
        const peakAt = win.find((x) => x.rel === peak)
        console.log(`\n推镜窗口：${win.length} 帧 / ${Math.round(win[win.length - 1].at)}ms`)
        console.log(
          `相机距焦点：${(win[0].dist + win[0].d).toFixed(3)} → ${win[win.length - 1].dist.toFixed(3)} 世界单位`
        )
        // 角速度剖面：肉眼判断是否平滑。连贯 = 单峰，状态跳变 = 某根柱子突然拔高。
        const velMax = Math.max(...win.map((x) => x.vel))
        const BARS = '▁▂▃▄▅▆▇█'
        const step = Math.max(1, Math.round(win.length / 48))
        let prof = ''
        for (let k = 0; k < win.length; k += step) {
          prof += BARS[Math.min(7, Math.floor((win[k].vel / velMax) * 8))]
        }
        console.log(`角速度剖面（${Math.round(win[0].at)}ms → ${Math.round(win[win.length - 1].at)}ms）：`)
        console.log(`  ${prof}`)
        // 毛刺判据：单帧角速度显著偏离 ±LOCAL 帧的局部中位。
        // 邻域必须完整落在窗口内部 —— 边界处的邻域里混着「推镜未开始」的静止帧，
        // 局部中位会被拉低，正常帧也会被误判（2026-09-23 实测：215ms 那帧误报 5.86×）。
        const LOCAL = 6
        const outliers = []
        for (let k = LOCAL; k < win.length - LOCAL; k++) {
          const neigh = win
            .slice(k - LOCAL, k + LOCAL + 1)
            .filter((_, j) => j !== LOCAL)
            .map((x) => x.vel)
            .sort((a, b) => a - b)
          const lm = neigh[Math.floor(neigh.length / 2)]
          if (lm <= 0) continue
          if (win[k].vel > lm * 2.5) outliers.push({ ...win[k], ratio: win[k].vel / lm, lm })
        }
        console.log(`角速度孤立毛刺（相对 ±${LOCAL} 帧局部中位 >2.5×）：${outliers.length} 个`)
        for (const s of outliers) {
          console.log(
            `    @${Math.round(s.at)}ms  dt=${s.dt.toFixed(1)}ms  vel=${s.vel.toExponential(2)}` +
              `（局部中位 ${s.lm.toExponential(2)}，${s.ratio.toFixed(2)}×）`
          )
        }
        // ⚠️ 上面那个比值不能单独用来下结论 —— 它只说明「这一帧比邻居走得快多少」，
        //    不代表看得见。2026-09-23 移动端实测：卡顿帧（帧内 dt 36ms，被 33ms 封顶）
        //    比值高达 5.6×，但换算成绝对量只是 1.63% 的尺寸变化，落在屏幕上约 1.3px。
        //    所以真正该看的量是「单帧吃掉了全程的百分之几」，下面是这个数。
        //    rel 的定义是 d/dist，恰好等于「该帧的尺寸变化率」，所以直接可读。
        const totalPct = (Math.max(...win.map((x) => x.intro)) - 1) * 100
        const worstPct = peak * 100
        const sharePct = (worstPct / totalPct) * 100
        const avgPct = (med * 100)
        console.log(
          `单帧尺寸变化：中位 ${avgPct.toFixed(3)}% / 最大 ${worstPct.toFixed(3)}%（@${Math.round(peakAt.at)}ms）`
        )
        console.log(
          `全程尺寸变化 ${totalPct.toFixed(1)}% → 最差那一帧吃掉全程的 ${sharePct.toFixed(1)}%（>10% 才会看出顿挫）`
        )
        const dts = win.map((x) => x.dt).sort((a, b) => a - b)
        console.log(
          `窗口内帧内 dt：中位 ${dts[Math.floor(dts.length / 2)].toFixed(1)}ms / 最大 ${dts[dts.length - 1].toFixed(1)}ms`
        )
      }
      // intro 必须单调不增（只推近，不回退）
      let mono = true
      for (let k = 1; k < trace.length; k++) {
        if (trace[k].intro > trace[k - 1].intro + 1e-6) mono = false
      }
      console.log(`intro 单调不增：${mono ? '是' : '否（有回退，需要检查）'}`)
    }
    console.log(`\n输出目录 ${OUT}`)
  } finally {
    close()
  }
}

main().catch((err) => {
  console.error('录制失败：', err.message)
  process.exit(1)
})
