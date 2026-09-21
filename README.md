<h1 align="center">3D Resume · 吕国庆个人简历</h1>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/three.js-r169-000000?style=flat&logo=three.js&logoColor=white" alt="three.js r169">
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite 5">
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-blue.svg?style=flat" alt="License MIT"></a>
</p>

<p align="center"><b>点一下身上的元素，镜头就飞过去。</b></p>

<p align="center">
  <a href="#快速开始">快速开始</a> |
  <a href="#交互设计">交互设计</a> |
  <a href="#项目结构">项目结构</a> |
  <a href="#改成你自己的">改成你自己的</a> |
  <a href="#换人物模型">换模型</a> |
  <a href="#部署">部署</a> |
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <img src="docs/preview.jpg" alt="3D 简历总览：人物形象 + 可点击热点" width="800">
</p>

一份**交互式**的在线简历：一层固定的 3D 场景（人物形象），形象上贴着几个可点的热点——工牌、眼镜、背包、名片。点哪个，相机就沿一条烘焙好的路径飞过去，然后弹出对应的内容面板。没有滚动条，全靠「点形象 → 镜头飞 → 看面板」这三步。

- **个人信息** — 关于我 · 项目与技能
- **实习与项目** — 从教育背景到项目经历
- **兴趣与旅行** — 工作之外的我
- **联系方式** — 电话 · 邮箱 · GitHub

纯前端 SPA，无后端、无路由、无 API key。`npm run build` 出来就是一个静态 `dist/`，扔哪都能跑。

