// =============================================================
// types/styleProfile.ts — 文风档案类型
// =============================================================

/** AI 分析出的文风特征（各字段均为简洁描述，≤60字） */
export interface StyleAnalysis {
  sentenceStyle: string;    // 句式特点（长短、节奏、倒装等）
  dialogueStyle: string;    // 对话特点（频率、格式、氛围）
  descriptionStyle: string; // 描写风格（环境/心理/动作比例）
  narrativePOV: string;     // 叙事视角与叙述距离
  pacingStyle: string;      // 节奏特点（快慢、起伏、留白）
  vocabularyStyle: string;  // 词汇层次（文言/白话/网络/古典）
  emotionStyle: string;     // 情感表达方式（外显/内敛/克制）
  uniquePatterns: string;   // 独特规律（反复出现的写法）
}

/**
 * 文风档案 — 一份完整的可复用文风描述。
 * 存于 IndexedDB style_profiles store。
 */
export interface StyleProfile {
  id: string;
  name: string;                // 用户命名，如"金庸武侠风"
  sourceBookId: string;        // 来源书目 ID
  sourceChapterIds: string[];  // 参与分析的章节 ID 列表
  analyzedAt: number;          // 分析时间 Unix ms

  analysis: StyleAnalysis;

  /**
   * 精炼的续写注入指令，"；"分隔，≤5条，每条≤25字。
   * 直接嵌入 prompt，需高度凝练。
   */
  directive: string;

  /**
   * 精选原文段落（最多 2 段，每段 ≤ 300 字）。
   * 用作 few-shot exemplar，提升风格一致性。
   */
  exemplars: string[];
}
