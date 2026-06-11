// models.ts

export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";

export const titleModel = {
  id: "google/gemini-2.5-flash",
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

export const chatModels: ChatModel[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "速度极快，直连谷歌官方 API",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "gemini",
    description: "极速轻量模型，超低延迟响应",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    description: "高性价比次世代轻量大模型",
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "gemini",
    description: "全新架构第三代平衡型主力模型",
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "gemini",
    description: "性能强悍，具备极高的推理与响应速度",
  }
];

export function getCapabilities(): Record<string, ModelCapabilities> {
  return {
    "google/gemini-2.5-flash": {
      tools: true, 
      vision: true, 
      reasoning: false,
    },
    "google/gemini-2.5-flash-lite": {
      tools: true, 
      vision: true, 
      reasoning: false,
    },
    "google/gemini-3.1-flash-lite": {
      tools: true, 
      vision: true, 
      reasoning: false,
    },
    "google/gemini-3-flash": {
      tools: true, 
      vision: true, 
      reasoning: false,
    },
    "google/gemini-3.5-flash": {
      tools: true, 
      vision: true, 
      reasoning: false,
    },
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
