// Multi-provider LLM abstraction layer
// Supports z-ai-web-dev-sdk (default) and NVIDIA NIM API (OpenAI-compatible)

import ZAI from 'z-ai-web-dev-sdk';

// ── Types ────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface LLMStreamChunk {
  content?: string;
  done?: boolean;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

// ── Provider Configuration ───────────────────────────────────────

export interface ModelOption {
  id: string;
  name: string;
  provider: 'zai' | 'nvidia';
  description: string;
  maxTokens: number;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'z-ai/glm4.7',
    name: 'GLM 4.7',
    provider: 'nvidia',
    description: 'Zhipu AI GLM 4.7 — 强大的中文理解和代码生成能力',
    maxTokens: 8192,
  },
  {
    id: 'z-ai/glm5',
    name: 'GLM 5',
    provider: 'nvidia',
    description: 'Zhipu AI GLM 5 — 最新一代大模型，推理能力更强',
    maxTokens: 8192,
  },
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi 2.5',
    provider: 'nvidia',
    description: 'Moonshot AI Kimi 2.5 — 长上下文，优秀的指令遵循能力',
    maxTokens: 8192,
  },
  {
    id: 'default',
    name: 'Default (z-ai-sdk)',
    provider: 'zai',
    description: 'Default AI model via z-ai-web-dev-sdk (local only)',
    maxTokens: 4096,
  },
];

export function getModelInfo(modelId: string): ModelOption {
  return AVAILABLE_MODELS.find((m) => m.id === modelId) ?? AVAILABLE_MODELS[0];
}

// ── z-ai-web-dev-sdk Provider ────────────────────────────────────

async function chatWithZAI(
  messages: LLMMessage[],
  _model: string,
  stream: false
): Promise<LLMResponse>;

async function chatWithZAI(
  messages: LLMMessage[],
  _model: string,
  stream: true
): Promise<ReadableStream<Uint8Array>>;

async function chatWithZAI(
  messages: LLMMessage[],
  _model: string,
  stream: boolean
): Promise<LLMResponse | ReadableStream<Uint8Array>> {
  const zai = await ZAI.create();

  if (stream) {
    const sdkStream = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: 'disabled' },
    });
    return sdkStream as unknown as ReadableStream<Uint8Array>;
  }

  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  });

  const reply = completion.choices[0]?.message?.content || 'No response generated.';
  return {
    content: reply,
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined,
  };
}

// ── NVIDIA NIM Provider (OpenAI-compatible) ──────────────────────

async function chatWithNVIDIA(
  messages: LLMMessage[],
  model: string,
  stream: false,
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<LLMResponse>;

async function chatWithNVIDIA(
  messages: LLMMessage[],
  model: string,
  stream: true,
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<ReadableStream<Uint8Array>>;

async function chatWithNVIDIA(
  messages: LLMMessage[],
  model: string,
  stream: boolean,
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<LLMResponse | ReadableStream<Uint8Array>> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured. Please set it in .env.local');
  }

  // Set timeout to prevent hanging on slow/unavailable models
  const controller = new AbortController();
  const timeoutMs = 90000; // 90 seconds
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (stream) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.95,
          ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('NVIDIA API returned no response body');
      }

      return response.body;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.95,
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated.';

    return {
      content: reply,
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`NVIDIA API request timed out after ${timeoutMs / 1000}s. The model "${model}" might be temporarily unavailable. Please try again or use a different model.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ── Unified Chat Function ────────────────────────────────────────

export async function chat(
  messages: LLMMessage[],
  modelId: string = 'default'
): Promise<LLMResponse> {
  const modelInfo = getModelInfo(modelId);

  if (modelInfo.provider === 'nvidia') {
    return chatWithNVIDIA(messages, modelInfo.id, false) as Promise<LLMResponse>;
  }

  return chatWithZAI(messages, modelInfo.id, false) as Promise<LLMResponse>;
}

export async function chatStream(
  messages: LLMMessage[],
  modelId: string = 'default',
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
): Promise<ReadableStream<Uint8Array>> {
  const modelInfo = getModelInfo(modelId);

  if (modelInfo.provider === 'nvidia') {
    return chatWithNVIDIA(messages, modelInfo.id, true, tools) as Promise<ReadableStream<Uint8Array>>;
  }

  return chatWithZAI(messages, modelInfo.id, true, tools) as Promise<ReadableStream<Uint8Array>>;
}
