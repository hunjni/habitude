// Edge-case / hardening tests for the AI coach (BYOK) — round 2.
//
// Covers what round 1 missed: empty vaults, special-char titles, scale
// (200 habits × 730 logs → context-block bloat), malformed logs, thrown
// requestUrl error shapes, and conversation-memory growth.
//
// Build & run:
//   esbuild test/coach/coach-edge-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/coach/dist/coach-edge-test.cjs --format=cjs --log-level=warning \
//   && node test/coach/dist/coach-edge-test.cjs
//
// NOTE on [E5]: these checks assert the *desired* classification of
// requestUrl's thrown error shapes (Obsidian rejects on non-2xx with an
// error carrying `status` and `json`). They currently FAIL — see the
// open-issue note at the bottom of this file and the parent report.

import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore } from '../../src/store';
import {
	buildTwinLiteContext,
	renderContextBlock,
} from '../../src/coach/context';
import { buildGreeting, buildSystemPrompt } from '../../src/coach/prompt';
import { chatCompletion, CoachError } from '../../src/coach/providers';
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

const EMPTY_STORE = {
	loadHabits: async () => [],
	loadChecksRange: async () => new Map<string, Set<string>>(),
	loadDayChecks: async () => new Set<string>(),
};

async function testEmptyVault(): Promise<void> {
	console.log('\n[E1] empty vault (no habits)');
	const ctx = await buildTwinLiteContext(EMPTY_STORE, 1);
	check('habitCount is 0', ctx.habitCount === 0);
	check('weekday pattern all zeros', ctx.weekdayPattern.every((v) => v === 0));
	check('checksLast7Days is 0', ctx.checksLast7Days === 0);

	const block = renderContextBlock(ctx);
	check('block states 0 habits', block.includes('0 habit(s)'));
	check('block has no Habits section', !block.includes('Habits:'));
	check('block has no weekday line', !block.includes('Completion by weekday'));

	const sys = buildSystemPrompt(ctx, 'auto');
	check('system prompt covers the no-data case', sys.includes('no habits yet'));

	const greet = buildGreeting(ctx);
	check('greeting invites first habit', /first one/i.test(greet));
}

