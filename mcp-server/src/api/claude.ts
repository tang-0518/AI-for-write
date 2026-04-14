// =============================================================
// api/claude.ts — Google Gemini API 封装（MCP Server 专用）
//
// 保持与原 Anthropic 版本相同的导出接口（callClaude），
// 所有 tools/ 文件无需任何修改。
// =============================================================

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 默认主力模型（可通过 env 覆盖）
const DEFAULT_MODEL   = process.env.GEMINI_MODEL         ?? "gemini-2.5-pro";
const EXTRACTOR_MODEL = process.env.GEMINI_MODEL_EXTRACT ?? "gemini-2.5-flash";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("缺少环境变量 GEMINI_API_KEY");
  return key;
}

export interface CallOptions {
  system:     string;
  user:       string;
  maxTokens?: number;
  model?:     string;
}

// ── Gemini REST 调用（非流式） ────────────────────────────
export async function callClaude(opts: CallOptions): Promise<string> {
  const apiKey = getApiKey();
  const model  = opts.model ?? DEFAULT_MODEL;
  const url    = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: opts.system }],
    },
    contents: [
      { role: "user", parts: [{ text: opts.user }] },
    ],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 8192,
      temperature:     0.9,
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(无响应体)");
    throw new Error(`Gemini API 错误 ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as GeminiResponse;

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason;
    throw new Error(`Gemini 返回空内容${reason ? `（原因：${reason}）` : ""}`);
  }

  return text;
}

// ── 导出轻量提取专用调用（给 extractor.ts 使用） ────────────
export async function callGeminiExtract(opts: CallOptions): Promise<string> {
  return callClaude({ ...opts, model: opts.model ?? EXTRACTOR_MODEL });
}

// ── 类型定义 ──────────────────────────────────────────────
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}
