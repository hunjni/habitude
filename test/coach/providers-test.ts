// Unit tests for the multi-provider LLM client (src/coach/providers.ts):
// request snapshots, response parsing, Anthropic message normalization,
// error classification, base-URL overrides, and the gemini fallback.
//
// Build & run:
//   esbuild test/coach/providers-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/coach/dist/providers-test.cjs --format=cjs --log-level=warning \
//   && node test/coach/dist/providers-test.cjs

import {
	chatCompletion,
	CoachError,
	getProvider,
	LLM_PROVIDER_IDS,
	type LlmProviderId,
} from '../../src/coach/providers';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

interface Captured {
	url: string;
	headers: Record<string, string>;
	body: string;
}

function captureTransport(responseText: string): { transport: (opts: unknown) => Promise<{ text: string }>; get: () => Captured } {
	let captured: Captured = { url: '', headers: {}, body: '' };
	const transport = async (opts: unknown) => {
		const o = opts as { url: string; headers?: Record<string, string>; body?: string };
		captured = { url: o.url, headers: o.headers ?? {}, body: o.body ?? '' };
		return { text: responseText };
	};
	return { transport, get: () => captured };
}

const GEMINI_OK = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini reply' }] } }] });
const OPENAI_OK = JSON.stringify({ choices: [{ message: { content: 'openai reply' } }] });
const ANTHROPIC_OK = JSON.stringify({
	content: [
		{ type: 'text', text: 'claude ' },
		{ type: 'image', source: {} },
		{ type: 'text', text: 'reply' },
	],
});

