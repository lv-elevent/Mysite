<h1 align="center">3D Resume · Guoqing Lyu</h1>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/three.js-r169-000000?style=flat&logo=three.js&logoColor=white" alt="three.js r169">
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite 5">
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-blue.svg?style=flat" alt="License MIT"></a>
</p>

<p align="center"><b>Click a detail on the character. The camera flies there.</b></p>

<p align="center">
  <a href="#quick-start">Quick start</a> |
  <a href="#interaction-design">Interaction design</a> |
  <a href="#project-layout">Project layout</a> |
  <a href="#make-it-yours">Make it yours</a> |
  <a href="#swapping-the-character">Swapping the character</a> |
  <a href="#deployment">Deployment</a> |
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="docs/preview.jpg" alt="3D resume overview: character with clickable hotspots" width="800">
</p>

An **interactive** online résumé: a fixed 3D scene with a character, and a handful of clickable hotspots pinned to it — a badge, a pair of glasses, a backpack, a business card. Click one and the camera flies along a pre-baked path to that spot, then a content panel slides in. No scrollbar; the whole thing is "click the character → camera flies → read the panel".

- **Profile** — about me, projects and skills
- **Experience** — from education to project work
- **Life** — what I do outside of work
- **Contact** — phone, email, GitHub

A pure front-end SPA. No backend, no router, no API keys. `npm run build` produces a static `dist/` you can host anywhere.

> **Licensing, read this first**
> The **code** is **MIT** (see [`LICENSE`](LICENSE)) — learn from it, reuse it, build on it.
> The **personal content and assets** (name, character model, résumé text, project write-ups, brand logos, social links) are **not** covered by MIT — replace them with your own if you fork this, see [`NOTICE`](NOTICE).
> This project is a derivative of the open-source template **3d-resume** by [Sen Zheng (SEN)](https://github.com/dayinji) (see the copyright notice in [`LICENSE`](LICENSE)). The original drives the camera with **scroll**; this project replaced the entire interaction layer with **hotspot clicks**, and rebuilt the panels, the camera transition and the mobile layout. The change log lives in [`docs/交互层改造方案.md`](docs/交互层改造方案.md) (Chinese).

## Quick start

The whole front-end lives under [`web/`](web). **All code and asset paths below are relative to `web/`** (e.g. `src/App.tsx` means `web/src/App.tsx`), and npm commands run inside `web/`.

```bash
git clone https://github.com/lv-elevent/Mysite.git
cd Mysite/web
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm run build      # type-check + bundle → dist/
npm run preview    # preview the build output
npm run typecheck  # type-check only (tsc -b)
npm run lint       # ESLint
```

**Requirements:** Node.js 20+ (needed by ESLint 10). No backend, no database, no API keys.

Debug URL parameters:

| Parameter | Effect |
| --- | --- |
| `?module=profile` | Open straight into a module panel (`profile` / `career` / `life` / `contact`) |
| `?nopanel=1` | **dev only**: drive the camera flight without rendering the panel — for inspecting the camera move on its own |

## Interaction design

Two design decisions matter here, and they are also where it's easiest to break things.

### 1. Camera anchors and hotspot positions are decoupled

| Concept | Defined in | Controls |
| --- | --- | --- |
| **anchor** | `src/data/modules.ts` | Where the camera flies. Maps to a `focus-*` empty in the glb |
| **hotspot** | `src/data/modules.ts` | Where the element sits on the character, as a **viewport percentage** |

They don't affect each other: **adjusting hotspot positions needs no re-bake in Blender** — change two numbers. Hotspots are an HTML layer (they don't go through 3D transforms), so their on-screen position is final and can be measured directly for calibration (see `--probe` below).

> ⚠️ Hotspot coordinates are measured on the **overview** frame, and the overview camera is pulled back by `cam.overviewPullback` in `Scene.tsx` — because frame 0 of the baked glb animation is a face close-up with the body entirely off-screen, leaving nowhere to pin a hotspot. **Change `overviewPullback` and you must re-calibrate the hotspot coordinates** (separate sets for desktop and mobile).

