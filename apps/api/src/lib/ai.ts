import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { AiConfigService } from '../services/ai/ai-config-service';
import { logger } from './logger';

type AiProvider = 'openrouter' | 'openai' | 'gemini' | 'groq';
const aiLogger = logger.child({ module: 'ai-lib' });

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL;
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME;

// Default values (used if DB config is not available)
const DEFAULT_OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'openrouter/auto';
const DEFAULT_OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const DEFAULT_GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.1-8b-instant';

const DEFAULT_PROVIDER_ORDER: AiProvider[] = (process.env.AI_PROVIDER_ORDER || 'openrouter,groq,openai,gemini')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s): s is AiProvider => s === 'openrouter' || s === 'openai' || s === 'gemini' || s === 'groq');

function isEnabled(provider: AiProvider): boolean {
    if (provider === 'openrouter') return Boolean(OPENROUTER_API_KEY);
    if (provider === 'openai') return Boolean(OPENAI_API_KEY);
    if (provider === 'gemini') return Boolean(GEMINI_API_KEY);
    if (provider === 'groq') return Boolean(GROQ_API_KEY);
    return false;
}

function enabledProviders(order: AiProvider[] = DEFAULT_PROVIDER_ORDER, config?: {
    modelSettings?: {
        openrouter?: { enabled?: boolean };
        openai?: { enabled?: boolean };
        gemini?: { enabled?: boolean };
        groq?: { enabled?: boolean };
    };
}): AiProvider[] {
    const seen = new Set<AiProvider>();
    const providers: AiProvider[] = order.length ? order : ['openrouter', 'groq', 'openai', 'gemini'];
    return providers.filter((p: AiProvider) => {
        if (seen.has(p)) return false;
        seen.add(p);
        
        // Check if provider is disabled in config
        const isProviderDisabled = config?.modelSettings?.[p]?.enabled === false;
        if (isProviderDisabled) {
            return false;
        }
        
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

export const groq = new Groq({
    apiKey: GROQ_API_KEY || 'missing-groq-key',
});

export const gemini = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Backwards compatible defaults (previously used as OpenRouter model IDs)
export const MODEL_FLASH = DEFAULT_OPENROUTER_CHAT_MODEL;
export const MODEL_PRO = DEFAULT_OPENROUTER_CHAT_MODEL;

export async function createChatCompletionWithFallback(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    opts?: {
        providerOrder?: AiProvider[];
        models?: { openrouter?: string; openai?: string; groq?: string };
        purpose?: string;
        config?: any;
    }
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const startedAt = Date.now();
    // Load config if not provided
    const aiConfig = opts?.config || await AiConfigService.getConfig();
    
    const providers = enabledProviders(opts?.providerOrder || aiConfig.providerOrder, aiConfig).filter(
        (p): p is 'openrouter' | 'openai' | 'groq' => p === 'openrouter' || p === 'openai' || p === 'groq'
    );

    aiLogger.info({
        event: 'chat.completion.start',
        purpose: opts?.purpose || 'none',
        providers,
        messageCount: params.messages?.length ?? 0,
        toolCount: Array.isArray(params.tools) ? params.tools.length : 0,
    });

    const errors: Array<{ provider: string; error: unknown }> = [];

    for (const provider of providers) {
        const providerStartedAt = Date.now();
        try {
            const client = provider === 'openrouter' ? openrouter : (provider === 'openai' ? openai : (groq as any));
            const model =
                provider === 'openrouter'
                    ? (opts?.models?.openrouter || aiConfig.modelSettings?.openrouter?.model || DEFAULT_OPENROUTER_CHAT_MODEL)
                    : provider === 'openai'
                    ? (opts?.models?.openai || aiConfig.modelSettings?.openai?.model || DEFAULT_OPENAI_CHAT_MODEL)
                    : (opts?.models?.groq || aiConfig.modelSettings?.groq?.model || DEFAULT_GROQ_CHAT_MODEL);

            aiLogger.info({
                event: 'chat.completion.provider_attempt',
                provider,
                model,
                purpose: opts?.purpose || 'none',
            });

            const completion = await client.chat.completions.create({
                ...params,
                model,
            });
            aiLogger.info({
                event: 'chat.completion.provider_success',
                provider,
                model,
                purpose: opts?.purpose || 'none',
                durationMs: Date.now() - providerStartedAt,
                totalDurationMs: Date.now() - startedAt,
                finishReason: completion.choices?.[0]?.finish_reason ?? null,
                hasToolCalls: Boolean(completion.choices?.[0]?.message?.tool_calls?.length),
            });
            return completion;
        } catch (error) {
            aiLogger.error({
                event: 'chat.completion.provider_failed',
                provider,
                purpose: opts?.purpose || 'none',
                durationMs: Date.now() - providerStartedAt,
                error: summarizeError(error),
            });
            errors.push({ provider, error });
            if (!shouldFallback(error) || aiConfig.fallbackEnabled === false) break;
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
        models?: { openrouter?: string; openai?: string; gemini?: string; groq?: string };
        config?: {
            modelSettings?: {
                openrouter?: { model: string; enabled?: boolean };
                openai?: { model: string; enabled?: boolean };
                gemini?: { model: string; enabled?: boolean };
                groq?: { model: string; enabled?: boolean };
            };
            providerOrder?: AiProvider[];
            fallbackEnabled?: boolean;
        };
    }
): Promise<{ text: string; provider: AiProvider; model: string }>
{
    const startedAt = Date.now();
    // Load config if not provided
    const aiConfig = opts?.config || await AiConfigService.getConfig();
    
    const providers = enabledProviders(opts?.providerOrder || aiConfig.providerOrder, aiConfig);

    aiLogger.info({
        event: 'text.generation.start',
        purpose: input?.purpose || 'none',
        providers,
        promptLength: input.prompt.length,
        hasSystemPrompt: Boolean(input.system),
    });
    
    const errors: Array<{ provider: AiProvider; error: unknown }> = [];

    for (const provider of providers) {
        try {
            const providerStartedAt = Date.now();
            if (provider === 'gemini') {
                if (!gemini) throw new Error('Gemini client not configured');
                const model = opts?.models?.gemini || aiConfig.modelSettings?.gemini?.model || DEFAULT_GEMINI_MODEL;
                aiLogger.info({
                    event: 'text.generation.provider_attempt',
                    provider,
                    model,
                    purpose: input?.purpose || 'none',
                });
                
                const modelClient = gemini.getGenerativeModel({ model });
                const prompt = input.system
                    ? `System:\n${input.system}\n\nUser:\n${input.prompt}`
                    : input.prompt;

                const result = await modelClient.generateContent(prompt);
                const text = result.response.text();
                aiLogger.info({
                    event: 'text.generation.provider_success',
                    provider,
                    model,
                    purpose: input?.purpose || 'none',
                    durationMs: Date.now() - providerStartedAt,
                    totalDurationMs: Date.now() - startedAt,
                    outputLength: text.length,
                });
                return { text, provider, model };
            }

            // OpenAI-compatible providers (OpenAI, OpenRouter, Groq)
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
                    providerOrder: [provider as any],
                    models: {
                        openrouter: opts?.models?.openrouter,
                        openai: opts?.models?.openai,
                        groq: opts?.models?.groq,
                    },
                    purpose: input.purpose,
                    config: aiConfig,
                }
            );
            const text = completion.choices[0]?.message?.content || '';
            const modelUsed = (completion as any)?.model || 
                (provider === 'openrouter' ? aiConfig.modelSettings?.openrouter?.model || DEFAULT_OPENROUTER_CHAT_MODEL : 
                 provider === 'openai' ? aiConfig.modelSettings?.openai?.model || DEFAULT_OPENAI_CHAT_MODEL : 
                 aiConfig.modelSettings?.groq?.model || DEFAULT_GROQ_CHAT_MODEL);
            aiLogger.info({
                event: 'text.generation.provider_success',
                provider,
                model: modelUsed,
                purpose: input?.purpose || 'none',
                durationMs: Date.now() - providerStartedAt,
                totalDurationMs: Date.now() - startedAt,
                outputLength: text.length,
            });
            return { text, provider, model: modelUsed };
        } catch (error) {
            aiLogger.error({
                event: 'text.generation.provider_failed',
                provider,
                purpose: input?.purpose || 'none',
                error: summarizeError(error),
            });
            errors.push({ provider, error });
            if (!shouldFallback(error) || aiConfig.fallbackEnabled === false) break;
        }
    }

    const message =
        `All text providers failed` +
        (input.purpose ? ` (${input.purpose})` : '') +
        `: ` +
        errors.map((e) => `${e.provider} => ${summarizeError(e.error)}`).join(' | ');
    throw new Error(message);
}

export async function getAiStatus() {
    try {
        const config = await AiConfigService.getConfig();
        return {
            enabled: {
                openrouter: Boolean(OPENROUTER_API_KEY) && config.modelSettings?.openrouter?.enabled !== false,
                openai: Boolean(OPENAI_API_KEY) && config.modelSettings?.openai?.enabled !== false,
                gemini: Boolean(GEMINI_API_KEY) && config.modelSettings?.gemini?.enabled !== false,
                groq: Boolean(GROQ_API_KEY) && config.modelSettings?.groq?.enabled !== false,
            },
            models: {
                openrouter: config.modelSettings?.openrouter?.model || DEFAULT_OPENROUTER_CHAT_MODEL,
                openai: config.modelSettings?.openai?.model || DEFAULT_OPENAI_CHAT_MODEL,
                gemini: config.modelSettings?.gemini?.model || DEFAULT_GEMINI_MODEL,
                groq: config.modelSettings?.groq?.model || DEFAULT_GROQ_CHAT_MODEL,
            },
            providerOrder: config.providerOrder || DEFAULT_PROVIDER_ORDER,
            defaultProvider: config.defaultProvider,
            fallbackEnabled: config.fallbackEnabled,
        };
    } catch (error) {
        aiLogger.error({
            event: 'ai.status.failed_to_fetch_config',
            error: summarizeError(error),
        });
        return {
            enabled: {
                openrouter: Boolean(OPENROUTER_API_KEY),
                openai: Boolean(OPENAI_API_KEY),
                gemini: Boolean(GEMINI_API_KEY),
                groq: Boolean(GROQ_API_KEY),
            },
            models: {
                openrouter: DEFAULT_OPENROUTER_CHAT_MODEL,
                openai: DEFAULT_OPENAI_CHAT_MODEL,
                gemini: DEFAULT_GEMINI_MODEL,
                groq: DEFAULT_GROQ_CHAT_MODEL,
            },
            providerOrder: DEFAULT_PROVIDER_ORDER,
            defaultProvider: 'openrouter',
            fallbackEnabled: true,
        };
    }
}

export async function checkPromptGuard(content: string): Promise<{ isSafe: boolean; score: number }> {
    if (!GROQ_API_KEY) {
        return { isSafe: true, score: 0 };
    }

    try {
        aiLogger.info({
            event: 'prompt_guard.start',
            provider: 'groq',
            model: 'meta-llama/llama-prompt-guard-2-86m',
            contentLength: content.length,
        });
        const completion = await groq.chat.completions.create({
            model: "meta-llama/llama-prompt-guard-2-86m",
            messages: [
                {
                    role: "user",
                    content: content
                }
            ],
            temperature: 1,
            max_completion_tokens: 1,
            top_p: 1,
            stream: false,
            stop: null
        } as any);

        const textResult = completion.choices[0].message.content || "0";
        const score = parseFloat(textResult);

        const result = {
            isSafe: score <= 0.93,
            score
        };
        aiLogger.info({
            event: 'prompt_guard.result',
            score,
            isSafe: result.isSafe,
        });
        return result;
    } catch (error) {
        aiLogger.error({
            event: 'prompt_guard.failed',
            error: summarizeError(error),
        });
        return { isSafe: true, score: 0 };
    }
}