async function testRequestSnapshots(): Promise<void> {
	console.log('\n[P1] request snapshots (7 legacy providers)');
	const base = {
		apiKey: 'FAKE-KEY-abc123',
		baseUrl: '',
		model: '',
		systemPrompt: 'SYS',
		history: [{ role: 'user' as const, text: 'hi' }],
		message: 'how am I doing?',
	};

	const run = async (provider: LlmProviderId, responseText: string, extra: Partial<typeof base> = {}) => {
		const { transport, get } = captureTransport(responseText);
		const reply = await chatCompletion({ ...base, provider, ...extra }, transport as never);
		return { reply, req: get() };
	};

	// gemini
	{
		const { reply, req } = await run('gemini', GEMINI_OK);
		check('gemini reply parsed', reply === 'gemini reply');
		check('gemini host + path', req.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', ` (${req.url})`);
		check('gemini key via header only', req.headers['x-goog-api-key'] === 'FAKE-KEY-abc123' && !req.url.includes('FAKE-KEY'));
		check('gemini system_instruction in body', req.body.includes('"system_instruction"'));
	}

	// openai
	{
		const { reply, req } = await run('openai', OPENAI_OK);
		check('openai reply parsed', reply === 'openai reply');
		check('openai url', req.url === 'https://api.openai.com/v1/chat/completions', ` (${req.url})`);
		check('openai bearer auth', req.headers['Authorization'] === 'Bearer FAKE-KEY-abc123');
		const body = JSON.parse(req.body) as { model: string; messages: Array<{ role: string }> };
		check('openai default model', body.model === 'gpt-4o-mini');
		check('openai system first', body.messages[0]?.role === 'system');
		check('openai history mapped user/model->assistant', body.messages.some((m) => m.role === 'user'));
	}

	// anthropic
	{
		const { reply, req } = await run('anthropic', ANTHROPIC_OK);
		check('anthropic reply joins text blocks', reply === 'claude reply', ` (${reply})`);
		check('anthropic url', req.url === 'https://api.anthropic.com/v1/messages', ` (${req.url})`);
		check('anthropic x-api-key header', req.headers['x-api-key'] === 'FAKE-KEY-abc123');
		check('anthropic-version header', req.headers['anthropic-version'] === '2023-06-01');
		const body = JSON.parse(req.body) as { system: string; max_tokens: number; messages: Array<{ role: string }> };
		check('anthropic system top-level', body.system === 'SYS');
		check('anthropic max_tokens', body.max_tokens === 1024);
	}

	// openrouter
	{
		const { req } = await run('openrouter', OPENAI_OK);
		check('openrouter url', req.url === 'https://openrouter.ai/api/v1/chat/completions', ` (${req.url})`);
		check('openrouter referer header', req.headers['HTTP-Referer'] === 'https://habitude.ai');
		check('openrouter title header', req.headers['X-Title'] === 'Habitude Checklist');
		check('openrouter bearer auth', req.headers['Authorization'] === 'Bearer FAKE-KEY-abc123');
		const body = JSON.parse(req.body) as { model: string };
		check('openrouter default model', body.model === 'openai/gpt-4o-mini');
	}

	// ollama (local, no key)
	{
		const { reply, req } = await run('ollama', OPENAI_OK, { apiKey: '' });
		check('ollama reply parsed', reply === 'openai reply');
		check('ollama url', req.url === 'http://localhost:11434/v1/chat/completions', ` (${req.url})`);
		check('ollama sends no Authorization header', !('Authorization' in req.headers));
	}

	// lmstudio (local, no key)
	{
		const { reply, req } = await run('lmstudio', OPENAI_OK, { apiKey: '' });
		check('lmstudio reply parsed', reply === 'openai reply');
		check('lmstudio url', req.url === 'http://localhost:1234/v1/chat/completions', ` (${req.url})`);
		check('lmstudio sends no Authorization header', !('Authorization' in req.headers));
	}

	// custom with proxy base URL
	{
		const { req } = await run('custom', OPENAI_OK, { baseUrl: 'https://proxy.example.com', model: 'my-model', apiKey: 'sekret' });
		check('custom base url honored', req.url === 'https://proxy.example.com/v1/chat/completions', ` (${req.url})`);
		check('custom key sent as bearer when set', req.headers['Authorization'] === 'Bearer sekret');
		const body = JSON.parse(req.body) as { model: string };
		check('custom model honored', body.model === 'my-model');
	}
	{
		// Trailing '/v1' in the override must not double up.
		const { req } = await run('custom', OPENAI_OK, { baseUrl: 'https://proxy.example.com/v1', model: 'my-model' });
		check("custom '/v1' suffix not duplicated", req.url === 'https://proxy.example.com/v1/chat/completions', ` (${req.url})`);
	}
}

async function testAnthropicNormalization(): Promise<void> {
	console.log('\n[P2] anthropic message normalization');
	const { transport, get } = captureTransport(ANTHROPIC_OK);
	await chatCompletion(
		{
			provider: 'anthropic',
			apiKey: 'k',
			baseUrl: '',
			model: '',
			systemPrompt: 'SYS',
			history: [
				{ role: 'model', text: 'greeting (should be dropped)' },
				{ role: 'user', text: 'q1' },
				{ role: 'model', text: 'a1' },
				{ role: 'model', text: 'a2' },
			],
			message: 'q2',
		},
		transport as never,
	);
	const body = JSON.parse(get().body) as { messages: Array<{ role: string; content: string }> };
	const roles = body.messages.map((m) => m.role).join(',');
	check('starts with user, alternates', roles === 'user,assistant,user', ` (${roles})`);
	check(
		'consecutive assistant turns merged with blank line',
		body.messages[1]?.content === 'a1\n\na2',
		` (${JSON.stringify(body.messages[1]?.content)})`,
	);
	check('final user turn is the new message', body.messages[2]?.content === 'q2');
}

async function testErrorClassification(): Promise<void> {
	console.log('\n[P3] error classification');
	const base = { provider: 'openai' as LlmProviderId, apiKey: 'k', baseUrl: '', model: '', systemPrompt: 's', history: [], message: 'x' };

	const expectKind = async (name: string, fn: () => Promise<unknown>, want: string) => {
		try {
			await fn();
			check(`${name} → ${want}`, false, ' (no error thrown)');
		} catch (e) {
			const got = e instanceof CoachError ? e.kind : `NOT-CoachError(${String(e)})`;
			check(`${name} → ${want}`, got === want, ` (got ${got})`);
		}
	};

	const rejectWith = (err: unknown) => async () => {
		throw err;
	};
	const viaClient = (t: () => Promise<{ text: string }>) => () => chatCompletion(base, t as never);
	await expectKind('thrown 401 → auth', viaClient(rejectWith(Object.assign(new Error('x'), { status: 401 }))), 'auth');
	await expectKind('thrown 429 → quota', viaClient(rejectWith(Object.assign(new Error('x'), { status: 429 }))), 'quota');
	await expectKind('thrown 500 → api', viaClient(rejectWith(Object.assign(new Error('x'), { status: 500 }))), 'api');
	await expectKind('reject without status → network', viaClient(rejectWith(new Error('socket hangup'))), 'network');

	const bodyText = (text: string) => async () => ({ text });
	await expectKind(
		'200 body {error 401} → auth',
		() => chatCompletion(base, bodyText(JSON.stringify({ error: { code: 401, message: 'invalid key' } })) as never),
		'auth',
	);
	await expectKind(
		'200 body {error 429} → quota',
		() => chatCompletion(base, bodyText(JSON.stringify({ error: { code: 429, message: 'rate limited' } })) as never),
		'quota',
	);
	await expectKind(
		'200 body {error 500} → api',
		() => chatCompletion(base, bodyText(JSON.stringify({ error: { code: 500, message: 'boom' } })) as never),
		'api',
	);

	// Provider label appears in the HTTP error message.
	try {
		await chatCompletion(base, rejectWith(Object.assign(new Error('x'), { status: 503 })) as never);
		check('httpError carries provider label', false, ' (no error thrown)');
	} catch (e) {
		const msg = e instanceof CoachError ? e.message : String(e);
		check('httpError carries provider label', msg.includes('OpenAI') && msg.includes('503'), ` (${msg})`);
	}

	// custom requires a base URL; a custom endpoint without a model is rejected.
	await expectKind(
		'custom without baseUrl → api',
		() => chatCompletion({ ...base, provider: 'custom', model: 'm' }, bodyText(OPENAI_OK) as never),
		'api',
	);
	await expectKind(
		'custom without model → api',
		() => chatCompletion({ ...base, provider: 'custom', baseUrl: 'https://proxy.example.com' }, bodyText(OPENAI_OK) as never),
		'api',
	);
}

async function testFallbackAndWindow(): Promise<void> {
	console.log('\n[P4] fallback + history window');
	check('unknown provider falls back to gemini', getProvider('bogus').id === 'gemini');
	check('13 providers registered', LLM_PROVIDER_IDS.length === 13, ` (${LLM_PROVIDER_IDS.join(',')})`);

	// Sliding window: 30 history blocks → only the last 20 go out (gemini).
	const { transport, get } = captureTransport(GEMINI_OK);
	const history = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }));
	await chatCompletion(
		{ provider: 'gemini', apiKey: 'k', baseUrl: '', model: '', systemPrompt: 'SYS', history, message: 'last' },
		transport as never,
	);
	const body = JSON.parse(get().body) as { contents: unknown[] };
	check('history capped at 20 + current message', body.contents.length === 21, ` (${body.contents.length})`);

	// Model override: empty model falls back to the provider default.
	const { transport: t2, get: g2 } = captureTransport(OPENAI_OK);
	await chatCompletion(
		{ provider: 'openai', apiKey: 'k', baseUrl: '', model: '', systemPrompt: 'SYS', history: [], message: 'hi' },
		t2 as never,
	);
	const b2 = JSON.parse(g2().body) as { model: string };
	check('empty model → provider default', b2.model === 'gpt-4o-mini');
}

