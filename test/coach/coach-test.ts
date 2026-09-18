// Unit tests for the AI coach (BYOK): context assembler, curated prompt,
// and the Gemini client (with an injected request function — never hits the
// network).
//
// Build & run:
//   esbuild test/coach/coach-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/coach/dist/coach-test.cjs --format=cjs --log-level=warning \
//   && node test/coach/dist/coach-test.cjs

import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore } from '../../src/store';
import { buildTwinLiteContext, renderContextBlock } from '../../src/coach/context';
import { buildGreeting, buildSystemPrompt, COACH_PERSONA } from '../../src/coach/prompt';
import { chatCompletion, CoachError, DEFAULT_COACH_MODEL } from '../../src/coach/providers';
import { addDays, todayKey } from '../../src/utils/dates';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

/** Seed a vault: 3 habits, 14 days of logs with known patterns. */
async function seedVault(): Promise<{ store: HabitStore; dir: string }> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-coach-'));
	const app = createTestApp(dir);
	const store = new HabitStore(app, 'Habitude');
	await store.addHabit('Morning run');
	await store.addHabit('Read');
	await store.addHabit('Meditate');
	const today = todayKey();
	// Morning run: 14-day streak. Read: checked on even offsets. Meditate: never.
	for (let i = 0; i < 14; i++) {
		const key = addDays(today, -i);
		await store.setCheck(key, 'morning-run', 'Morning run', true);
		if (i % 2 === 0) await store.setCheck(key, 'read', 'Read', true);
	}
	return { store, dir };
}

async function testContext(): Promise<void> {
	console.log('\n[C1] twin-lite context');
	const { store } = await seedVault();
	const ctx = await buildTwinLiteContext(store, 1);
	check('3 habits summarized', ctx.habitCount === 3);
	const run = ctx.habits.find((h) => h.title === 'Morning run');
	check('morning-run streak is 14', run?.streak === 14, ` (got ${run?.streak})`);
	check('morning-run checked today', run?.checkedToday === true);
	const med = ctx.habits.find((h) => h.title === 'Meditate');
	check('meditate streak is 0', med?.streak === 0);
	check('meditate month rate 0', med?.monthRate === 0);
	check('weekday pattern has 7 entries', ctx.weekdayPattern.length === 7);
	check('weekday pattern values in [0,1]', ctx.weekdayPattern.every((v) => v >= 0 && v <= 1));
	check('checksLast7Days = 7 + 4 = 11', ctx.checksLast7Days === 11, ` (got ${ctx.checksLast7Days})`);

	const block = renderContextBlock(ctx);
	check('block mentions habit titles', block.includes('Morning run') && block.includes('Meditate'));
	check('block has streak numbers', /streak 14d/.test(block));
	check('block has weekday line', /Completion by weekday/.test(block));
	check('block has no markdown log lines', !block.includes('- [x]') && !block.includes('- [ ]'));
}

async function testPrompt(): Promise<void> {
	console.log('\n[C2] curated prompt');
	const { store } = await seedVault();
	const ctx = await buildTwinLiteContext(store, 1);

	check('persona is non-trivial', COACH_PERSONA.length > 800, ` (${COACH_PERSONA.length} chars)`);
	check('persona bans generic praise', /generic/i.test(COACH_PERSONA));
	check('persona requires data references', /specific numbers/i.test(COACH_PERSONA));

	const sys = buildSystemPrompt(ctx, 'auto');
	check('system prompt embeds context', sys.includes('Morning run') && sys.includes('streak 14d'));
	check('auto adds no language override', !sys.includes('Language override'));

	const sysKo = buildSystemPrompt(ctx, 'ko');
	check('ko adds language override', sysKo.includes('Language override') && sysKo.includes('Korean'));

	const greet = buildGreeting(ctx);
	check('greeting references today progress', /checked in 2\/3 habits today/.test(greet), ` (${greet.slice(0, 60)}…)`);

	const empty = await buildTwinLiteContext(
		{
			loadHabits: async () => [],
			loadChecksRange: async () => new Map(),
			loadDayChecks: async () => new Set<string>(),
		},
		1,
	);
	check('empty greeting invites first habit', /first one/i.test(buildGreeting(empty)));
}

async function testClient(): Promise<void> {
	console.log('\n[C3] Gemini BYOK client (mocked transport)');

	let lastUrl = '';
	let lastHeaders: Record<string, string> = {};
	let lastBody = '';
	const okTransport = async (opts: {
		url: string;
		headers?: Record<string, string>;
		body?: string;
	}) => {
		lastUrl = opts.url;
		lastHeaders = opts.headers ?? {};
		lastBody = opts.body ?? '';
		return {
			text: JSON.stringify({
				candidates: [{ content: { parts: [{ text: 'Great work on the run streak!' }] } }],
			}),
		};
	};

	const reply = await chatCompletion(
		{
			provider: 'gemini', baseUrl: '', apiKey: 'test-key-123',
			model: DEFAULT_COACH_MODEL,
			systemPrompt: 'SYS',
			history: [{ role: 'user', text: 'hi' }],
			message: 'how am I doing?',
		},
		okTransport as never,
	);
	check('returns model text', reply === 'Great work on the run streak!');
	check('hits googleapis host', lastUrl.startsWith('https://generativelanguage.googleapis.com/'));
	check('key sent via header, not URL', lastHeaders['x-goog-api-key'] === 'test-key-123' && !lastUrl.includes('test-key-123'));
	check('system instruction included', lastBody.includes('"system_instruction"'));
	check('history included', lastBody.includes('"hi"'));

	const errTransport = (code: number, message: string) => async () => ({
		text: JSON.stringify({ error: { code, message } }),
	});
	const expectKind = async (kind: string, code: number, message: string) => {
		try {
			await chatCompletion(
				{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 's', history: [], message: 'x' },
				errTransport(code, message) as never,
			);
			check(`${kind} error thrown`, false);
		} catch (e) {
			check(`${kind} error thrown`, e instanceof CoachError && e.kind === kind);
		}
	};
	await expectKind('auth', 401, 'API key not valid');
	await expectKind('auth', 400, 'API key not valid. Pass a valid API key.');
	await expectKind('quota', 429, 'Quota exceeded');
	await expectKind('api', 500, 'Internal error');

	try {
		await chatCompletion(
			{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 's', history: [], message: 'x' },
			(async () => {
				throw new Error('socket hangup');
			}) as never,
		);
		check('network error thrown', false);
	} catch (e) {
		check('network error thrown', e instanceof CoachError && e.kind === 'network');
	}

	const emptyTransport = async () => ({ text: JSON.stringify({ candidates: [] }) });
	try {
		await chatCompletion(
			{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 's', history: [], message: 'x' },
			emptyTransport as never,
		);
		check('empty reply error thrown', false);
	} catch (e) {
		check('empty reply error thrown', e instanceof CoachError && e.kind === 'api');
	}
}

async function main(): Promise<void> {
	await testContext();
	await testPrompt();
	await testClient();
	console.log(failures === 0 ? '\nALL COACH TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