> **开源说明（先读这段）**
> **代码**采用 **MIT** 许可证（见 [`LICENSE`](LICENSE)），欢迎学习、复用、二次开发。
> **个人内容与素材**（姓名 / 人物模型 / 简历 / 作品文案 / 品牌 logo / 社交链接）**不在 MIT 范围内**——fork 后请替换成你自己的，详见 [`NOTICE`](NOTICE)。
> 本项目基于开源模板 **3d-resume** 二次开发，原作者为 [Sen Zheng（SEN）](https://github.com/dayinji)（见 [`LICENSE`](LICENSE) 的版权声明）。原模板是「滚动驱动运镜」，本项目把交互层整体改成了「热点点击驱动」，并重做了面板、相机过渡与移动端适配，改动说明见 [`docs/交互层改造方案.md`](docs/交互层改造方案.md)。

## 快速开始

前端应用整个在 [`web/`](web) 下，**下文提到的代码 / 资源路径都相对 `web/`**（如 `src/App.tsx` 即 `web/src/App.tsx`），npm 命令也在 `web/` 里执行。

```bash
git clone https://github.com/lv-elevent/Mysite.git
cd Mysite/web
npm install
npm run dev        # 开发 http://localhost:5173
```

其余命令：

```bash
npm run build      # 类型检查 + 打包，产物输出到 dist/
npm run preview    # 预览 build 产物
npm run typecheck  # 仅类型检查（tsc -b）
npm run lint       # ESLint
```

**环境要求：** Node.js 20+（ESLint 10 需要）。无后端、无数据库、无需任何 API key。

调试用 URL 参数：

| 参数 | 作用 |
| --- | --- |
| `?module=profile` | 打开时直达某个模块面板（`profile` / `career` / `life` / `contact`） |
| `?nopanel=1` | **仅 dev**：只驱动相机飞行，不渲染面板——用来单独看镜头运镜 |

## 交互设计

这套交互有两个关键设计，也是改起来最容易踩坑的地方。

### 1. 相机锚点与热点位置是解耦的

| 概念 | 定义在哪 | 决定什么 |
| --- | --- | --- |
| **anchor** | `src/data/modules.ts` | 相机飞到哪。对应 glb 里的 `focus-*` 空对象 |
| **hotspot** | `src/data/modules.ts` | 元素贴在形象的哪个位置。用**视口百分比**表示 |

两者互不影响：**调热点位置不需要回 Blender 重烘焙相机动画**，改两个数字就行。热点是 HTML 层（不参与 3D 变换），所以它的屏幕位置就是最终位置，可以用 `--probe` 直接读出来校准（见下文）。

> ⚠️ 但热点坐标是在「总览态」画面上量的，而总览态的相机会被 `Scene.tsx` 的 `cam.overviewPullback` 拉远——因为 glb 烘焙的第 0 帧是脸部微距，身体完全在画面外，热点无处可贴。**改 `overviewPullback` 就必须重新校准热点坐标**（桌面 + 移动各一组）。

### 2. 相机过渡用「预烘机位表」，不是沿帧轴滑行

原模板的做法是让滚动条在 glb 相机动画的时间轴上「刮」。直接套到点击交互上会翻车：第 0→200 帧是**绕脸巡游**（净转角只有 54.5°，但路径累计转角 **213°**），沿帧轴滑过去等于把 8 秒巡游按 5 倍速播一遍，观感就是「两个机位硬切」。

现在的做法是：启动时把 `shots[0..250]` 逐帧预烘成机位表，过渡时**直接在两台机位之间插值**（位置 `lerp` + 朝向 `slerp`，人物朝向同步 `slerp`），不再让帧号当进度轴。配套的几处细节：

- 时长按行程定：`clamp(0.55 + (位移 + 转角°×0.06) × 0.075, 0.7, 1.9)` 秒
- 进度曲线 `easeShot = smootherstep(t^0.7)`——纯 smootherstep 起步太黏，加一点前倾
- 单帧步长封顶 50ms：切模块时挂面板（React 渲染 + 二维码解码）实测能卡到 110ms，不封顶一帧就推进 8% 进度
- 飞行途中改点别的模块，以**当前位置接力**，不跳回起点

效果：单步峰值转角从「16.3° + 20.9° 两段鞭打」降到 **1.19° 单峰**，实测桌面 2.1–4.4°/步、移动 2.5–4.5°/步。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| [`web/`](web) | 前端应用（React Three Fiber + TypeScript），所有代码约定都在这里 |
| [`blender/`](blender) | 场景三维源文件 `sen.blend`（人物 + 相机动画 + 对焦锚点），导出前编辑的源头 |
| [`docs/`](docs) | [`交互层改造方案.md`](docs/交互层改造方案.md)（交互层设计与实施记录）+ README 题图 |
| [`tutor/`](tutor) | **上游模板自带**的使用教程（部署 / 贴纸 / 眼球 / intro3d 导模型），本项目未改动 |
| [`CLAUDE.md`](CLAUDE.md) [`AGENTS.md`](AGENTS.md) | 面向 AI 编码助手的协作约定 |
| [`LICENSE`](LICENSE) [`NOTICE`](NOTICE) | 许可与内容声明 |

`web/` 内部：

```
web/
  src/
    App.tsx              Canvas + 各叠层装配、WebGL2 能力检测、首屏角标文案
    main.tsx             入口
    store.ts             全局交互状态（zustand）：当前打开哪个模块
    data/
      modules.ts         模块的唯一真源：id / 标题 / 相机锚点 / 热点位置
      resume.ts          履历数据（双语）：教育 / 实习 / 项目 / 技能
      life.ts            兴趣与旅行
      works.ts           项目列表（个人信息面板用）
      focusPoints.ts     glb 相机动画的帧约定（每节点 50 帧）
    panels/              四个模块的面板内容
      ProfilePanel.tsx / CareerPanel.tsx / LifePanel.tsx / ContactPanel.tsx
    scene/
      Scene.tsx          3D 场景：me.glb + 相机机位表 + 过渡插值 + 景深 / Bloom
      Env.tsx            env.hdr 环境光照（IBL）
    stage/
      scene3d.ts         渲染适配器（3D / 降级两条实现，交互层不感知区别）
      parallax.ts        相机视差 → 热点层
    ui/
      Overview.tsx       总览层：姓名 + 「点击形象上的元素」引导
      Hotspots.tsx       热点层：挂在形象上的可点元素
      ModulePanel.tsx    全屏内容面板（含进出场时序）
      LoadingScreen.tsx / NoiseOverlay.tsx / ContactIcons.tsx / HotspotIcons.tsx
    styles.css           全部样式
  public/
    models/me.glb        人物模型 + 相机动画 + focus-* 锚点
    fonts/ images/ textures/   静态素材
  scripts/               本地诊断工具（截图 / 逐帧相机采样 / 离线过渡模拟）
```

## 改成你自己的

内容与表现是分离的，改内容基本只动数据文件：

| 想改什么 | 改哪里 |
| --- | --- |
| 模块标题 / 副标题 / 相机锚点 / 热点位置 | `src/data/modules.ts` 的 `MODULES` |
| 四个面板的正文 | `src/panels/<模块>Panel.tsx` |
| 履历（教育 / 实习 / 项目 / 技能） | `src/data/resume.ts` |
| 兴趣与旅行 | `src/data/life.ts` |
| 项目列表 | `src/data/works.ts` |
| 联系方式（电话 / 邮箱 / GitHub / 二维码） | `src/panels/ContactPanel.tsx` |
| 首屏姓名与四角角标文案 | `src/App.tsx` 里 `.hero-meta` 那一段 |
| 灯光 / 景深 / Bloom / 相机拉远距离 | `src/scene/Scene.tsx` 里各组件顶部的**普通常量**，直接改值，没有面板也没有额外配置文件 |
| 人物模型 | `public/models/me.glb`，见 [换人物模型](#换人物模型) |

**加一个模块**：在 `MODULES` 里加一项，再到 `src/panels/` 里加一个对应组件、在 `ModulePanel.tsx` 的映射里挂上即可。热点、面板导航、相机帧都会自动跟随——前提是 glb 里有对应的 `focus-*` 锚点（见下）。

## 换人物模型

想换成你自己的人物，替换 `public/models/me.glb`（源文件是仓库根的 [`blender/sen.blend`](blender)，在 Blender 里改完导出 glb 覆盖它）。

代码按**对象名字**在 glb 里查找以下内容，缺哪个对应功能就失效：

| glb 里要有 | 作用 | 缺了会怎样 |
| --- | --- | --- |
| 相机 + 名为 `CameraAction` 的动画 clip | 镜头路径；总帧数运行时按 24fps 从 clip 读，不写死 | 没有镜头运动，整个效果失效 |
| `focus-0`（或旧名 `focus-start`） | 总览态对焦锚点，两种命名都认 | 总览对焦失效 |
| `focus-1` … `focus-N` | 每个模块一个锚点，顺序对应 `modules.ts` 的 `MODULES` | 对应模块飞不过去 |
| `focus-works` | 可选 | 自动复用末锚点 |
| 名字含 `eye` 的网格 | 眼睛（眼球跟随光标） | 眼睛不动 |

> **帧约定**：`focus-k` 落在相机动画第 `k × 50` 帧（`FRAMES_PER_NODE = 50`）。这个约定写在 `src/data/focusPoints.ts`，`Scene.tsx` 用它推导模块对应的帧号——所以**模块数不能超过这里列的锚点数**。

## 部署

```bash
cd web
npm run build    # → dist/
```

`vite.config.ts` 里 `base: './'`，产物用相对路径，`dist/` 可直接双击打开，也可放到任意子目录（如 `example.com/portfolio/`）。运行时 public 资源用 `import.meta.env.BASE_URL` 拼接。

部署就是把 `dist/` 传到任意静态托管：GitHub Pages / Cloudflare Pages / Netlify / Vercel / 对象存储 / 自有服务器。仓库自带 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，推到 `main` 就能自动发布到 GitHub Pages。

## 技术栈

React 18 · TypeScript 5 · @react-three/fiber · @react-three/drei · @react-three/postprocessing · three r169 · framer-motion · zustand · Vite 5

**几个实现上的取舍：**

- **渲染层与交互层解耦**：`stage/scene3d.ts` 提供两套适配器（WebGL2 可用时挂 3D 场景，不可用时退到 CSS 渐变 + 平面热点），交互层只依赖统一接口。无 WebGL2 的设备不会白屏。
- **数据驱动**：改内容只动 `data/*.ts` 与 `panels/*.tsx`，不碰 3D 代码。
- **参数都是常量**：所有可调项就是组件顶部的普通常量，没有隐藏配置层。
- **纯静态**：无后端、无路由、无 API key，`dist/` 传到任何地方都能跑，还能塞进子目录。
- **对 AI 助手友好**：[`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) 已写好协作约定，交给 Claude Code / Cursor 改也不会跑偏。

## 许可与版权

- **代码**：[MIT](LICENSE)，© 2026 Sen Zheng (SEN)。
- **本项目新增的代码**（交互层改造、面板、热点层、相机过渡、诊断脚本）：同样以 MIT 发布。
- **个人内容与素材**：姓名、人物模型、简历、项目文案、品牌 logo、图片均**不在 MIT 范围内**，详见 [`NOTICE`](NOTICE)。fork 后请替换成你自己的。
- **第三方素材**（字体 / HDR）：请各自核对其原始许可后再分发。
- **上游项目**：[`dayinji/sen-3d-resume`](https://github.com/dayinji/sen-3d-resume) —— 原模板提供了 3D 场景搭建、glb 相机动画管线与整体视觉，本项目在其基础上重构了交互层。
