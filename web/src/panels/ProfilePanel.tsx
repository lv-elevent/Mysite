// 模块 1：个人信息 + 项目与技能。
//
// 项目与技能直接复用 data/works.ts 的 WORKS.zh.sections —— 与横向画廊同一份数据，
// 加项目只改 works.ts 一处，面板与画廊自动同步。
//
// 本轮视觉升级：原来的卡片是「编号 + 标题 + 副标题 + 件数」四行纯文字，
// 信息密度低、没有视觉锚点。现在改成「左侧编号封面块 + 右侧标题/技术栈/前三条成果」，
// 封面块承担视觉重量，条目预览承担信息量。

import { WORKS } from '../data/works'

const INTRO = [
  '我是吕国庆，东北石油大学软件工程在读，方向是 AI Agent 与 AI 应用开发。',
  '主要在做 RAG、Agent 与 MCP 的工程落地：检索链路、上下文管理、工具调用和任务编排，习惯把效果问题拆成可度量的指标，再逐个优化。',
]

const FACTS = [
  { k: '学校', v: '东北石油大学 · 软件工程（在读）' },
  { k: '方向', v: 'AI Agent · AI 应用开发' },
  { k: '求职', v: '可实习 / 可全职' },
]

export default function ProfilePanel() {
  const sections = WORKS.zh.sections

  return (
    <div className="panel-stack">
      <section className="panel-block">
        <h3 className="panel-block-title">关于我</h3>
        {INTRO.map((p, i) => (
          <p className="panel-text" key={i}>
            {p}
          </p>
        ))}
        <dl className="panel-facts">
          {FACTS.map((f) => (
            <div className="panel-fact" key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel-block">
        <h3 className="panel-block-title">项目与技能</h3>
        <div className="panel-works">
          {sections.map((s) => (
            <article className="panel-work" key={s.id}>
              <div className="panel-work-cover" aria-hidden="true">
                <span className="panel-work-no">{s.no}</span>
              </div>
              <div className="panel-work-body">
                <h4 className="panel-work-title">{s.title}</h4>
                <p className="panel-work-tagline">{s.tagline}</p>
                {s.items && (
                  <ul className="panel-work-items">
                    {s.items.slice(0, 3).map((it, i) => (
                      <li key={i}>
                        <span className="panel-work-name">{it.name}</span>
                        {it.meta && <span className="panel-work-meta">{it.meta}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {s.items && (
                  <span className="panel-work-count">{s.items.length} 项</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