### 2. Camera transitions use a pre-baked shot table, not a scrub along the frame axis

The original template scrubs the glb camera clip's timeline with the scrollbar. Ported naively to clicks, that falls apart: frames 0→200 are an **orbit around the face** — a net 54.5° turn, but **213° of accumulated rotation along the path**. Scrubbing through it plays an 8-second orbit at 5×, which reads as a hard cut between two camera positions.

Instead, the app pre-bakes `shots[0..250]` into a shot table at startup and **interpolates directly between two shots** (`lerp` for position, `slerp` for orientation, plus a `slerp` on the character's rotation), so the frame number is no longer the progress axis. Supporting details:

- Duration follows distance: `clamp(0.55 + (distance + angle° × 0.06) × 0.075, 0.7, 1.9)` seconds
- Easing `easeShot = smootherstep(t^0.7)` — pure smootherstep starts too sluggishly, so it's biased forward
- Per-frame step capped at 50 ms: mounting a panel (React render + QR decode) measured up to 110 ms, and uncapped that advances 8% of the transition in one frame
- Re-targeting mid-flight **continues from the current pose** rather than snapping back

Result: peak per-step rotation dropped from "16.3° + 20.9°, a two-stage whip" to a **1.19° single peak**; measured 2.1–4.4°/step on desktop and 2.5–4.5°/step on mobile.

## Project layout

| Directory | Contents |
| --- | --- |
| [`web/`](web) | The front-end app (React Three Fiber + TypeScript); all code conventions live here |
| [`blender/`](blender) | Scene source `sen.blend` (character + camera animation + focus anchors) |
| [`docs/`](docs) | [`交互层改造方案.md`](docs/交互层改造方案.md) (interaction-layer design log) + the README preview image |
| [`tutor/`](tutor) | Tutorials **shipped with the upstream template** (deploy / stickers / eyes / intro3d), unmodified |
| [`CLAUDE.md`](CLAUDE.md) [`AGENTS.md`](AGENTS.md) | Conventions for AI coding assistants |
| [`LICENSE`](LICENSE) [`NOTICE`](NOTICE) | License and content notice |

Inside `web/`:

```
web/
  src/
    App.tsx              Canvas + overlay assembly, WebGL2 capability check, corner labels
    main.tsx             entry
    store.ts             global interaction state (zustand): which module is open
    data/
      modules.ts         single source of truth: id / title / camera anchor / hotspot position
      resume.ts          résumé data (bilingual): education / internships / projects / skills
      life.ts            interests and travel
      works.ts           project list (used by the profile panel)
      focusPoints.ts     frame convention for the glb camera clip (50 frames per node)
    panels/              content for the four modules
      ProfilePanel.tsx / CareerPanel.tsx / LifePanel.tsx / ContactPanel.tsx
    scene/
      Scene.tsx          the 3D scene: me.glb + shot table + transition interpolation + DoF/Bloom
      Env.tsx            env.hdr image-based lighting
    stage/
      scene3d.ts         render adapters (3D and fallback), so the interaction layer doesn't care
      parallax.ts        camera parallax → hotspot layer
    ui/
      Overview.tsx       overview layer: name + "click a detail" hint
      Hotspots.tsx       hotspot layer pinned to the character
      ModulePanel.tsx    full-screen content panel (with enter/exit timing)
      LoadingScreen.tsx / NoiseOverlay.tsx / ContactIcons.tsx / HotspotIcons.tsx
    styles.css           all styles
  public/
    models/me.glb        character + camera animation + focus-* anchors
    fonts/ images/ textures/   static assets
  scripts/               local diagnostic tooling (screenshots / per-frame camera sampling / offline sim)
```

## Make it yours

Content and presentation are separated; changing content means touching data files only:

| What you want to change | Where |
| --- | --- |
| Module titles / subtitles / anchors / hotspot positions | `MODULES` in `src/data/modules.ts` |
| Panel copy for the four modules | `src/panels/<module>Panel.tsx` |
| Résumé (education / internships / projects / skills) | `src/data/resume.ts` |
| Interests and travel | `src/data/life.ts` |
| Project list | `src/data/works.ts` |
| Contact details (phone / email / GitHub / QR) | `src/panels/ContactPanel.tsx` |
| Name and the four corner labels | the `.hero-meta` block in `src/App.tsx` |
| Lighting / DoF / Bloom / overview pull-back | plain **constants** at the top of each component in `src/scene/Scene.tsx` — no config layer |
| Character model | `public/models/me.glb`, see [Swapping the character](#swapping-the-character) |

**Adding a module**: add an entry to `MODULES`, add a panel component under `src/panels/`, and wire it into the map in `ModulePanel.tsx`. Hotspots, panel navigation and camera frames all follow automatically — provided the glb has a matching `focus-*` anchor (below).

## Swapping the character

Replace `public/models/me.glb` (the source is [`blender/sen.blend`](blender) at the repo root — edit it in Blender and re-export).

The code looks these up **by object name**; whichever is missing, the matching feature stops working:

| Must exist in the glb | Purpose | If missing |
| --- | --- | --- |
| A camera + an animation clip named `CameraAction` | Camera path; total frame count is read from the clip at 24 fps, not hard-coded | No camera movement — the whole effect is gone |
| `focus-0` (or the older `focus-start`) | Overview focus anchor; both names are recognised | Overview focus breaks |
| `focus-1` … `focus-N` | One anchor per module, in the order of `MODULES` | That module can't fly anywhere |
| `focus-works` | Optional | Falls back to the last anchor |
| A mesh whose name contains `eye` | Eyes (cursor tracking) | Eyes stay still |

> **Frame convention**: `focus-k` lands on frame `k × 50` of the camera clip (`FRAMES_PER_NODE = 50`). This convention lives in `src/data/focusPoints.ts`, and `Scene.tsx` derives module frame numbers from it — so **the number of modules can't exceed the number of anchors listed there**.

## Deployment

```bash
cd web
npm run build    # → dist/
```

`base: './'` in `vite.config.ts` means relative paths, so `dist/` opens by double-click and works from any subdirectory (e.g. `example.com/portfolio/`). Runtime public assets are resolved via `import.meta.env.BASE_URL`.

Deploying is just copying `dist/` to any static host: GitHub Pages, Cloudflare Pages, Netlify, Vercel, object storage, your own server. The repo ships [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), so pushing to `main` publishes to GitHub Pages automatically.

## Tech stack

React 18 · TypeScript 5 · @react-three/fiber · @react-three/drei · @react-three/postprocessing · three r169 · framer-motion · zustand · Vite 5

**A few trade-offs worth knowing:**

- **Render layer decoupled from interaction layer**: `stage/scene3d.ts` exposes two adapters (a real 3D scene when WebGL2 is available, a CSS-gradient + flat-hotspot fallback when it isn't). Devices without WebGL2 don't get a blank screen.
- **Data-driven**: change content in `data/*.ts` and `panels/*.tsx` without touching 3D code.
- **Everything is a constant**: every tunable is a plain constant at the top of its component — no hidden config layer.
- **Purely static**: no backend, no router, no API keys; `dist/` runs anywhere, including a subdirectory.
- **AI-assistant friendly**: [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) carry the conventions so Claude Code / Cursor stay on track.

## License and copyright

- **Code**: [MIT](LICENSE), © 2026 Sen Zheng (SEN).
- **Code added by this project** (interaction layer, panels, hotspot layer, camera transition, diagnostic scripts): also released under MIT.
- **Personal content and assets**: name, character model, résumé, project write-ups, brand logos and images are **not** covered by MIT — see [`NOTICE`](NOTICE). Replace them with your own if you fork.
- **Third-party assets** (fonts / HDR): check each source's own license before redistributing.
- **Upstream project**: [`dayinji/sen-3d-resume`](https://github.com/dayinji/sen-3d-resume) — the template supplied the 3D scene setup, the glb camera pipeline and the overall look; this project rebuilt the interaction layer on top of it.
