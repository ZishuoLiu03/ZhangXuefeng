// models.ts

export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";

export const titleModel = {
  id: 'google/gemini-2.5-flash',
  name: "Gemini 2.5 Flash",
  provider: "gemini",
  description: "Fast model with tool use",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

// 💡 确保数组里的 id 和 DEFAULT_CHAT_MODEL 完全一模一样！
export const chatModels: ChatModel[] = [
  {
    id: 'google/gemini-2.5-flash',
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "速度极快，直连谷歌官方 API",
  }
];

// 💡 核心改动：不再请求 https://ai-gateway.vercel.sh，直接写死返回能力！
export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return {
    'google/gemini-2.5-flash': {
      tools: true,   // 开启工具支持
      vision: true,  // 开启视觉支持
      reasoning: false,
    }
  };
}

export const isDemo = process.env.IS_DEMO === "1";

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);