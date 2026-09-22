// Tests for src/ai-generator.ts: prompt builders, tolerant JSON extraction,
// validation, and the generate* entry points over a mock transport.

import {
	buildKnowledgePrompt,
	buildPlanPrompt,
	extractJson,
	parseKnowledgeCards,
	parsePlan,
	generateKnowledgeCards,
	generatePlan,
	type GenerationConfig,
} from '../../src/ai-generator';
import type { RequestFnLike } from '../../src/coach/providers';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
	}
}

function throws(fn: () => void): boolean {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}

function testExtractJson(): void {
	console.log('[P1] extractJson');
	const arr = [{ title: 'a', content: 'b' }];
	check('plain array', JSON.stringify(extractJson(JSON.stringify(arr))) === JSON.stringify(arr));
	check(
		'code-fenced array',
		JSON.stringify(extractJson('```json\n' + JSON.stringify(arr, null, 2) + '\n```')) ===
			JSON.stringify(arr),
	);
	check(
		'prose around array',
		JSON.stringify(extractJson('Here you go:\n[{"title":"a","content":"b"}]\nHope that helps!')) ===
			JSON.stringify(arr),
	);
	check('plain object', (extractJson('{"a":1}') as { a: number }).a === 1);
	check('nested braces in strings', (extractJson('x {"a":"}{"} y') as { a: string }).a === '}{');
	check('garbage throws', throws(() => extractJson('no json here at all')));
	check('broken json throws', throws(() => extractJson('[{title: a}]')));
}

function testPrompts(): void {
	console.log('[P2] prompt builders');
	const good = buildKnowledgePrompt('Morning run', 'good');
	check('good prompt names habit', good.includes('Morning run'));
	check('good prompt uses motivation categories', good.includes('motivation'));
	check('good prompt asks for array', good.includes('JSON array'));
	const bad = buildKnowledgePrompt('Doomscroll', 'bad');
	check('bad prompt names habit', bad.includes('Doomscroll'));
	check('bad prompt uses CBT categories', bad.includes('trigger') && bad.includes('replacement') && bad.includes('coping'));
	const plan = buildPlanPrompt('Read', 'good');
	check('plan prompt names habit + type', plan.includes('Read') && plan.includes('good'));
	check('plan prompt asks for object', plan.includes('JSON object'));
	check('plan prompt asks for phases', plan.includes('phases'));
}

function testParsers(): void {
	console.log('[P3] parsers');
	const cards = parseKnowledgeCards([
		{ title: 'T1', content: 'C1', category: 'motivation' },
		{ title: '', content: 'C2', category: 'x' }, // invalid: no title
		{ title: 'T3', content: 'C3', category: 'STRATEGY' }, // normalized later by caller
		null,
		'text',
	]);
	check('invalid entries dropped', cards.length === 2);
	check('valid entries kept', cards[0]?.title === 'T1' && cards[1]?.title === 'T3');
	check('empty result throws', throws(() => parseKnowledgeCards([{ title: '', content: '' }])));
	check('non-array throws', throws(() => parseKnowledgeCards({ title: 'x' })));

	const plan = parsePlan({
		microHabit: ' read 2 pages ',
		triggerCue: 'after breakfast',
		executionTime: '08:00',
		location: 'desk',
		environmentDesign: 'book on pillow',
		immediateReward: 'coffee',
		phases: [
			{ name: '适应期', days: '1-7', focus: 'ease in' },
			{ name: '巩固期', days: '8-14', focus: '' }, // focus optional
			42, // invalid dropped
		],
	});
	check('fields trimmed', plan.microHabit === 'read 2 pages');
	check('phases kept', plan.phases.length === 2);
	check('phases parsed', plan.phases[0]?.name === '适应期' && plan.phases[0]?.days === '1-7');
	check('non-object throws', throws(() => parsePlan('nope')));
	check('array throws', throws(() => parsePlan([1])));
}

// Mock transport: records the request, returns a fixed OpenAI-style body.
interface Recorded {
	url: string;
	headers: Record<string, string>;
	body: string;
}