async function testSpecialTitles(): Promise<void> {
	console.log('\n[E2] special-char / long habit titles');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-coach-edge-'));
	const app = createTestApp(dir);
	const store = new HabitStore(app, 'Habitude');
	const longTitle = 'L'.repeat(500);
	const titles = [
		'Drink "water" #1',
		'Read **bold** [link](http://x)',
		'일기 📓 & <tags> "quotes" \'apostrophes\'',
		longTitle,
	];
	for (const t of titles) await store.addHabit(t);

	const today = todayKey();
	const habits = await store.loadHabits();
	for (const h of habits) {
		await store.setCheck(today, h.id, h.title, true);
	}

	const ctx = await buildTwinLiteContext(store, 1);
	const block = renderContextBlock(ctx);
	check('context builds without throwing', ctx.habitCount === 4);
	for (const t of titles.slice(0, 3)) {
		check(`block contains title "${t.slice(0, 20)}…"`, block.includes(t));
	}
	check('block contains 500-char title', block.includes(longTitle));
	check('block has no raw markdown log lines', !block.includes('- [x]') && !block.includes('- [ ]'));

	const quotedLine = block.split('\n').find((l) => l.includes('Drink '));
	const unbalanced = (quotedLine?.match(/"/g) ?? []).length % 2 === 1;
	console.log(
		`  INFO quoted title line: ${unbalanced ? 'UNBALANCED quotes (cosmetic)' : 'balanced'} — ${quotedLine?.slice(0, 70)}…`,
	);
}

async function testScale(): Promise<void> {
	console.log('\n[E3] scale: 200 habits × 730 log files');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-coach-scale-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	for (let i = 0; i < 200; i++) {
		await store.addHabit(`Scale habit number ${i}`);
	}
	const today = todayKey();
	const logDir = path.join(vaultDir, 'Habitude', 'Log');
	fs.mkdirSync(logDir, { recursive: true });
	for (let d = 0; d < 730; d++) {
		const key = addDays(today, -d);
		const lines = [`# ${key}`, ''];
		for (let i = 0; i < 200; i++) {
			const mark = (i + d) % 2 === 0 ? 'x' : ' ';
			lines.push(`- [${mark}] scale-habit-number-${i} <!-- Scale habit number ${i} -->`);
		}
		fs.writeFileSync(path.join(logDir, `${key}.md`), lines.join('\n'));
	}

	const t0 = Date.now();
	const ctx = await buildTwinLiteContext(store, 1);
	const block = renderContextBlock(ctx);
	const ms = Date.now() - t0;

	check('context builds at scale', ctx.habitCount === 200);
	check('context build under 5s', ms < 5000, ` (${ms}ms)`);
	check('weekday pattern sane', ctx.weekdayPattern.every((v) => v >= 0 && v <= 1));
	check('block within ~4000-char budget', block.length <= 4000, ` (${block.length} chars)`);
	check('long tail aggregated', /more habit\(s\)/.test(block));
	console.log(`  INFO context block size: ${block.length} chars`);
}

async function testMalformedLogs(): Promise<void> {
	console.log('\n[E4] malformed logs + zero-check habit');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-coach-mal-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	await store.addHabit('Never checked habit');

	const today = todayKey();
	const logDir = path.join(vaultDir, 'Habitude', 'Log');
	fs.mkdirSync(logDir, { recursive: true });
	fs.writeFileSync(
		path.join(logDir, `${today}.md`),
		[
			`# ${today}`,
			'',
			'- [x]',
			'- [y] bogus',
			'random garbage line',
			'',
			'- [ ] never-checked-habit <!-- Never checked habit -->',
			'- [ ] ',
			'## not a habit section',
			'- [x] nonexistent-habit-id',
		].join('\n'),
	);

	let ctx;
	try {
		ctx = await buildTwinLiteContext(store, 1);
		check('malformed log does not throw', true);
	} catch (e) {
		check('malformed log does not throw', false, ` (${String(e)})`);
		return;
	}
	const h = ctx.habits[0];
	if (!h) {
		check('zero-check habit present', false);
		return;
	}
	check('zero-check habit streak is 0', h.streak === 0);
	check('zero-check habit month rate is 0', h.monthRate === 0);
	check('zero-check habit not done today', h.checkedToday === false);
	const block = renderContextBlock(ctx);
	check('block renders zero-check habit', block.includes('Never checked habit'));
}

// --- [E5] thrown error shapes -------------------------------------------------
// Realistic Obsidian requestUrl behavior: rejects on non-2xx with an error
// carrying `status` and parsed `json`/`text`. The client classifies these by
// status (auth/quota/api) and only treats status-less rejections as network.

/** Mimic Obsidian's thrown requestUrl error for an HTTP status. */
function thrownHttpError(status: number, message: string): Error {
	return Object.assign(new Error(`Request failed, status ${status} (${message})`), {
		status,
		json: { error: { code: status, message } },
		text: JSON.stringify({ error: { code: status, message } }),
	});
}

async function expectThrownKind(name: string, err: Error, want: string): Promise<void> {
	try {
		await chatCompletion(
			{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 's', history: [], message: 'x' },
			(async () => {
				throw err;
			}) as never,
		);
		check(`${name} → ${want}`, false, ' (no error thrown)');
	} catch (e) {
		const got = e instanceof CoachError ? e.kind : `NOT-CoachError(${String(e)})`;
		check(`${name} → ${want}`, got === want, ` (got ${got})`);
	}
}

async function testErrorShapes(): Promise<void> {
	console.log('\n[E5] gemini error classification — resolved-path extras');
	const bodyText = (text: string) => async () => ({ text });

	const resolvedCases: Array<[string, string, string]> = [
		['non-JSON body', 'Internal Server Error', 'api'],
		['empty candidates array', JSON.stringify({ candidates: [] }), 'api'],
		['empty content parts', JSON.stringify({ candidates: [{ content: { parts: [] } }] }), 'api'],
		['undefined part text', JSON.stringify({ candidates: [{ content: { parts: [{}] } }] }), 'api'],
		['no candidates field', JSON.stringify({}), 'api'],
		['error field 404', JSON.stringify({ error: { code: 404, message: 'Model not found' } }), 'api'],
	];
	for (const [name, text, want] of resolvedCases) {
		try {
			await chatCompletion(
				{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 's', history: [], message: 'x' },
				bodyText(text) as never,
			);
			check(`${name} → ${want}`, false, ' (no error thrown)');
		} catch (e) {
			const got = e instanceof CoachError ? e.kind : 'NOT-CoachError';
			check(`${name} → ${want}`, got === want, ` (got ${got})`);
		}
	}

	console.log('\n[E5b] thrown requestUrl shapes (DESIRED kinds — see open issue)');
	await expectThrownKind('thrown 400 (bad API key)', thrownHttpError(400, 'API key not valid'), 'auth');
	await expectThrownKind('thrown 401', thrownHttpError(401, 'Unauthorized'), 'auth');
	await expectThrownKind('thrown 403', thrownHttpError(403, 'Permission denied'), 'auth');
	await expectThrownKind('thrown 429', thrownHttpError(429, 'Quota exceeded'), 'quota');
	await expectThrownKind('thrown 404', thrownHttpError(404, 'Not found'), 'api');
	await expectThrownKind('thrown 500', thrownHttpError(500, 'Internal error'), 'api');
	await expectThrownKind('thrown 503', thrownHttpError(503, 'Service unavailable'), 'api');
}

async function testConversationMemory(): Promise<void> {
	console.log('\n[E6] conversation memory: 20 sequential messages');
	const seenContents: number[] = [];
	const transport = async (opts: { body?: string }) => {
		const parsed = JSON.parse(opts.body ?? '{}') as { contents?: unknown[] };
		seenContents.push(parsed.contents?.length ?? 0);
		return { text: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
	};

	// Mirror coach-view's messages array: alternate user/model, growing each turn.
	const history: Array<{ role: 'user' | 'model'; text: string }> = [];
	let crashed = false;
	for (let i = 0; i < 20; i++) {
		history.push({ role: 'user', text: `message ${i}` });
		try {
			const reply = await chatCompletion(
				{ provider: 'gemini', baseUrl: '', apiKey: 'k', model: 'm', systemPrompt: 'SYS', history, message: `follow-up ${i}` },
				transport as never,
			);
			if (reply !== 'ok') crashed = true;
			history.push({ role: 'model', text: reply });
		} catch {
			crashed = true;
		}
	}
	check('20 turns complete without crash', !crashed);
	const first = seenContents[0] ?? 0;
	const last = seenContents[seenContents.length - 1] ?? 0;
	check('request payload capped by sliding window', last <= 20 + 1, ` (${last} contents blocks)`);
	check('early turns still grow', (seenContents[5] ?? 0) > first, ` (${first} → ${seenContents[5]} contents)`);
	console.log(
		`  INFO final turn sent ${last} contents blocks; client windows history to the last 20 blocks`,
	);
}

async function main(): Promise<void> {
	await testEmptyVault();
	await testSpecialTitles();
	await testScale();
	await testMalformedLogs();
	await testErrorShapes();
	await testConversationMemory();
	console.log(failures === 0 ? '\nALL COACH EDGE TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
