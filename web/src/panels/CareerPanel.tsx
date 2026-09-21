// 模块 2：实习与项目经历。
//
// 数据来自 data/resume.ts（与滚动版简历同一份），条目数必须与 FOCUS_POINTS 一致。
// 本轮视觉升级：给每条加「机构徽章 + 卡片底」，让时间轴从一串裸文字变成有层次的条目。
// 徽章取机构名前两字 —— 简历里没有 logo 素材，用文字徽章先顶上，
// 将来补了 logo 图只要把 badge 换成 <img> 即可。

import { RESUME } from '../data/resume'

export default function CareerPanel() {
  const { entries } = RESUME.zh
  return (
    <div className="panel-timeline">
      {entries.map((e, i) => (
        <article className="panel-entry" key={i}>
          <div className="panel-entry-rail" aria-hidden="true">
            <span className="panel-entry-dot" />
          </div>
          <div className="panel-entry-body">
            <header className="panel-entry-head">
              <span className="panel-entry-badge" aria-hidden="true">
                {e.place.slice(0, 2)}
              </span>
              <div className="panel-entry-headtext">
                <div className="panel-entry-period">{e.period}</div>
                <h3 className="panel-entry-place">{e.place}</h3>
              </div>
            </header>
            {e.role && <p className="panel-entry-role">{e.role}</p>}
            {e.points && (
              <ul className="panel-entry-points">
                {e.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