function mockTransport(reply: unknown): { requestFn: RequestFnLike; calls: Recorded[] } {
	const calls: Recorded[] = [];
	const requestFn = (async (opts: {
		url: string;
		headers: Record<string, string>;
		body: string;
	}): Promise<{ text: string }> => {
		calls.push(opts);
		return { text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }) };
	}) as unknown as RequestFnLike;
	return { requestFn, calls };
}

const CFG: GenerationConfig = {
	provider: 'deepseek',
	apiKey: 'sk-test',
	baseUrl: '',
	model: '',
	language: 'zh',
};

async function testGenerate(): Promise<void> {
	console.log('[P4] generate entry points (mock transport)');
	const cards = [
		{ title: '触发', content: '情境识别', category: 'trigger' },
		{ title: '替代', content: '深呼吸', category: 'replacement' },
		{ title: '应对', content: '反应妨害', category: 'coping' },
	];

	{
		const { requestFn, calls } = mockTransport(cards);
		const out = await generateKnowledgeCards(CFG, { title: '刷手机', type: 'bad' }, requestFn);
		check('cards parsed', out.length === 3 && out[0]?.title === '触发');
		const c0 = calls[0];
		check('deepseek endpoint hit', !!c0 && c0.url === 'https://api.deepseek.com/v1/chat/completions', c0?.url ?? 'no call');
		check('bearer auth sent', !!c0 && c0.headers['Authorization'] === 'Bearer sk-test');
		const body = c0 ? (JSON.parse(c0.body ?? '{}') as { messages: Array<{ role: string; content: string }> }) : null;
		check('system prompt carries zh note', body?.messages[0]?.content.includes('Simplified Chinese') === true);
		check('prompt is the habit', body?.messages[1]?.content.includes('刷手机') === true);
	}
	{
		const planJson = {
			microHabit: '读 2 页',
			triggerCue: '早餐后',
			executionTime: '08:00',
			location: '书桌',
			environmentDesign: '书放枕边',
			immediateReward: '咖啡',
			phases: [{ name: '适应期', days: '1-7', focus: '降低难度' }],
		};
		const { requestFn, calls } = mockTransport(planJson);
		const plan = await generatePlan(CFG, { title: '阅读', type: 'good' }, requestFn);
		check('plan parsed', plan.microHabit === '读 2 页' && plan.phases.length === 1);
		const c0 = calls[0];
		check(
			'prompt names habit',
			!!c0 && (JSON.parse(c0.body ?? '{}') as { messages: Array<{ content: string }> }).messages[1]?.content.includes('阅读') === true,
		);
	}
	{
		// Fence-wrapped reply must survive extraction.
		const raw = '```json\n[' + JSON.stringify({ title: 'a', content: 'b', category: 'motivation' }) + ']\n```';
		const requestFnFenced = (async (): Promise<{ text: string }> => ({
			text: JSON.stringify({ choices: [{ message: { content: raw } }] }),
		})) as unknown as RequestFnLike;
		const out = await generateKnowledgeCards(CFG, { title: 'x', type: 'good' }, requestFnFenced);
		check('fenced reply parsed', out.length === 1 && out[0]?.title === 'a');
	}
	{
		// Model error bodies propagate as CoachError.
		const requestFnErr = (async (): Promise<{ text: string }> => ({
			text: JSON.stringify({ error: { code: 401, message: 'bad key' } }),
		})) as unknown as RequestFnLike;
		let msg = '';
		try {
			await generateKnowledgeCards(CFG, { title: 'x', type: 'good' }, requestFnErr);
		} catch (e) {
			msg = e instanceof Error ? e.message : String(e);
		}
		check('auth error classified', msg.length > 0 && msg !== 'No valid JSON found in AI reply');
	}
}

async function main(): Promise<void> {
	testExtractJson();
	testPrompts();
	testParsers();
	await testGenerate();
	console.log(failures === 0 ? '\nALL AI-GENERATOR TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
