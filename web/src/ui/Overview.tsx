// 总览层：姓名 + 一句话定位 + 「点击形象上的元素」引导。
//
// 只在 active === null（总览态）时可见；打开任一模块面板时淡出并让出点击。
// 位置与首屏装饰（hero-chrome）错开，避免和四角标打架。
//
// 交互驱动下没有滚动，这一层就是唯一的「入口说明」——
// 所以除了姓名和身份，必须有一句「这里可以点」的明确引导，否则用户会以为这是张静态图。

import { motion } from 'framer-motion'
import { useStore } from '../store'

export default function Overview() {
  const active = useStore((s) => s.active)
  const open = active === null

  return (
    <motion.div
      className="overview"
      initial={false}
      animate={{ opacity: open ? 1 : 0, y: open ? 0 : -10 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: open ? 'auto' : 'none' }}
      aria-hidden={!open}
    >
      {/* 只留英文名：中英混排时两段字重不同，视觉重心会偏，
          去掉中文后英文成为唯一的姓名标识，居中且分量更足。
          中文名保留在左上角标（App.tsx 的 hm-tl）里，可读性不受影响。 */}
      <h1 className="overview-name">Lv Guoqing</h1>
      <p className="overview-role">AI Agent · AI 应用开发</p>
      <p className="overview-desc">RAG · Agent · MCP —— 把效果问题拆成可度量的指标，再逐个优化。</p>
      <p className="overview-hint">
        <span className="overview-hint-dot" aria-hidden="true" />
        点击形象上的元素，查看对应内容
      </p>
    </motion.div>
  )
}