// Domestic (China) OpenAI-compatible providers: URL paths, auth, defaults.
async function testDomesticProviders(): Promise<void> {
	console.log('\n[P5] domestic providers (DeepSeek/Qwen/Kimi/Zhipu/SiliconFlow/Doubao)');
	const base = {
		apiKey: 'FAKE-KEY-abc123',
		baseUrl: '',
		model: '',
		systemPrompt: 'SYS',
		history: [{ role: 'user' as const, text: 'hi' }],
		message: 'hello',
	};
	const run = async (provider: LlmProviderId) => {
		const { transport, get } = captureTransport(OPENAI_OK);
		const reply = await chatCompletion({ ...base, provider }, transport as never);
		return { reply, req: get() };
	};

	// deepseek — base without /v1; the builder appends /v1/chat/completions.
	{
		const { reply, req } = await run('deepseek');
		check('deepseek reply parsed', reply === 'openai reply');
		check('deepseek url', req.url === 'https://api.deepseek.com/v1/chat/completions', ` (${req.url})`);
		check('deepseek bearer auth', req.headers['Authorization'] === 'Bearer FAKE-KEY-abc123');
		const body = JSON.parse(req.body) as { model: string };
		check('deepseek default model', body.model === 'deepseek-chat');
	}

	// qwen — DashScope compatible-mode base; '/v1' suffix not duplicated.
	{
		const { req } = await run('qwen');
		check('qwen url', req.url === 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', ` (${req.url})`);
		const body = JSON.parse(req.body) as { model: string };
		check('qwen default model', body.model === 'qwen-plus');
	}

	// kimi — moonshot base with /v1.
	{
		const { req } = await run('kimi');
		check('kimi url', req.url === 'https://api.moonshot.cn/v1/chat/completions', ` (${req.url})`);
		const body = JSON.parse(req.body) as { model: string };
		check('kimi default model', body.model === 'moonshot-v1-8k');
	}

	// zhipu — path has NO '/v1' segment: /api/paas/v4/chat/completions.
	{
		const { req } = await run('zhipu');
		check('zhipu url (no /v1 duplication)', req.url === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', ` (${req.url})`);
		const body = JSON.parse(req.body) as { model: string };
		check('zhipu default model', body.model === 'glm-4.7-flash');
	}

	// siliconflow.
	{
		const { req } = await run('siliconflow');
		check('siliconflow url', req.url === 'https://api.siliconflow.cn/v1/chat/completions', ` (${req.url})`);
		const body = JSON.parse(req.body) as { model: string };
		check('siliconflow default model', body.model === 'deepseek-ai/DeepSeek-V3');
	}

	// doubao — Ark path has NO '/v1' segment: /api/v3/chat/completions.
	{
		const { req } = await run('doubao');
		check('doubao url (no /v1 duplication)', req.url === 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', ` (${req.url})`);
		check('doubao bearer auth', req.headers['Authorization'] === 'Bearer FAKE-KEY-abc123');
		const body = JSON.parse(req.body) as { model: string; messages: Array<{ role: string }> };
		check('doubao default model', body.model === 'doubao-seed-1-6-flash');
		check('doubao system first', body.messages[0]?.role === 'system');
	}

	// All domestic providers parse the OpenAI-style body uniformly.
	const ids: LlmProviderId[] = ['deepseek', 'qwen', 'kimi', 'zhipu', 'siliconflow', 'doubao'];
	for (const id of ids) {
		check(`${id} uniform response parse`, (await run(id)).reply === 'openai reply');
	}
}

async function main(): Promise<void> {
	await testRequestSnapshots();
	await testAnthropicNormalization();
	await testErrorClassification();
	await testFallbackAndWindow();
	await testDomesticProviders();
	console.log(failures === 0 ? '\nALL PROVIDER TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
