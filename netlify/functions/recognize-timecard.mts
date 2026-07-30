import type { Config, Context } from "@netlify/functions";

type TimecardRequest = {
  images?: unknown;
  month?: unknown;
  half?: unknown;
};

type AiPunch = {
  day: number;
  printedRow: number;
  time: string;
  column: number;
  readable: boolean;
  confidence: number;
  note: string;
};

type AiResult = {
  cardHalf: "first" | "second" | "unknown";
  punches: AiPunch[];
  overallConfidence: number;
  summary: string;
};

const MAX_BODY_BYTES = 5_700_000;
const MAX_IMAGE_DATA_URL_LENGTH = 2_700_000;
const ALLOWED_IMAGE_PREFIX = /^data:image\/(?:jpeg|png|webp);base64,/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function readOpenAiOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  return payload.output
    .flatMap(item => {
      if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) return [];
      return (item as { content: unknown[] }).content;
    })
    .map(content => {
      if (!content || typeof content !== "object") return "";
      const item = content as { type?: unknown; text?: unknown };
      return item.type === "output_text" && typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("");
}

function readGeminiOutputText(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.candidates)) return "";
  return payload.candidates
    .flatMap(candidate => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map(part => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("");
}

function splitImageDataUrl(imageUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(imageUrl);
  if (!match) throw new Error("INVALID_IMAGE_DATA");
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function normalizeResult(value: unknown): AiResult {
  if (!value || typeof value !== "object") throw new Error("INVALID_AI_RESULT");
  const source = value as Partial<AiResult>;
  const cardHalf = source.cardHalf === "first" || source.cardHalf === "second"
    ? source.cardHalf
    : "unknown";
  const punches = Array.isArray(source.punches)
    ? source.punches.slice(0, 96).map(item => ({
      day: Math.max(0, Math.min(31, Math.round(Number(item?.day) || 0))),
      printedRow: Math.max(0, Math.min(31, Math.round(Number(item?.printedRow) || 0))),
      time: typeof item?.time === "string" ? item.time.trim() : "",
      column: Math.max(0, Math.min(5, Math.round(Number(item?.column) || 0))),
      readable: Boolean(item?.readable),
      confidence: Math.max(0, Math.min(100, Math.round(Number(item?.confidence) || 0))),
      note: typeof item?.note === "string" ? item.note.slice(0, 160) : ""
    }))
    : [];
  return {
    cardHalf,
    punches,
    overallConfidence: Math.max(0, Math.min(100, Math.round(Number(source.overallConfidence) || 0))),
    summary: typeof source.summary === "string" ? source.summary.slice(0, 500) : ""
  };
}

function buildPrompt(month: string, half: string) {
  return [
    "你是台灣餐飲店打卡卡片的影像稽核員。請逐一讀取照片中的實體點陣印章。",
    "每一個印章包含兩組資訊：正向數字是 HH:MM 上下班時間；倒置（上下顛倒）的數字是該次打卡的實際日期日數。",
    "印章可能跨越水平格線或蓋在錯誤日期列，所以絕對不可只用表格列號推測實際日期。",
    "請先在腦中旋轉倒置數字以讀取 day，再讀正向時間。printedRow 是印章視覺上最接近的表格日期列，只用於回看裁切。",
    "column 依卡片由左至右固定為 0 上午上班、1 上午下班、2 下午上班、3 下午下班、4 加班上班、5 加班下班。",
    "同一格可能有淡色、斷點或格線穿過。請交叉比對原圖與增強圖，但不要補猜看不清楚的數字。",
    "若實際倒置日期看不清楚，day 填 0；若正向時間看不清楚，time 填空字串且 readable=false。",
    "只回傳照片中真正看得到的印章，不要為空白日期建立紀錄。",
    `月份：${month || "未提供"}；卡片範圍：${half === "first" ? "1～15 日" : "16～31 日"}。`,
    "對每個印章提供 0～100 的 confidence；任何不確定都必須降低信心並寫在 note。",
    "只回傳一個 JSON 物件，不要加 Markdown。最外層包含 cardHalf、punches、overallConfidence、summary。",
    "cardHalf 只能是 first、second 或 unknown。punches 每筆包含 day、printedRow、time、column、readable、confidence、note。"
  ].join("\n");
}

const outputSchema = {
  type: "object",
  properties: {
    cardHalf: { type: "string", enum: ["first", "second", "unknown"] },
    punches: {
      type: "array",
      maxItems: 96,
      items: {
        type: "object",
        properties: {
          day: { type: "integer", minimum: 0, maximum: 31 },
          printedRow: { type: "integer", minimum: 0, maximum: 31 },
          time: { type: "string" },
          column: { type: "integer", minimum: 0, maximum: 5 },
          readable: { type: "boolean" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          note: { type: "string" }
        },
        required: ["day", "printedRow", "time", "column", "readable", "confidence", "note"],
        additionalProperties: false
      }
    },
    overallConfidence: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" }
  },
  required: ["cardHalf", "punches", "overallConfidence", "summary"],
  additionalProperties: false
} as const;

type ProviderResult = {
  result: AiResult;
  model: string;
  provider: "gemini" | "openai";
};

class ProviderRequestError extends Error {
  provider: "gemini" | "openai";
  status: number;
  code: string;

  constructor(provider: "gemini" | "openai", status: number, code: string) {
    super(`${provider.toUpperCase()}_REQUEST_FAILED`);
    this.provider = provider;
    this.status = status;
    this.code = code;
  }
}

async function recognizeWithGemini(
  apiKey: string,
  images: string[],
  month: string,
  half: string,
  signal: AbortSignal,
  requestId: string
): Promise<ProviderResult> {
  const model = Netlify.env.get("GEMINI_VISION_MODEL") || "gemini-2.5-flash";
  const imageParts = images.map(imageUrl => {
    const image = splitImageDataUrl(imageUrl);
    return {
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    };
  });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "精確讀取打卡卡片影像並依 JSON Schema 回傳。看不清楚時不可猜測。"
          }]
        },
        contents: [{
          role: "user",
          parts: [
            { text: buildPrompt(month, half) },
            ...imageParts
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 5000,
          responseMimeType: "application/json"
        }
      }),
      signal
    }
  );

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error && typeof payload.error === "object"
      ? payload.error as { status?: unknown; code?: unknown; message?: unknown }
      : {};
    console.error("Gemini timecard request failed", {
      requestId,
      status: response.status,
      code: apiError.status || apiError.code,
      message: typeof apiError.message === "string" ? apiError.message.slice(0, 500) : ""
    });
    throw new ProviderRequestError(
      "gemini",
      response.status,
      String(apiError.status || apiError.code || "")
    );
  }

  const outputText = readGeminiOutputText(payload);
  if (!outputText) throw new Error("EMPTY_GEMINI_RESULT");
  return {
    result: normalizeResult(JSON.parse(outputText)),
    model,
    provider: "gemini"
  };
}

