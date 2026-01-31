import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

type AiProvider = 'openrouter' | 'openai' | 'gemini';

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL;
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME;

const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'upstage/solar-pro-3:free';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const DEFAULT_PROVIDER_ORDER: AiProvider[] = (process.env.AI_PROVIDER_ORDER || 'openrouter,openai,gemini')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s): s is AiProvider => s === 'openrouter' || s === 'openai' || s === 'gemini');

function isEnabled(provider: AiProvider): boolean {
    if (provider === 'openrouter') return Boolean(OPENROUTER_API_KEY);
    if (provider === 'openai') return Boolean(OPENAI_API_KEY);
    if (provider === 'gemini') return Boolean(GEMINI_API_KEY);
    return false;
}

function enabledProviders(order: AiProvider[] = DEFAULT_PROVIDER_ORDER): AiProvider[] {
    const seen = new Set<AiProvider>();
    const providers: AiProvider[] = order.length ? order : ['openrouter', 'openai', 'gemini'];
    return providers.filter((p: AiProvider) => {
        if (seen.has(p)) return false;
        seen.add(p);
        return isEnabled(p);
    });
}

function shouldFallback(error: unknown): boolean {
    const anyErr = error as any;
    const status = anyErr?.status ?? anyErr?.response?.status;

    // Network/transport
    if (anyErr?.name === 'AbortError') return true;
    if (anyErr instanceof TypeError) return true;

    // OpenAI SDK errors often expose `status`
    if (typeof status === 'number') {
        if (status === 408) return true;
        if (status === 429) return true;
        if (status >= 500) return true;
        // 401/403 can be fixed by switching providers (different keys)
        if (status === 401 || status === 403) return true;
    }

    return true;
}

function summarizeError(error: unknown): string {
    const anyErr = error as any;
    const status = anyErr?.status ?? anyErr?.response?.status;
    const message = anyErr?.message || String(error);
    return typeof status === 'number' ? `${status}: ${message}` : message;
}

export const openrouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY || 'missing-openrouter-key',
    defaultHeaders: {
        ...(OPENROUTER_SITE_URL ? { 'HTTP-Referer': OPENROUTER_SITE_URL } : {}),
        ...(OPENROUTER_APP_NAME ? { 'X-Title': OPENROUTER_APP_NAME } : {}),
    },
});

export const openai = new OpenAI({
    apiKey: OPENAI_API_KEY || 'missing-openai-key',
});

export const gemini = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Backwards compatible defaults (previously used as OpenRouter model IDs)
export const MODEL_FLASH = OPENROUTER_CHAT_MODEL;
export const MODEL_PRO = OPENROUTER_CHAT_MODEL;

export async function createChatCompletionWithFallback(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    opts?: {
        providerOrder?: AiProvider[];
        models?: { openrouter?: string; openai?: string };
        purpose?: string;
    }
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const providers = enabledProviders(opts?.providerOrder).filter(
        (p): p is 'openrouter' | 'openai' => p === 'openrouter' || p === 'openai'
    );

    const errors: Array<{ provider: string; error: unknown }> = [];

    for (const provider of providers) {
        try {
            const client = provider === 'openrouter' ? openrouter : openai;
            const model =
                provider === 'openrouter'
                    ? (opts?.models?.openrouter || OPENROUTER_CHAT_MODEL)
                    : (opts?.models?.openai || OPENAI_CHAT_MODEL);

            return await client.chat.completions.create({
                ...params,
                model,
            });
        } catch (error) {
            errors.push({ provider, error });
            if (!shouldFallback(error)) break;
        }
    }

    const message =
        `All chat providers failed` +
        (opts?.purpose ? ` (${opts.purpose})` : '') +
        `: ` +
        errors.map((e) => `${e.provider} => ${summarizeError(e.error)}`).join(' | ');
    throw new Error(message);
}

export async function generateTextWithFallback(
    input: {
        prompt: string;
        system?: string;
        purpose?: string;
        temperature?: number;
    },
    opts?: {
        providerOrder?: AiProvider[];
        models?: { openrouter?: string; openai?: string; gemini?: string };
    }
): Promise<{ text: string; provider: AiProvider; model: string }>
{
    const providers = enabledProviders(opts?.providerOrder);
    const errors: Array<{ provider: AiProvider; error: unknown }> = [];

    for (const provider of providers) {
        try {
            if (provider === 'gemini') {
                if (!gemini) throw new Error('Gemini client not configured');
                const model = opts?.models?.gemini || GEMINI_MODEL;
                const modelClient = gemini.getGenerativeModel({ model });
                const prompt = input.system
                    ? `System:\n${input.system}\n\nUser:\n${input.prompt}`
                    : input.prompt;

                const result = await modelClient.generateContent(prompt);
                const text = result.response.text();
                return { text, provider, model };
            }

            // OpenAI-compatible providers
            const completion = await createChatCompletionWithFallback(
                {
                    model: 'will-be-overridden',
                    messages: [
                        ...(input.system ? [{ role: 'system', content: input.system } as const] : []),
                        { role: 'user', content: input.prompt } as const,
                    ],
                    temperature: input.temperature,
                },
                {
                    providerOrder: [provider],
                    models: {
                        openrouter: opts?.models?.openrouter,
                        openai: opts?.models?.openai,
                    },
                    purpose: input.purpose,
                }
            );
            const text = completion.choices[0]?.message?.content || '';
            const modelUsed = (completion as any)?.model || (provider === 'openrouter' ? OPENROUTER_CHAT_MODEL : OPENAI_CHAT_MODEL);
            return { text, provider, model: modelUsed };
        } catch (error) {
            errors.push({ provider, error });
            if (!shouldFallback(error)) break;
        }
    }

    const message =
        `All text providers failed` +
        (input.purpose ? ` (${input.purpose})` : '') +
        `: ` +
        errors.map((e) => `${e.provider} => ${summarizeError(e.error)}`).join(' | ');
    throw new Error(message);
}

export function getAiStatus() {
    return {
        enabled: {
            openrouter: Boolean(OPENROUTER_API_KEY),
            openai: Boolean(OPENAI_API_KEY),
            gemini: Boolean(GEMINI_API_KEY),
        },
        models: {
            openrouter: OPENROUTER_CHAT_MODEL,
            openai: OPENAI_CHAT_MODEL,
            gemini: GEMINI_MODEL,
        },
        providerOrder: DEFAULT_PROVIDER_ORDER,
    };
}
