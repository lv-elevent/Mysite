// 履历数据（双语）。
//
// 原定义在 ui/Resume.tsx 内部、未导出，导致「滚动版时间轴」和「模块面板」无法共用。
// Stage A 把它抽到数据层：Resume.tsx 与 panels/CareerPanel.tsx 都从这里取，
// 改履历只改这一处。
//
// ⚠️ 硬约束：entries 的条数必须与 data/focusPoints.ts 的 FOCUS_POINTS 一致
// （相机锚点数量 = 履历条数，见那里的说明）。当前 5 条 ↔ focus-1…focus-5。
// 增删履历时两处必须同步，否则会出现「有节点没镜头」或「有镜头没节点」。
//
// 数据来源：吕国庆个人简历（2026-09 版）。

export interface ResumeGroup {
  heading?: string
  logo?: string
  logoImg?: string
  sub?: string
  link?: string
  items?: string[]
  links?: { id: string; label: string; href: string }[]
}

export interface ResumeEntry {
  period: string
  place: string
  role?: string
  logo?: { src: string; alt: string }
  points?: string[]
  groups?: ResumeGroup[]
}

export const RESUME: Record<'en' | 'zh', { title: string; entries: ResumeEntry[] }> = {
  en: {
    title: 'Résumé',
    entries: [
      {
        period: '2023.09 – 2027.06',
        place: 'Northeast Petroleum University',
        role: 'Software Engineering · B.Eng. (in progress)',
        points: ['Top 15% of major · CET-4 · Multiple university-level scholarships.'],
      },
      {
        period: '2026.06 – 2026.08',
        place: 'Yunjin Smart Technology Co., Ltd.',
        role: 'AI Algorithm Intern · Tianfu Report Hub (AI module)',
        points: [
          'Owned intelligent reporting, voice form-filling and ID-document OCR; worked on retrieval, table parsing and task pipelines.',
          'Optimised chunking, hybrid recall and rerank — Hit@5 on 100+ business questions rose from 70% to 85%+.',
          'Integrated Sichuan-dialect ASR and multimodal models; field-extraction accuracy across 7 document types reached 90%+.',
          'Built an HTML-native parsing path, cutting average per-table field errors from ~5 to under 1 and token cost by 10%+.',
          'Replaced a serial pipeline with tiered concurrency plus global rate limiting, failure isolation and graceful degradation — end-to-end latency down ~8%.',
        ],
      },
      {
        period: '2026.03 – Present',
        place: 'Shiyitong · AI Application',
        role: 'Go · React · Python · FastAPI · PostgreSQL · pgvector · Redis',
        points: [
          'An AI study tool for a medical knowledge base: lecture upload, cited Q&A, AI quiz generation and mistake review.',
          'Designed a multi-stage document parsing pipeline (parent-child chunking + OCR backfill + multimodal embeddings) for mixed text-and-figure PDFs.',
          'Built dense + lexical dual retrieval with RRF fusion, avoiding rank skew from comparing scores across retrieval models.',
          'Added evidence gating, citation allow-lists and slot validation; returns insufficient when evidence is lacking.',
          'Moved quiz generation and summarisation to async tasks with idempotency, retries, result tracking and server-side authorisation.',
        ],
      },
      {
        period: '2026.04 – 2026.07',
        place: 'EV Coding Agent · AI Application',
        role: 'Python · MCP · ReAct · Multi-Agent',
        points: [
          'A lightweight agent for code tasks: multi-model access, MCP tool calling, context management and multi-agent collaboration.',
          'Switched MCP tool descriptions from full injection to on-demand retrieval, cutting their token footprint by 85%.',
          'Two-layer context compression plus JSONL checkpoint recovery raised key-information retention from 17% to 100%.',
          'Split cross-file refactoring into parallel Lead/Teammate tasks with file-level write isolation — refactor time down ~60%.',
          'Tiered permission checks, rule memory and an optional OS sandbox cut authorisation prompts from ~30 to 5 per task.',
        ],
      },
      {
        period: 'Skills',
        place: 'Technical Stack & Tooling',
        role: 'AI Applications · Backend · Toolchain',
        points: [
          'Foundations: Python, Go, basic C/C++; Linux, Git.',
          'AI applications: RAG, agents, MCP, ASR, multimodal models, vector search, hybrid retrieval, rerank.',
          'Application stack: FastAPI, React, PostgreSQL, pgvector, Redis.',
          'Coding tools: Codex, Claude Code, Cursor, CodeBuddy.',
        ],
      },
    ],
  },
  zh: {
    title: 'Résumé',
    entries: [
      {
        period: '2023.09 – 2027.06',
        place: '东北石油大学',
        role: '软件工程 · 本科（在读）',
        points: ['专业排名前 15% · CET-4 · 多次获得校级奖学金。'],
      },
      {
        period: '2026.06 – 2026.08',
        place: '云津智慧科技有限公司',
        role: 'AI 算法实习生 · 天府报表通（AI 模块）',
        points: [
          '负责智能报表、语音填报和证照识别相关功能，主要参与检索、表格解析和任务处理链路开发。',
          '参与智能报表 Agent 的检索链路，针对 100+ 个业务问题优化文本切片、混合召回和 Rerank，将 Hit@5 从 70% 提升至 85%+。',
          '接入四川方言 ASR 和多模态模型，结合字段映射与人工兜底，将 7 类证照字段提取准确率提升至 90%+。',
          '针对复杂表格解析误差，设计 HTML 原生解析链路，将单表数据项平均错误数从约 5 个降至 1 个以内，同时降低 Token 成本 10%+。',
          '将原有串行流程改为分级并发，引入全局限流、失败隔离和降级兜底，端到端处理耗时降低约 8%。',
        ],
      },
      {
        period: '2026.03 – 至今',
        place: '拾医通 · AI 应用开发',
        role: 'Go · React · Python · FastAPI · PostgreSQL · pgvector · Redis',
        points: [
          '面向医学知识库的 AI 学习工具，支持讲义上传、带引用问答、AI 出题和错题复习。',
          '针对医学 PDF 中表格、图片和复杂排版难以解析的问题，设计多阶段文档解析流程，结合父子切分、OCR 回填和多模态向量。',
          '设计 dense + lexical 双路检索，两路分别召回 Top20 后使用 RRF 融合，避免直接比较不同检索模型分数造成排序偏差。',
          '增加证据门控、引用白名单和槽位校验，证据不足时返回 insufficient，避免使用通用知识替代医学证据。',
          '将 AI 出题和总结改为异步任务，支持幂等、失败重试、结果追踪和服务端权限校验。',
        ],
      },
      {
        period: '2026.04 – 2026.07',
        place: 'EV Coding Agent · AI 应用开发',
        role: 'Python · MCP · ReAct · Multi-Agent',
        points: [
          '面向代码任务的轻量级 Agent，支持多模型接入、MCP 工具调用、上下文管理和多 Agent 协作。',
          '针对百级 MCP 工具描述占用上下文问题，工具说明从全量注入改为按需检索，工具描述 Token 占用降低 85%。',
          '针对长会话容易丢失前文的问题，增加两层上下文压缩和 JSONL 断点恢复，关键信息保留率由 17% 提升至 100%。',
          '将跨文件重构拆分为 Lead/Teammate 并行任务，并增加文件级修改隔离，使重构耗时降低约 60%。',
          '增加分层权限校验、规则记忆和可选 OS 沙箱，将一次任务中的授权确认次数从约 30 次降至 5 次。',
        ],
      },
      {
        period: '专业技能',
        place: '技术栈与工具链',
        role: 'AI 应用 · 后端 · 工程工具',
        points: [
          '开发基础：Python、Go、C/C++ 基础；Linux、Git。',
          'AI 应用：RAG、Agent、MCP、ASR、多模态模型、向量检索、混合检索、Rerank。',
          '应用开发：FastAPI、React、PostgreSQL、pgvector、Redis。',
          '编程工具：Codex、Claude Code、Cursor、CodeBuddy 等。',
        ],
      },
    ],
  },
}
