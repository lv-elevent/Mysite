// 模块 3：兴趣与旅行。
//
// 内容来自 data/life.ts（本人 2026-09-21 口述，非简历内容）。
// 分两组渲染 —— 兴趣（2 条）和足迹（4 条）：
// 一组是「在折腾什么」，一组是「去过哪」，语气不同，混在一起读会很跳；
// 分组后每组还有独立的小标题，扫读成本也低。
//
// 之前这里是空状态（虚线框 + 图标 + 说明），内容到位后换回实体卡片。

import { lifeOf, type LifeGroup } from '../data/life'

const GROUPS: readonly { id: LifeGroup; title: string; note: string }[] = [
  { id: 'interest', title: '兴趣', note: '工作之外在折腾什么' },
  { id: 'travel', title: '足迹', note: '去过并且记得住的地方' },
] as const

export default function LifePanel() {
  return (
    <div className="panel-stack">
      {GROUPS.map((g) => {
        const items = lifeOf(g.id)
        if (items.length === 0) return null

        return (
          <section className="panel-block" key={g.id}>
            <h3 className="panel-block-title">
              {g.title}
              <span className="panel-block-note">{g.note}</span>
            </h3>

            <div className="panel-grid">
              {items.map((item, i) => (
                <article className={`panel-card panel-card--${g.id}`} key={item.title}>
                  <span className="panel-card-no">{String(i + 1).padStart(2, '0')}</span>
                  <h4 className="panel-card-title">{item.title}</h4>
                  <p className="panel-card-tagline">{item.desc}</p>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
