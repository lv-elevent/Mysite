// 项目与技能数据（双语）。4 个板块 → 每个板块若干条目。
// 纯数据驱动：增删板块 / 条目只改本文件。
//
// 数据来源：吕国庆个人简历（2026-09 版）。四个板块 = 两个个人项目 + 一段实习 + 技能栈。
//
// 板块字段：
//   id        唯一标识（ProfilePanel 用它做 key，也可用于未来的共享元素动画）
//   no        编号 '01'…'04'
//   title     板块标题
//   tagline   副标题（这里统一放技术栈）
//   items[]   条目列表：{ name, meta?, tags?, link?, slug? }
//             点击 item 可弹出详情；补 slug 后由 data/workDocs.ts 关联 content/works/*.md
//   groups[]  分组条目（与 items 二选一）
//   awards[]  奖项 chip（可选）
//   footer    底部备注一行（可选）

export interface WorkListItem {
  name: string
  meta?: string
  tags?: string[]
  link?: string
  slug?: string
}

export interface WorkGroup {
  heading: string
  items: string[]
}

export interface WorkSection {
  id: string
  no: string
  title: string
  tagline: string
  items?: WorkListItem[]
  groups?: WorkGroup[]
  awards?: string[]
  footer?: string
}

export interface WorksLang {
  title: string
  closeLabel: string
  openLabel: string
  hint: string
  awardsLabel: string
  visitLabel: string
  detailPlaceholder: string
  phImageLabel: string
  phButtonLabel: string
  countLabel: (n: number) => string
  sections: WorkSection[]
}

