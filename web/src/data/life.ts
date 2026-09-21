// 模块 3「兴趣与旅行」的数据源。
//
// 内容来源：本人 2026-09-21 口述 —— 兴趣 = AIGC 创作、游戏；
// 去过 = 成都、大连、北京、黑龙江老家。简历里没有这块，所以这里只写「感受」，
// 不写时间线、不写具体行程，避免编造没发生过的细节。
//
// 一条 = 一个兴趣 或 一个去过的城市，用 group 分组渲染。

export type LifeGroup = 'interest' | 'travel'

export interface LifeItem {
  /** 标题 */
  title: string
  /** 一句话描述 */
  desc: string
  /** 分组：interest = 兴趣，travel = 足迹 */
  group: LifeGroup
}

export const LIFE: readonly LifeItem[] = [
  {
    group: 'interest',
    title: 'AIGC 创作',
    desc: '用生成模型做图、做短片、搭小工具 —— 把脑子里冒出来的东西尽快变成能看的样子。',
  },
  {
    group: 'interest',
    title: '游戏',
    desc: '长期玩家。玩得多了会不自觉地拆关卡设计、交互反馈和难度曲线。',
  },
  {
    group: 'travel',
    title: '成都',
    desc: '生活节奏慢，烟火气足 —— 待久了会不想走。',
  },
  {
    group: 'travel',
    title: '大连',
    desc: '海风、坡道、很长的海岸线。',
  },
  {
    group: 'travel',
    title: '北京',
    desc: '大得让人有点敬畏，也让人想再多看几眼。',
  },
  {
    group: 'travel',
    title: '黑龙江老家',
    desc: '出生长大的地方。冬天的雪和夏天的夜晚，是记忆里最清楚的两种画面。',
  },
]

/** 按分组取条目，顺序沿用 LIFE 里的书写顺序 */
export function lifeOf(group: LifeGroup): LifeItem[] {
  return LIFE.filter((item) => item.group === group)
}
