// Multi-provider BYOK LLM client for the AI coach.
//
// The user brings their own API key (or none, for local providers). The key
// is stored only in this device's plugin data and is sent ONLY to the
// selected provider — never to Habitude servers.
//
// Non-streaming chat completions: simpler and robust inside Obsidian.
// requestUrl is injectable so unit tests never touch the network.

import { requestUrl } from 'obsidian';
import { t } from '../i18n';

export type LlmProviderId =
	| 'gemini'
	| 'openai'
	| 'anthropic'
	| 'openrouter'
	| 'ollama'
	| 'lmstudio'
	| 'deepseek'
	| 'qwen'
	| 'kimi'
	| 'zhipu'
	| 'siliconflow'
	| 'doubao'
	| 'custom';

/** Default Gemini model id; also the fallback when migrating legacy settings. */
export const DEFAULT_COACH_MODEL = 'gemini-2.5-flash';

/** Cap on conversation history sent per request — the view keeps the full local transcript. */
export const MAX_HISTORY_BLOCKS = 20;

export interface ChatMessage {
	role: 'user' | 'model';
	text: string;
}

type RequestFn = typeof requestUrl;
/** Injectable transport — same shape as Obsidian's requestUrl. */
export type RequestFnLike = RequestFn;

export class CoachError extends Error {
	readonly kind: 'auth' | 'quota' | 'network' | 'api';
	constructor(kind: CoachError['kind'], message: string) {
		super(message);
		this.kind = kind;
	}
}

export interface BuildRequestArgs {
	baseUrl: string;
	apiKey: string;
	model: string;
	systemPrompt: string;
	history: ChatMessage[];
	message: string;
}

export interface BuiltRequest {
	url: string;
	headers: Record<string, string>;
	body: string;
}

export interface ProviderDef {
	id: LlmProviderId;
	/** Short English label, used in error messages. */
	label: string;
	/** Whether the provider requires an API key. */
	needsKey: boolean;
	defaultBaseUrl: string;
	defaultModel: string;
	/**
	 * Preset models rendered as a dropdown in settings so the user never has
	 * to type a model id. Empty list -> the settings page falls back to a
	 * free-text input (local/custom providers).
	 */
	models: string[];
	modelPlaceholder: string;
	/** Key issuance URL; '' for local providers and custom endpoints. */
	keyUrl: string;
	buildRequest: (args: BuildRequestArgs) => BuiltRequest;
	/** Extract the assistant text from a raw response body (JSON text). */
	parseResponse: (raw: string) => string;
	/**
	 * Model-list request (the settings "fetch models" button), bz-style:
	 * OpenAI-compatible GET {base}/models, provider-specific overrides for
	 * Gemini/Anthropic/Ollama. Absent = the provider has no known listing
	 * endpoint (none today — all 13 define one).
	 */
	listModels?: (args: ModelListArgs) => ModelsRequestSpec;
}

export interface ModelListArgs {
	baseUrl: string;
	apiKey: string;
}

export interface ModelsRequestSpec {
	url: string;
	headers: Record<string, string>;
	/** Extract model ids from a raw response body (JSON text). */
	parse: (raw: string) => string[];
}

/**
 * Join a base URL with an API path. Strips trailing slashes and a trailing
 * '/v1' the user may have included, so user overrides never produce '/v1/v1'.
 */
function joinApiPath(base: string, path: string): string {
	const b = (base || '').replace(/\/+$/, '').replace(/\/v1$/, '');
	return `${b}${path}`;
}

type OpenAiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Shared body builder for OpenAI-compatible chat completion endpoints.
 * `apiPath` defaults to '/v1/chat/completions' (joined by joinApiPath, which
 * strips a trailing '/v1' from the base); providers whose paths don't follow
 * the /v1 convention (Zhipu: /api/paas/v4, Doubao: /api/v3) pass their own.
 */
function buildOpenAiStyleRequest(
	args: BuildRequestArgs,
	extraHeaders: Record<string, string> = {},
	apiPath = '/v1/chat/completions',
): BuiltRequest {
	const messages: OpenAiMessage[] = [
		{ role: 'system', content: args.systemPrompt },
		...args.history.map(
			(m): OpenAiMessage => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }),
		),
		{ role: 'user', content: args.message },
	];
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...extraHeaders,
	};
	if (args.apiKey) {
		headers['Authorization'] = `Bearer ${args.apiKey}`;
	}
	return {
		url: joinApiPath(args.baseUrl, apiPath),
		headers,
		body: JSON.stringify({ model: args.model, messages, temperature: 0.7, max_tokens: 1024 }),
	};
}