export const WORKS: Record<'zh' | 'en', WorksLang> = {
  zh: {
    title: '项目经验',
    closeLabel: '返回',
    openLabel: '展开详情',
    hint: '继续浏览',
    awardsLabel: '亮点',
    visitLabel: '访问项目',
    detailPlaceholder: '项目详情',
    phImageLabel: '图片 / 视频',
    phButtonLabel: '跳转按钮',
    countLabel: (n) => `${n} 项`,
    sections: [
      {
        id: 'shiyitong',
        no: '01',
        title: '拾医通',
        tagline: 'Go · React · Python · FastAPI · PostgreSQL · pgvector · Redis',
        items: [
          { name: '多阶段文档解析流程', meta: '父子切分 · OCR 回填 · 多模态向量' },
          { name: 'dense + lexical 双路检索', meta: '各召回 Top20，RRF 融合' },
          { name: '证据门控与引用校验', meta: '证据不足时返回 insufficient' },
          { name: '异步出题与总结', meta: '幂等 · 失败重试 · 服务端权限校验' },
        ],
        awards: ['Hit@5 85%+', '图文混合可检索'],
        footer: '面向医学知识库的 AI 学习工具，支持讲义上传、带引用问答、AI 出题和错题复习。',
      },
      {
        id: 'ev-agent',
        no: '02',
        title: 'EV Coding Agent',
        tagline: 'Python · MCP · ReAct · Multi-Agent',
        items: [
          { name: 'MCP 工具按需检索', meta: '工具描述 Token 占用 −85%' },
          { name: '两层上下文压缩 + JSONL 断点恢复', meta: '关键信息保留率 17% → 100%' },
          { name: 'Lead / Teammate 并行重构', meta: '文件级修改隔离，耗时 −60%' },
          { name: '分层权限与可选 OS 沙箱', meta: '单次任务授权确认 30 次 → 5 次' },
        ],
        footer: '搭建基于 SWE-bench-Live 的评测流程，用于定位 Prompt、上下文压缩和工具调用问题。',
      },
      {
        id: 'report-hub',
        no: '03',
        title: '天府报表通',
        tagline: '智能报表 · 语音填报 · 证照识别',
        items: [
          { name: '智能报表 Agent 检索链路', meta: 'Hit@5 70% → 85%+' },
          { name: '四川方言 ASR + 多模态模型', meta: '7 类证照字段准确率 90%+' },
          { name: 'HTML 原生解析链路', meta: '单表错误数 ~5 → <1，Token −10%' },
          { name: '分级并发 + 降级兜底', meta: '端到端耗时 −8%' },
        ],
        footer: '云津智慧科技实习项目，负责智能报表、语音填报与证照识别的检索、表格解析和任务处理链路。',
      },
      {
        id: 'skills',
        no: '04',
        title: '专业技能',
        tagline: 'Python · Go · RAG · Agent · MCP',
        items: [
          { name: '开发基础', meta: 'Python · Go · C/C++ 基础 · Linux · Git' },
          { name: 'AI 应用', meta: 'RAG · Agent · MCP · ASR · 多模态 · 向量检索 · Rerank' },
          { name: '应用开发', meta: 'FastAPI · React · PostgreSQL · pgvector · Redis' },
          { name: '编程工具', meta: 'Codex · Claude Code · Cursor · CodeBuddy' },
        ],
      },
    ],
  },
  en: {
    title: 'Projects',
    closeLabel: 'Back',
    openLabel: 'Explore',
    hint: 'Keep browsing',
    awardsLabel: 'Highlights',
    visitLabel: 'Visit project',
    detailPlaceholder: 'Project details',
    phImageLabel: 'Image / Video',
    phButtonLabel: 'Link button',
    countLabel: (n) => `${n} items`,
    sections: [
      {
        id: 'shiyitong',
        no: '01',
        title: 'Shiyitong',
        tagline: 'Go · React · Python · FastAPI · PostgreSQL · pgvector · Redis',
        items: [
          { name: 'Multi-stage document parsing', meta: 'parent-child chunking · OCR backfill · multimodal embeddings' },
          { name: 'Dense + lexical dual retrieval', meta: 'Top20 each, fused with RRF' },
          { name: 'Evidence gating & citation checks', meta: 'returns insufficient when evidence is lacking' },
          { name: 'Async quiz generation & summaries', meta: 'idempotent · retries · server-side authorisation' },
        ],
        awards: ['Hit@5 85%+', 'Mixed text-and-figure retrieval'],
        footer: 'An AI study tool for a medical knowledge base: lecture upload, cited Q&A, quiz generation and mistake review.',
      },
      {
        id: 'ev-agent',
        no: '02',
        title: 'EV Coding Agent',
        tagline: 'Python · MCP · ReAct · Multi-Agent',
        items: [
          { name: 'On-demand MCP tool retrieval', meta: 'tool-description tokens −85%' },
          { name: 'Two-layer compression + JSONL recovery', meta: 'key-information retention 17% → 100%' },
          { name: 'Lead / Teammate parallel refactoring', meta: 'file-level isolation, time −60%' },
          { name: 'Tiered permissions & optional OS sandbox', meta: 'authorisation prompts 30 → 5 per task' },
        ],
        footer: 'Built a SWE-bench-Live evaluation flow to locate prompt, context-compression and tool-calling issues.',
      },
      {
        id: 'report-hub',
        no: '03',
        title: 'Tianfu Report Hub',
        tagline: 'Intelligent reporting · Voice input · Document OCR',
        items: [
          { name: 'Reporting-agent retrieval pipeline', meta: 'Hit@5 70% → 85%+' },
          { name: 'Sichuan-dialect ASR + multimodal models', meta: 'field accuracy 90%+ across 7 document types' },
          { name: 'HTML-native parsing path', meta: 'per-table errors ~5 → <1, tokens −10%' },
          { name: 'Tiered concurrency + graceful degradation', meta: 'end-to-end latency −8%' },
        ],
        footer: 'Internship project at Yunjin Smart Technology — retrieval, table parsing and task pipelines.',
      },
      {
        id: 'skills',
        no: '04',
        title: 'Skills',
        tagline: 'Python · Go · RAG · Agents · MCP',
        items: [
          { name: 'Foundations', meta: 'Python · Go · basic C/C++ · Linux · Git' },
          { name: 'AI applications', meta: 'RAG · agents · MCP · ASR · multimodal · vector search · rerank' },
          { name: 'Application stack', meta: 'FastAPI · React · PostgreSQL · pgvector · Redis' },
          { name: 'Coding tools', meta: 'Codex · Claude Code · Cursor · CodeBuddy' },
        ],
      },
    ],
  },
}

// 板块配图（横向画廊每张卡片左侧的整高封面）。
// 当前为空 —— 仓库里原有的 4 张图是模板素材，与本人的项目无关，已弃用。
// 缺图时画廊 / 卡片自动回退到「大编号 + 渐变」占位，放入图片后自动点亮：
//   public/works/covers/<section.id>.jpg  （如 shiyitong.jpg）
export const SECTION_COVERS: Record<string, string> = {}

// 统计一个板块的条目数（items 或 groups 求和）
export function sectionCount(section: WorkSection): number {
  if (section.items) return section.items.length
  if (section.groups) return section.groups.reduce((n, g) => n + g.items.length, 0)
  return 0
}
