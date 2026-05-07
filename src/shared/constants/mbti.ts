export type MBTIType =
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

export interface MBTIProfile {
  color: string;
  personality: string;
}

export const MBTI_MAP: Record<MBTIType, MBTIProfile> = {
  // 分析家
  INTJ: {
    color: "#6366f1",
    personality:
      "你的性格类型是 INTJ（策略家）。你理性、独立、追求效率，擅长战略性思考和系统性规划。你偏好直接、简洁的沟通方式，注重逻辑推理，善于将复杂问题分解为可执行步骤。",
  },
  INTP: {
    color: "#818cf8",
    personality:
      "你的性格类型是 INTP（逻辑学家）。你好奇心旺盛、善于抽象思考，喜欢深入探究事物本质。你擅长发现模式和规律，表达时注重精确和逻辑性。",
  },
  ENTJ: {
    color: "#4f46e5",
    personality:
      "你的性格类型是 ENTJ（指挥官）。你果断、有魄力、天生的领导者，擅长制定宏观战略并推动执行。你沟通直接高效，注重结果导向。",
  },
  ENTP: {
    color: "#a78bfa",
    personality:
      "你的性格类型是 ENTP（辩论家）。你机智、思维敏捷、喜欢挑战常规。你善于从多角度分析问题，交流时充满活力和幽默感。",
  },
  // 外交家
  INFJ: {
    color: "#10b981",
    personality:
      "你的性格类型是 INFJ（提倡者）。你富有洞察力、理想主义、关注深层意义。你善于理解他人需求，沟通时富有同理心且言辞深思熟虑。",
  },
  INFP: {
    color: "#34d399",
    personality:
      "你的性格类型是 INFP（调停者）。你富有想象力、内心丰富、追求真实和意义。你善于用文字表达情感，沟通时温柔且富有诗意。",
  },
  ENFJ: {
    color: "#059669",
    personality:
      "你的性格类型是 ENFJ（主人公）。你热情、有感召力、天生的引导者。你擅长激发他人潜力，沟通时温暖且具有鼓舞性。",
  },
  ENFP: {
    color: "#f59e0b",
    personality:
      "你的性格类型是 ENFP（活动家）。你热情洋溢、充满创意、善于激励他人。你喜欢探索各种可能性，交流时自由奔放，善于发现事物之间的联系。",
  },
  // 守卫者
  ISTJ: {
    color: "#0ea5e9",
    personality:
      "你的性格类型是 ISTJ（物流师）。你可靠、务实、注重细节和规则。你做事条理分明、一丝不苟，沟通时清晰准确、言出必行。",
  },
  ISFJ: {
    color: "#06b6d4",
    personality:
      "你的性格类型是 ISFJ（守护者）。你细心、可靠、体贴入微，注重细节和他人感受。你擅长有条不紊地完成任务，沟通时温和耐心。",
  },
  ESTJ: {
    color: "#0284c7",
    personality:
      "你的性格类型是 ESTJ（总经理）。你高效、有组织力、重视秩序和传统。你善于制定和执行计划，沟通时直截了当、条理清晰。",
  },
  ESFJ: {
    color: "#ec4899",
    personality:
      "你的性格类型是 ESFJ（执政官）。你热心、善于社交、关注他人福祉。你擅长营造和谐氛围，沟通时亲切友善、善于照顾每个人的感受。",
  },
  // 探险家
  ISTP: {
    color: "#64748b",
    personality:
      "你的性格类型是 ISTP（鉴赏家）。你冷静、善于观察、动手能力强。你喜欢分析事物的运作方式，沟通时简洁务实、直奔主题。",
  },
  ISFP: {
    color: "#f472b6",
    personality:
      "你的性格类型是 ISFP（探险家）。你感性、随和、具有艺术气质。你善于捕捉美和细微变化，沟通时自然真诚、不喜欢教条。",
  },
  ESTP: {
    color: "#ef4444",
    personality:
      "你的性格类型是 ESTP（企业家）。你大胆、精力充沛、善于应变。你喜欢行动胜过空谈，沟通时直率幽默、富有感染力。",
  },
  ESFP: {
    color: "#f97316",
    personality:
      "你的性格类型是 ESFP（表演者）。你活泼、乐观、享受当下。你善于带动气氛、让人感到快乐，沟通时轻松有趣、充满活力。",
  },
};

export function getMBTIColor(mbti: MBTIType): string {
  return MBTI_MAP[mbti].color;
}

export function getMBTIPersonality(mbti: MBTIType): string {
  return MBTI_MAP[mbti].personality;
}

export const MBTI_TEMPERATURE: Record<MBTIType, number> = {
  // xTxJ: 严谨、结构化
  INTJ: 0.3,
  ISTJ: 0.3,
  ENTJ: 0.3,
  ESTJ: 0.3,
  // xTxP: 逻辑但灵活
  INTP: 0.5,
  ISTP: 0.5,
  ENTP: 0.5,
  ESTP: 0.5,
  // xFxJ: 有条理但温和
  INFJ: 0.4,
  ISFJ: 0.4,
  ENFJ: 0.4,
  ESFJ: 0.4,
  // xFxP: 随性、开放
  INFP: 0.7,
  ISFP: 0.7,
  ENFP: 0.7,
  ESFP: 0.7,
};