async function recognizeWithOpenAi(
  apiKey: string,
  images: string[],
  month: string,
  half: string,
  signal: AbortSignal,
  requestId: string
): Promise<ProviderResult> {
  const model = Netlify.env.get("OPENAI_VISION_MODEL") || "gpt-5.6-sol";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 5000,
      input: [
        {
          role: "system",
          content: "精確讀取打卡卡片影像並依 JSON Schema 回傳。看不清楚時不可猜測。"
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: buildPrompt(month, half) },
            ...images.map(imageUrl => ({
              type: "input_image",
              image_url: imageUrl,
              detail: "original"
            }))
          ]
        }
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "timecard_reading",
          schema: outputSchema,
          strict: true
        }
      },
      safety_identifier: "breakfast-payroll-timecard"
    }),
    signal
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error && typeof payload.error === "object"
      ? payload.error as { code?: unknown }
      : {};
    console.error("OpenAI timecard request failed", {
      requestId,
      status: response.status,
      code: apiError.code
    });
    throw new ProviderRequestError(
      "openai",
      response.status,
      String(apiError.code || "")
    );
  }

  const outputText = readOpenAiOutputText(payload);
  if (!outputText) throw new Error("EMPTY_OPENAI_RESULT");
  return {
    result: normalizeResult(JSON.parse(outputText)),
    model,
    provider: "openai"
  };
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED", message: "只接受 POST 請求。" }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "IMAGE_TOO_LARGE", message: "照片資料過大，請縮小後重試。" }, 413);
  }

  const expectedToken = Netlify.env.get("TIME_CARD_API_TOKEN") || "";
  const suppliedToken = req.headers.get("x-timecard-token") || "";
  if (!expectedToken) {
    return jsonResponse({
      error: "SERVER_NOT_CONFIGURED",
      message: "Netlify 尚未設定 TIME_CARD_API_TOKEN。"
    }, 503);
  }
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return jsonResponse({ error: "INVALID_ACCESS_TOKEN", message: "AI 辨識連線密碼不正確。" }, 401);
  }

  const geminiApiKey = Netlify.env.get("GEMINI_API_KEY") || "";
  const openAiApiKey = Netlify.env.get("OPENAI_API_KEY") || "";
  if (!geminiApiKey && !openAiApiKey) {
    return jsonResponse({
      error: "SERVER_NOT_CONFIGURED",
      message: "Netlify 尚未設定 GEMINI_API_KEY 或 OPENAI_API_KEY。"
    }, 503);
  }

  let payload: TimecardRequest;
  try {
    payload = await req.json() as TimecardRequest;
  } catch {
    return jsonResponse({ error: "INVALID_JSON", message: "無法讀取照片請求。" }, 400);
  }

  const images = Array.isArray(payload.images)
    ? payload.images.filter((image): image is string => (
      typeof image === "string" &&
      image.length <= MAX_IMAGE_DATA_URL_LENGTH &&
      ALLOWED_IMAGE_PREFIX.test(image)
    )).slice(0, 2)
    : [];
  if (!images.length) {
    return jsonResponse({ error: "INVALID_IMAGE", message: "未收到可辨識的 JPG、PNG 或 WebP 圖片。" }, 400);
  }

  const month = typeof payload.month === "string" && /^\d{4}-\d{2}$/.test(payload.month)
    ? payload.month
    : "";
  const half = payload.half === "second" ? "second" : "first";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 52_000);

  try {
    const recognition = geminiApiKey
      ? await recognizeWithGemini(
        geminiApiKey,
        images,
        month,
        half,
        controller.signal,
        context.requestId
      )
      : await recognizeWithOpenAi(
        openAiApiKey,
        images,
        month,
        half,
        controller.signal,
        context.requestId
      );
    return jsonResponse({
      result: recognition.result,
      model: recognition.model,
      provider: recognition.provider,
      requestId: context.requestId
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    console.error("Timecard recognition failed", {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : "unknown"
    });
    if (error instanceof ProviderRequestError) {
      const isRateLimit = error.status === 429;
      const isCredentialsError = [401, 403].includes(error.status);
      const providerName = error.provider === "gemini" ? "Gemini" : "OpenAI";
      return jsonResponse({
        error: isRateLimit ? "AI_RATE_LIMIT" : "AI_REQUEST_FAILED",
        message: isRateLimit
          ? `${providerName} 免費辨識額度暫時達到上限，請稍後再試。`
          : isCredentialsError
            ? `${providerName} API Key 無效或沒有使用權限，請檢查 Netlify 環境變數。`
            : `${providerName} 暫時無法完成辨識，請稍後重試。`,
        provider: error.provider,
        requestId: context.requestId
      }, isRateLimit ? 429 : 502);
    }
    return jsonResponse({
      error: isTimeout ? "AI_TIMEOUT" : "INVALID_AI_RESPONSE",
      message: isTimeout
        ? "AI 辨識超過等待時間，請重試一次。"
        : "AI 回傳內容無法讀取，請重試或改用人工核對。",
      requestId: context.requestId
    }, isTimeout ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
};

export const config: Config = {
  path: "/api/recognize-timecard",
  method: ["POST"]
};
