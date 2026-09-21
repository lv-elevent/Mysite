// 无头 Chrome + CDP 的最小公共层，供 scripts/ 下的诊断脚本共用。
//
// 为什么不用 `chrome --headless --screenshot --window-size=...`：
// Windows 下 Chrome 有约 512×512 的最小窗口尺寸限制，传 390 会被静默抬到 512，
// 结果是「按 512 宽布局、只截 390 宽」—— 右侧内容被切掉，看着像页面横向溢出，
// 其实页面没问题。--headless=old 与 --force-device-scale-factor 都绕不过去。
// CDP 的 setDeviceMetricsOverride 直接覆盖布局视口，与窗口尺寸无关。

import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 极简 CDP 客户端：发命令等结果 + 订阅事件 */
export class CDP {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      } else if (msg.method) {
        const list = this.listeners.get(msg.method)
        if (list) list.forEach((fn) => fn(msg.params))
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

  /** 持续监听某个事件（可多次注册） */
  on(method, fn) {
    const list = this.listeners.get(method) ?? []
    list.push(fn)
    this.listeners.set(method, list)
  }

  /** 等某个事件触发一次 */
  once(method) {
    return new Promise((resolve) => {
      const wrap = (params) => {
        const list = this.listeners.get(method) ?? []
        this.listeners.set(
          method,
          list.filter((f) => f !== wrap)
        )
        resolve(params)
      }
      this.on(method, wrap)
    })
  }
}

/**
 * 启动无头 Chrome 并连上 CDP。
 * @returns {Promise<{ cdp: CDP, close: () => void }>}
 */
export async function launch({ port = 9333, profile = 'C:/Users/LX/AppData/Local/Temp/cdp-shots' } = {}) {
  rmSync(profile, { recursive: true, force: true })

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      // 沙箱里 http_proxy/https_proxy 指向本机代理，Chrome 走系统代理时会把
      // localhost 也代理出去（表现为 502 / 空页面）。诊断脚本只访问本机，直接禁用代理。
      '--no-proxy-server',
      '--hide-scrollbars',
      '--disable-extensions',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let wsUrl = null
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) wsUrl = page.webSocketDebuggerUrl
    } catch {
      /* 端口还没起来 */
    }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) {
    chrome.kill()
    throw new Error('CDP 调试端口在 15s 内没有就绪')
  }

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  const cdp = new CDP(ws)
  await cdp.send('Page.enable')

  return {
    cdp,
    close: () => {
      try {
        ws.close()
      } catch {
        /* 已经关了 */
      }
      chrome.kill()
    },
  }
}

/** 覆盖布局视口。移动端要同时开触摸模拟，否则 matchMedia('(pointer: coarse)') 为 false */
export async function setViewport(cdp, { w, h, dpr = 1, mobile = false }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile,
  })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 })
}

/** 导航并等页面加载完成 + 额外等待（3D 场景要等 glb 加载与相机缓动到位） */
export async function goto(cdp, url, waitMs = 9000) {
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url })
  await Promise.race([loaded, sleep(20000)])
  await sleep(waitMs)
}

/** 在页面里执行 JS 并取回值（支持 Promise） */
export async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  return result.value !== undefined ? result.value : result.description
}

/** 截一帧，返回 PNG Buffer */
export async function shot(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  return Buffer.from(data, 'base64')
}
