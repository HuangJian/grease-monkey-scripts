import type { Runtime } from '../../../runtime'
import {
  DEFAULT_AI_API_URL,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_SYSTEM_PROMPT,
  type XueqiuAiConfig,
} from '../types'

const AI_CONFIG_KEY = 'gm:xueqiu:ai:config'

export async function loadAiConfig(runtime: Runtime): Promise<XueqiuAiConfig | null> {
  try {
    const raw = await runtime.getValue<unknown>(AI_CONFIG_KEY, null)
    if (raw && typeof raw === 'object' && 'apiKey' in raw) {
      const cfg = raw as Partial<XueqiuAiConfig>
      return {
        apiKey: cfg.apiKey ?? '',
        model: cfg.model || DEFAULT_AI_MODEL,
        apiUrl: cfg.apiUrl || DEFAULT_AI_API_URL,
        systemPrompt: cfg.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT,
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveAiConfig(runtime: Runtime, config: XueqiuAiConfig): void {
  void runtime.setValue(AI_CONFIG_KEY, config)
}

/** Prompt for API key, save it, and return the updated config. */
export async function ensureApiKey(
  runtime: Runtime,
  existing: XueqiuAiConfig | null,
): Promise<XueqiuAiConfig | null> {
  const input = runtime.prompt(
    '输入 API Key（OpenRouter: https://openrouter.ai/keys）:',
    existing?.apiKey ?? '',
  )
  if (!input) return existing
  const config: XueqiuAiConfig = {
    apiKey: input.trim(),
    model: existing?.model ?? DEFAULT_AI_MODEL,
    apiUrl: existing?.apiUrl ?? DEFAULT_AI_API_URL,
    systemPrompt: existing?.systemPrompt ?? DEFAULT_AI_SYSTEM_PROMPT,
  }
  saveAiConfig(runtime, config)
  return config
}