/** Extract assistant text from an OpenAI-style chat completion body. */
function parseOpenAiStyleResponse(raw: string): string {
	const data = JSON.parse(raw) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	return data.choices?.[0]?.message?.content ?? '';
}

// --- Model-list endpoints (settings "fetch models" button) ---

/** Tolerant OpenAI-compatible /models parser: data[].id, fallback data.models[].name. */
function parseOpenAiModelList(raw: string): string[] {
	const data = JSON.parse(raw) as {
		data?: Array<{ id?: unknown }>;
		models?: Array<{ name?: unknown }>;
	};
	const fromData = (data.data ?? [])
		.map((m) => (typeof m?.id === 'string' ? m.id : ''))
		.filter(Boolean);
	if (fromData.length > 0) return fromData;
	return (data.models ?? [])
		.map((m) => (typeof m?.name === 'string' ? m.name : ''))
		.filter(Boolean);
}

/** OpenAI-compatible GET {base}{apiPath} with optional Bearer auth. */
function openAiModelList(apiPath = '/v1/models') {
	return (args: ModelListArgs): ModelsRequestSpec => ({
		url: joinApiPath(args.baseUrl, apiPath),
		headers: args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {},
		parse: parseOpenAiModelList,
	});
}

/** Gemini: GET {base}/v1beta/models, keep models that support generateContent. */
function geminiModelList(args: ModelListArgs): ModelsRequestSpec {
	const host = (args.baseUrl || '').replace(/\/+$/, '');
	return {
		url: `${host}/v1beta/models?pageSize=200`,
		headers: args.apiKey ? { 'x-goog-api-key': args.apiKey } : {},
		parse: (raw) => {
			const data = JSON.parse(raw) as {
				models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
			};
			return (data.models ?? [])
				.filter(
					(m) =>
						!m.supportedGenerationMethods ||
						m.supportedGenerationMethods.includes('generateContent'),
				)
				.map((m) => (m.name ?? '').replace(/^models\//, ''))
				.filter(Boolean);
		},
	};
}

/** Anthropic: GET /v1/models with the version header; data[].id. */
function anthropicModelList(args: ModelListArgs): ModelsRequestSpec {
	return {
		url: `${joinApiPath(args.baseUrl, '/v1/models')}?limit=100`,
		headers: { 'x-api-key': args.apiKey, 'anthropic-version': '2023-06-01' },
		parse: (raw) => {
			const data = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
			return (data.data ?? [])
				.map((m) => (typeof m?.id === 'string' ? m.id : ''))
				.filter(Boolean);
		},
	};
}

/** Ollama: the listing lives on the root /api/tags (base URL ends in /v1). */
function ollamaModelList(args: ModelListArgs): ModelsRequestSpec {
	const root = args.baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
	return {
		url: `${root}/api/tags`,
		headers: {},
		parse: (raw) => {
			const data = JSON.parse(raw) as { models?: Array<{ name?: unknown }> };
			return (data.models ?? [])
				.map((m) => (typeof m?.name === 'string' ? m.name : ''))
				.filter(Boolean);
		},
	};
}

interface GenerateContentResponse {
	candidates?: Array<{
		content?: { parts?: Array<{ text?: string }> };
		finishReason?: string;
	}>;
	error?: { code?: number; message?: string; status?: string };
}

const geminiProvider: ProviderDef = {
	id: 'gemini',
	label: 'Google Gemini',
	needsKey: true,
	defaultBaseUrl: 'https://generativelanguage.googleapis.com',
	defaultModel: 'gemini-2.5-flash',
	models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
	modelPlaceholder: 'gemini-2.5-flash',
	keyUrl: 'https://aistudio.google.com/apikey',
	buildRequest: (args) => {
		const host = (args.baseUrl || '').replace(/\/+$/, '');
		const contents = [
			...args.history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
			{ role: 'user', parts: [{ text: args.message }] },
		];
		return {
			url: `${host}/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
			headers: { 'Content-Type': 'application/json', 'x-goog-api-key': args.apiKey },
			body: JSON.stringify({
				system_instruction: { parts: [{ text: args.systemPrompt }] },
				contents,
				generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
			}),
		};
	},
	parseResponse: (raw) => {
		const data = JSON.parse(raw) as GenerateContentResponse;
		return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
	},
};

const openaiProvider: ProviderDef = {
	id: 'openai',
	label: 'OpenAI',
	needsKey: true,
	defaultBaseUrl: 'https://api.openai.com',
	defaultModel: 'gpt-4o-mini',
	models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
	modelPlaceholder: 'gpt-4o-mini',
	keyUrl: 'https://platform.openai.com/api-keys',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

/**
 * Anthropic message rules: roles are user/assistant only, messages must
 * start with a user turn, and consecutive same-role turns are not allowed.
 * Normalize from our user/model history: map model→assistant, merge
 * consecutive same-role turns (joined with a blank line), drop leading
 * assistant turns.
 */
function normalizeAnthropicMessages(
	history: ChatMessage[],
	message: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
	const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
	const mapRole = (m: ChatMessage): { role: 'user' | 'assistant'; content: string } => ({
		role: m.role === 'model' ? 'assistant' : 'user',
		content: m.text,
	});
	const all: Array<{ role: 'user' | 'assistant'; content: string }> = [
		...history.map(mapRole),
		{ role: 'user', content: message },
	];
	for (const m of all) {
		const last = msgs[msgs.length - 1];
		if (last && last.role === m.role) {
			last.content += `\n\n${m.content}`;
		} else {
			msgs.push({ ...m });
		}
	}
	while (msgs.length > 0 && msgs[0]?.role === 'assistant') {
		msgs.shift();
	}
	return msgs;
}

const anthropicProvider: ProviderDef = {
	id: 'anthropic',
	label: 'Anthropic',
	needsKey: true,
	defaultBaseUrl: 'https://api.anthropic.com',
	defaultModel: 'claude-3-5-sonnet-latest',
	models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
	modelPlaceholder: 'claude-3-5-sonnet-latest',
	keyUrl: 'https://console.anthropic.com/settings/keys',
	buildRequest: (args) => ({
		url: joinApiPath(args.baseUrl, '/v1/messages'),
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': args.apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: args.model,
			max_tokens: 1024,
			system: args.systemPrompt,
			messages: normalizeAnthropicMessages(args.history, args.message),
		}),
	}),
	parseResponse: (raw) => {
		const data = JSON.parse(raw) as {
			content?: Array<{ type?: string; text?: string }>;
		};
		return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
	},
};

const openrouterProvider: ProviderDef = {
	id: 'openrouter',
	label: 'OpenRouter',
	needsKey: true,
	defaultBaseUrl: 'https://openrouter.ai/api',
	defaultModel: 'openai/gpt-4o-mini',
	models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'deepseek/deepseek-chat'],
	modelPlaceholder: 'openai/gpt-4o-mini',
	keyUrl: 'https://openrouter.ai/keys',
	buildRequest: (args) =>
		buildOpenAiStyleRequest(args, {
			'HTTP-Referer': 'https://habitude.ai',
			'X-Title': 'Habitude Checklist',
		}),
	parseResponse: parseOpenAiStyleResponse,
};

const ollamaProvider: ProviderDef = {
	id: 'ollama',
	label: 'Ollama',
	needsKey: false,
	defaultBaseUrl: 'http://localhost:11434/v1',
	defaultModel: 'llama3.1',
	models: ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral'],
	modelPlaceholder: 'llama3.1',
	keyUrl: '',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const lmstudioProvider: ProviderDef = {
	id: 'lmstudio',
	label: 'LM Studio',
	needsKey: false,
	defaultBaseUrl: 'http://localhost:1234/v1',
	defaultModel: 'local-model',
	models: [],
	modelPlaceholder: 'local-model',
	keyUrl: '',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

// Domestic (China) providers — all OpenAI-compatible chat completions.
// Base URLs follow each vendor's documented OpenAI-compatible endpoint.

const deepseekProvider: ProviderDef = {
	id: 'deepseek',
	label: 'DeepSeek',
	needsKey: true,
	defaultBaseUrl: 'https://api.deepseek.com',
	defaultModel: 'deepseek-chat',
	models: ['deepseek-chat', 'deepseek-reasoner'],
	modelPlaceholder: 'deepseek-chat',
	keyUrl: 'https://platform.deepseek.com/api_keys',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const qwenProvider: ProviderDef = {
	id: 'qwen',
	label: 'Qwen (Alibaba Cloud)',
	needsKey: true,
	defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
	defaultModel: 'qwen-plus',
	models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
	modelPlaceholder: 'qwen-plus',
	keyUrl: 'https://bailian.console.aliyun.com/',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const kimiProvider: ProviderDef = {
	id: 'kimi',
	label: 'Kimi (Moonshot)',
	needsKey: true,
	defaultBaseUrl: 'https://api.moonshot.cn/v1',
	defaultModel: 'moonshot-v1-8k',
	models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
	modelPlaceholder: 'moonshot-v1-8k',
	keyUrl: 'https://platform.moonshot.cn/console/api-keys',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const zhipuProvider: ProviderDef = {
	id: 'zhipu',
	label: 'Zhipu GLM',
	needsKey: true,
	defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
	defaultModel: 'glm-4.7-flash',
	models: ['glm-4.7-flash', 'glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'],
	modelPlaceholder: 'glm-4.7-flash',
	keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
	// Zhipu's path has no '/v1' segment: /api/paas/v4/chat/completions.
	buildRequest: (args) => buildOpenAiStyleRequest(args, {}, '/chat/completions'),
	parseResponse: parseOpenAiStyleResponse,
};

const siliconflowProvider: ProviderDef = {
	id: 'siliconflow',
	label: 'SiliconFlow',
	needsKey: true,
	defaultBaseUrl: 'https://api.siliconflow.cn/v1',
	defaultModel: 'deepseek-ai/DeepSeek-V3',
	models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
	modelPlaceholder: 'deepseek-ai/DeepSeek-V3',
	keyUrl: 'https://cloud.siliconflow.cn/account/ak',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const doubaoProvider: ProviderDef = {
	id: 'doubao',
	label: 'Doubao (Volcengine)',
	needsKey: true,
	defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
	defaultModel: 'doubao-seed-1-6-flash',
	models: ['doubao-seed-1-6-flash', 'doubao-seed-1-6', 'doubao-1-5-pro-32k'],
	modelPlaceholder: 'doubao-seed-1-6-flash',
	keyUrl: 'https://console.volcengine.com/ark',
	// Ark's path has no '/v1' segment: /api/v3/chat/completions.
	buildRequest: (args) => buildOpenAiStyleRequest(args, {}, '/chat/completions'),
	parseResponse: parseOpenAiStyleResponse,
};

const customProvider: ProviderDef = {
	id: 'custom',
	label: 'Custom',
	needsKey: false,
	defaultBaseUrl: '',
	defaultModel: '',
	models: [],
	modelPlaceholder: 'model-id',
	keyUrl: '',
	buildRequest: (args) => buildOpenAiStyleRequest(args),
	parseResponse: parseOpenAiStyleResponse,
};

const PROVIDERS: Record<LlmProviderId, ProviderDef> = {
	gemini: geminiProvider,
	openai: openaiProvider,
	anthropic: anthropicProvider,
	openrouter: openrouterProvider,
	ollama: ollamaProvider,
	lmstudio: lmstudioProvider,
	deepseek: deepseekProvider,
	qwen: qwenProvider,
	kimi: kimiProvider,
	zhipu: zhipuProvider,
	siliconflow: siliconflowProvider,
	doubao: doubaoProvider,
	custom: customProvider,
};

// Model-list endpoints for the settings "fetch models" button. Every preset
// is OpenAI-compatible here; Gemini/Anthropic/Ollama get their own shape and
// Zhipu/Doubao mount /models on their non-/v1 base paths.
PROVIDERS.gemini.listModels = geminiModelList;
PROVIDERS.anthropic.listModels = anthropicModelList;
PROVIDERS.ollama.listModels = ollamaModelList;
PROVIDERS.zhipu.listModels = openAiModelList('/models');
PROVIDERS.doubao.listModels = openAiModelList('/models');
for (const id of ['openai', 'openrouter', 'lmstudio', 'deepseek', 'qwen', 'kimi', 'siliconflow', 'custom'] as LlmProviderId[]) {
	PROVIDERS[id].listModels = openAiModelList();
}

export const LLM_PROVIDER_IDS: LlmProviderId[] = [
	'gemini',
	'openai',
	'anthropic',
	'openrouter',
	'ollama',
	'lmstudio',
	'deepseek',
	'qwen',
	'kimi',
	'zhipu',
	'siliconflow',
	'doubao',
	'custom',
];

/** Unknown ids fall back to Gemini (the historical default). */
export function getProvider(id: string): ProviderDef {
	return (PROVIDERS as Record<string, ProviderDef>)[id] ?? PROVIDERS.gemini;
}

function classifyTransportError(e: unknown, providerLabel: string): CoachError {
	// Obsidian's requestUrl REJECTS on HTTP 4xx/5xx with the status on the
	// error — classify those instead of blaming the connection.
	const status =
		typeof (e as { status?: unknown } | null | undefined)?.status === 'number'
			? (e as { status: number }).status
			: 0;
	if (status === 400 || status === 401 || status === 403) {
		return new CoachError('auth', t('coach.error.authRejected'));
	}
	if (status === 429) {
		return new CoachError('quota', t('coach.error.rateLimit'));
	}
	if (status >= 400) {
		return new CoachError('api', t('coach.error.httpError', { provider: providerLabel, status }));
	}
	return new CoachError('network', t('coach.error.network', { detail: String(e) }));
}

interface ErrorBody {
	error?: { code?: unknown; message?: unknown; type?: unknown };
}

function classifyBodyError(data: ErrorBody, providerLabel: string): CoachError {
	const err = data.error ?? {};
	const code = err.code;
	const msg = typeof err.message === 'string' ? err.message : 'Unknown error';
	const typeTag = typeof err.type === 'string' ? err.type : '';
	const codeStr = (typeof code === 'string' || typeof code === 'number' ? String(code) : typeTag).toLowerCase();
	if (
		(code === 400 && /api key/i.test(msg)) ||
		code === 401 ||
		code === 403 ||
		codeStr === 'authentication_error' ||
		codeStr === 'invalid_api_key' ||
		codeStr === 'invalid x-api-key'
	) {
		throw new CoachError('auth', code === 401 || code === 403 ? t('coach.error.authInvalid') : t('coach.error.authRejected'));
	}
	if (code === 429 || codeStr === 'rate_limit_error') {
		// 429 is overloaded OR exhausted quota — providers like Zhipu say so
		// in the message ("余额不足...请充值"), which is far more actionable
		// than a generic rate-limit notice. Pass the original through.
		if (msg && msg !== 'Unknown error' && !/rate limit/i.test(msg)) {
			throw new CoachError('quota', t('coach.error.rateLimitDetail', { detail: msg }));
		}
		throw new CoachError('quota', t('coach.error.rateLimit'));
	}
	// Keep the provider label out of the generic model error: the detail
	// usually names the provider already.
	void providerLabel;
	throw new CoachError('api', t('coach.error.modelError', { detail: msg }));
}

export async function chatCompletion(
	args: {
		provider: LlmProviderId;
		apiKey: string;
		baseUrl: string;
		model: string;
		systemPrompt: string;
		history: ChatMessage[];
		message: string;
	},
	requestFn: RequestFn = requestUrl,
): Promise<string> {
	const def = getProvider(args.provider);
	const resolvedBase = (args.baseUrl || '').trim() || def.defaultBaseUrl;
	if (!resolvedBase) {
		throw new CoachError('api', t('coach.error.baseUrlRequired'));
	}
	const model = (args.model || '').trim() || def.defaultModel;
	if (!model) {
		throw new CoachError('api', t('coach.error.modelRequired'));
	}
	// Sliding window: bound the request size on long conversations.
	const recent = args.history.slice(-MAX_HISTORY_BLOCKS);
	const { url, headers, body } = def.buildRequest({
		baseUrl: resolvedBase,
		apiKey: args.apiKey,
		model,
		systemPrompt: args.systemPrompt,
		history: recent,
		message: args.message,
	});

	let raw: string;
	try {
		const res = await requestFn({ url, method: 'POST', headers, body });
		raw = res.text;
	} catch (e) {
		throw classifyTransportError(e, def.label);
	}

	let data: unknown;
	try {
		data = JSON.parse(raw) as unknown;
	} catch {
		throw new CoachError('api', t('coach.error.unreadable'));
	}

	if (data && typeof data === 'object' && 'error' in data && (data as ErrorBody).error) {
		throw classifyBodyError(data as ErrorBody, def.label);
	}

	const text = def.parseResponse(raw);
	if (!text.trim()) {
		throw new CoachError('api', t('coach.error.emptyReply'));
	}
	return text.trim();
}
