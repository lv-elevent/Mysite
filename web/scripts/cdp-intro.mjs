// 抓开场动画的关键帧，并校验它的时间轴。
//
// 为什么不复用 cdp-shot.mjs：那个脚本每个任务固定等 9s（3D 场景要等 glb 与相机缓动），
// 而加载遮罩在 ~2.7s 就卸载了，等 9s 只能拍到已经进场的画面。
//
// 为什么用「冻结 + scrub」而不是「导航后密集采样」：
// 实测密集采样会被页面加载抖动带偏（第一张就滞后到 565ms，中间还有 1s 空档），
// 而 scrub 把动画 currentTime 钉在指定值上，每一帧都是确定的、可复现的。
// 时间轴本身的正确性由 --probe 单独校验（打印每条动画的 delay / duration / 次数）。
//
// 让遮罩不卸载的办法：用 Fetch 拦截把 glb / hdr 请求挂住（不响应），
// useProgress 停在原地，ready 永远是 false，遮罩就一直挂着。
// ⚠️ 不能用 Network.setBlockedURLs —— 那样请求是「失败」，而 drei 的 useProgress
//    在资源出错时同样会把进度推到 100，遮罩照样卸载（踩过，别改回去）。
//
// 用法：
//   node scripts/cdp-intro.mjs <baseUrl> <outDir>             抓关键帧
//   node scripts/cdp-intro.mjs <baseUrl> --probe              只打印动画时间轴，不截图
//   node scripts/cdp-intro.mjs <baseUrl> <outDir> --mobile    移动端视口
// 加 --static 抓「跳过开场」的静态终态（is-static）。

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, setViewport, evaluate, shot, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const MOBILE = argv.includes('--mobile')
const PROBE = argv.includes('--probe')
const STATIC = argv.includes('--static')
const pos = argv.filter((a) => !a.startsWith('--'))
const BASE = pos[0] ?? 'http://127.0.0.1:5173'
const OUT = pos[1] ?? 'shots/intro'

// scrub 采样点（毫秒，动画时间轴上的绝对值）。对应 LoadingScreen.tsx 的编排：
// 四角标 0/80/160/240 → 扫描线 100–720 → 线稿 300–1150 → 热点 1150/1300/1450/1600 → 状态行 1650
// 采样点都取在「关键帧边界之后一点点」而不是边界上：动画带延迟时，
// 边界那一刻进度正好是 0，截出来还是上一状态，看不出这一步做了什么。
const MARKS = [120, 360, 620, 920, 1180, 1330, 1480, 1650, 1850]

const VIEW = MOBILE ? { w: 390, h: 844, dpr: 2, mobile: true } : { w: 1440, h: 900, dpr: 1 }

const SCOPE = `(function(){
  var all = document.getAnimations();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var t = all[i].effect && all[i].effect.target;
    if (t && t.closest && t.closest('.loading-screen')) out.push(all[i]);
  }
  return out;
})()`

mkdirSync(OUT, { recursive: true })
const { cdp, close } = await launch({ port: 9335 })

try {
  await setViewport(cdp, VIEW)
  await cdp.send('Network.enable')

  // 让 glb / hdr 请求「挂住不响应」，而不是让它们失败。
  // 为什么不能用 Network.setBlockedURLs：drei 的 useProgress 在资源出错时也会把
  // 计数推到 100（否则一个坏资源就是一块永远擦不掉的遮罩），所以「屏蔽」根本挡不住
  // 遮罩卸载 —— 必须让请求一直 pending，进度才停在原地。
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  cdp.on('Fetch.requestPaused', (p) => {
    if (/\.(glb|hdr)(\?|$)/i.test(p.request.url)) return // 故意不响应
    cdp.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {})
  })

  // headless Chrome 默认按 prefers-reduced-motion: reduce 走，会把开场动画的无障碍
  // 守护规则全部命中（动画一条都不创建）。要看真实动画必须先覆盖掉这个默认值。
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  // ?intro=1 强制播放开场（否则会话内第二次进来会走 is-static 静态终态）
  await cdp.send('Page.navigate', { url: `${BASE}/?intro=${STATIC ? '0' : '1'}` })

  // 等遮罩出现
  let appeared = false
  for (let i = 0; i < 200 && !appeared; i++) {
    appeared = await evaluate(cdp, `!!document.querySelector('.loading-screen')`)
    if (!appeared) await sleep(50)
  }
  if (!appeared) throw new Error('10s 内没等到 .loading-screen')

  const CLS = `(function(){ var e = document.querySelector('.loading-screen'); return e ? e.className : 'GONE' })()`
  console.log('遮罩 class：', await evaluate(cdp, CLS))

  if (PROBE) {
    const dbg = await evaluate(
      cdp,
      `JSON.stringify({
         cls: document.querySelector('.loading-screen').className,
         names: ['.ls-mark', '.ls-scan', '.ls-outline', '.ls-spot', '.ls-spot-ring', '.ls-hint']
           .map(function(sel){ var e = document.querySelector(sel); return sel + ' → ' + (e ? getComputedStyle(e).animationName : 'MISSING') }),
         keys: Array.prototype.concat.apply([], Array.prototype.map.call(document.styleSheets, function(s){
           try { return Array.prototype.filter.call(s.cssRules, function(r){ return r.type === 7 }).map(function(r){ return r.name }) }
           catch (e) { return [] }
         }))
       })`
    )
    const d = JSON.parse(dbg)
    console.log('遮罩 class：', d.cls)
    for (const n of d.names) console.log('  ' + n)
    console.log('已注册的关键帧：', d.keys.join(', ') || '(无)')
  } else {
    // 先全部暂停，再逐帧把 currentTime 钉到采样点
    await evaluate(cdp, `${SCOPE}.forEach(function(a){ a.pause() })`)
    const frames = []
    for (const ms of MARKS) {
      await evaluate(cdp, `${SCOPE}.forEach(function(a){ a.currentTime = ${ms} })`)
      await sleep(60)
      // 每帧都确认遮罩还在：一旦被卸载，截出来就是一张空底色，
      // 静默产出 9 张一样的图比直接报错更难查。
      const state = await evaluate(
        cdp,
        `(function(){ var e = document.querySelector('.loading-screen'); return e ? e.className : 'GONE' })()`
      )
      if (state === 'GONE' || String(state).includes('is-hidden')) {
        throw new Error(`第 ${ms}ms 帧：遮罩已 ${state === 'GONE' ? '卸载' : '开始淡出'}，scrub 没冻住墙钟`)
      }
      const name = `t${String(ms).padStart(4, '0')}.png`
      writeFileSync(join(OUT, name), await shot(cdp))
      frames.push({ name, ms })
      console.log(`${name}  ${ms}ms`)
    }
    // 结构与 cdp-transition.mjs 保持一致，strip.py 才能直接拼故事板
    writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames }, null, 2))
    console.log(`输出目录 ${OUT}`)
  }
} finally {
  await close()
}
