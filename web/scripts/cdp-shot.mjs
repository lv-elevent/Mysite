// 无头截图：用 CDP 的 Emulation.setDeviceMetricsOverride 精确控制视口。
//
// 为什么不用 `chrome --headless --screenshot --window-size=390,844`：
// Windows 下 Chrome 有约 512×512 的最小窗口尺寸限制，传 390 会被静默抬到 512，
// 结果是「按 512 宽布局、只截 390 宽」—— 右侧内容被切掉，看着像页面横向溢出，
// 其实页面没问题。--headless=old 与 --force-device-scale-factor 都绕不过去。
//
// CDP 的 setDeviceMetricsOverride 直接覆盖布局视口，与窗口尺寸无关，是唯一可靠的做法。
//
// 用法：node scripts/cdp-shot.mjs <baseUrl> <outDir>
//      node scripts/cdp-shot.mjs <baseUrl> --probe       （只读热点坐标，不截图）
//      node scripts/cdp-shot.mjs <baseUrl> --js='<code>' （注入任意 JS 并打印结果）

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const PROBE = process.argv.includes('--probe')
const JS = process.argv.find((a) => a.startsWith('--js='))?.slice(5)
// 输出目录 = 第一个不带 -- 前缀的位置参数（跳过 baseUrl）
const OUT = process.argv.slice(3).find((a) => !a.startsWith('--')) ?? 'shots'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const PROFILE = 'C:/Users/LX/AppData/Local/Temp/cdp-shot-profile'

// wait = 导航完成后再等多久（毫秒）。3D 场景要等 glb 加载 + 相机缓动到位，
// 太短会截到 loading 遮罩或相机还在飞的中间态。
const TASKS = [
  { name: 'desktop-overview', url: '/', w: 1440, h: 900, dpr: 1, wait: 9000 },
  { name: 'desktop-profile', url: '/?module=profile', w: 1440, h: 900, dpr: 1, wait: 9000 },
  { name: 'desktop-career', url: '/?module=career', w: 1440, h: 900, dpr: 1, wait: 9000 },
  { name: 'desktop-life', url: '/?module=life', w: 1440, h: 900, dpr: 1, wait: 9000 },
  { name: 'desktop-contact', url: '/?module=contact', w: 1440, h: 900, dpr: 1, wait: 9000 },
  { name: 'mobile-overview', url: '/', w: 390, h: 844, dpr: 2, wait: 9000, mobile: true },
  { name: 'mobile-life', url: '/?module=life', w: 390, h: 844, dpr: 2, wait: 9000, mobile: true },
  { name: 'mobile-contact', url: '/?module=contact', w: 390, h: 844, dpr: 2, wait: 9000, mobile: true },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 校准热点用：读出每个热点节点在视口里的实际百分比中心。
// 热点是 HTML 层（不参与 3D 变换），所以这是它的最终屏幕位置 ——
// 拿它和「目标部位在截图上的位置」相减，就是该调的偏移量。
// 比肉眼对着截图估读准得多（实测目测有 ±2% 的系统偏差）。
const PROBE_JS = `
JSON.stringify([...document.querySelectorAll('.hotspot-node')].map((n) => {
  const r = n.getBoundingClientRect();
  return {
    label: (n.getAttribute('aria-label') || '').split(' · ')[0],
    x: +((r.left + r.width / 2) / innerWidth * 100).toFixed(1),
    y: +((r.top + r.height / 2) / innerHeight * 100).toFixed(1),
  };
}))
`

/** 极简 CDP 客户端：只做「发命令 → 等结果」和「等事件」两件事 */
class CDP {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.waiters = new Map()

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      } else if (msg.method && this.waiters.has(msg.method)) {
        const list = this.waiters.get(msg.method)
        this.waiters.delete(msg.method)
        list.forEach((fn) => fn(msg.params))
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  once(method) {
    return new Promise((resolve) => {
      const list = this.waiters.get(method) ?? []
      list.push(resolve)
      this.waiters.set(method, list)
    })
  }
}

/** 轮询 /json/list 直到 Chrome 的调试端口可用 */
async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* 端口还没起来，继续等 */
    }
    await sleep(250)
  }
  throw new Error('CDP 调试端口在 15s 内没有就绪')
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  rmSync(PROFILE, { recursive: true, force: true })

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--disable-extensions',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  try {
    const wsUrl = await waitForTarget()
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve)
      ws.addEventListener('error', reject)
    })

    const cdp = new CDP(ws)
    await cdp.send('Page.enable')

    for (const t of TASKS) {
      // 移动端要同时打开触摸模拟，否则 matchMedia('(pointer: coarse)') 为 false，
      // Scene.tsx 会走桌面分支（眼睛跟随 + 不拉远），截出来的不是真机布局。
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: t.w,
        height: t.h,
        deviceScaleFactor: t.dpr,
        mobile: Boolean(t.mobile),
      })
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: Boolean(t.mobile),
        maxTouchPoints: 5,
      })

      const loaded = cdp.once('Page.loadEventFired')
      await cdp.send('Page.navigate', { url: BASE + t.url })
      await Promise.race([loaded, sleep(20000)])
      await sleep(t.wait)

      if (PROBE || JS) {
        const { result } = await cdp.send('Runtime.evaluate', {
          expression: JS ?? PROBE_JS,
          returnByValue: true,
          awaitPromise: true,
        })
        const value = result.value !== undefined ? result.value : result.description
        console.log(`${t.name.padEnd(18)} ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        continue
      }

      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })
      const file = join(OUT, `${t.name}.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      console.log(`OK   ${t.name}.png  ${t.w}x${t.h}@${t.dpr}`)
    }

    ws.close()
  } finally {
    chrome.kill()
  }
}

main().catch((err) => {
  console.error('截图失败：', err.message)
  process.exit(1)
})
