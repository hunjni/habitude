// Tests for src/urge-log.ts (parse/render round-trip, append/list via the
// fs-backed mock vault, slip derivation, days-since-last-slip) and the
// review/urge-analysis prompt builders in src/ai-generator.ts.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore } from '../../src/store';
import {
	appendUrgeEntry,
	entriesForHabit,
	lastDayKeys,
	listUrgeEntries,
	nowTimeKey,
	parseUrgeLine,
	renderUrgeLine,
	slipDateKeys,
} from '../../src/urge-log';
import {
	buildReviewDataBlock,
	buildReviewPrompt,
	buildUrgeAnalysisPrompt,
	buildUrgeDataBlock,
	generateReview,
	generateUrgeAnalysis,
	type GenerationConfig,
} from '../../src/ai-generator';
import { daysSinceLastSlip } from '../../src/stats';
import type { RequestFnLike } from '../../src/coach/providers';
import { todayKey, addDays } from '../../src/utils/dates';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
	}
}

function testLines(): void {
	console.log('[P1] line parse/render round-trip');
	const e = { time: '23:41', habitId: 'doomscroll', situation: '睡前躺床', intensity: 8, coping: '深呼吸', outcome: 'slip' as const };
	const line = renderUrgeLine(e);
	check('render shape', line === '- 23:41 | doomscroll | 睡前躺床 | 8 | 深呼吸 | slip');
	const back = parseUrgeLine(line);
	check('round-trip', !!back && back.time === e.time && back.habitId === e.habitId && back.situation === e.situation && back.intensity === 8 && back.coping === e.coping && back.outcome === 'slip');
	check('resisted outcome', parseUrgeLine('- 08:00 | run | x | 3 | y | resisted')?.outcome === 'resisted');
	check('junk line skipped', parseUrgeLine('- [x] doomscroll <!-- check -->') === null);
	check('bad intensity rejected', parseUrgeLine('- 08:00 | run | x | 99 | y | resisted') === null);
	check('bad outcome rejected', parseUrgeLine('- 08:00 | run | x | 3 | y | won') === null);
	check('intensity 10 ok', parseUrgeLine('- 23:00 | doom | x | 10 | y | slip')?.intensity === 10);
	check('empty coping ok', parseUrgeLine('- 23:30 | doom | 深夜 | 9 |  | slip')?.coping === '');
	check('empty situation ok', parseUrgeLine('- 23:30 | doom |  | 9 | y | slip')?.situation === '');
	check('nowTimeKey format', /^\d{2}:\d{2}$/.test(nowTimeKey()));
}

async function testStoreRoundTrip(): Promise<void> {
	console.log('[P2] append/list via fs-backed vault');
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-urge-'));
	const app = createTestApp(root);
	const store = new HabitStore(app, 'Habitude');
	await store.ensureReady();
	const doom = await store.addHabit('Doomscroll', 'bad');
	const other = await store.addHabit('Snack', 'bad');

	await appendUrgeEntry(app, 'Habitude', { time: '22:10', habitId: doom.id, situation: '无聊', intensity: 6, coping: '散步', outcome: 'resisted' });
	await appendUrgeEntry(app, 'Habitude', { time: '23:30', habitId: doom.id, situation: '深夜独处', intensity: 9, coping: '', outcome: 'slip' });
	// Yesterday's file, for the other habit.
	await appendUrgeEntry(app, 'Habitude', { time: '21:00', habitId: other.id, situation: '压力大', intensity: 7, coping: '喝水', outcome: 'resisted' }, addDays(todayKey(), -1));

	const days = lastDayKeys(7);
	const byDay = await listUrgeEntries(app, 'Habitude', days);
	check('two files read', byDay.size === 2);
	const todayEntries = byDay.get(todayKey()) ?? [];
	check('today has 2 entries', todayEntries.length === 2);
	check('dates attached', todayEntries[0]?.date === todayKey());

	const doomEntries = entriesForHabit(byDay, doom.id);
	check('habit filter isolates', doomEntries.length === 2 && doomEntries.every((e) => e.habitId === doom.id));
	check('sorted by date+time', doomEntries[0]?.time === '22:10' && doomEntries[1]?.outcome === 'slip');

	const doomSlips = slipDateKeys(byDay, doom.id);
	check('slip dates per habit', doomSlips.length === 1 && doomSlips[0] === todayKey());
	const otherSlips = slipDateKeys(byDay, other.id);
	check('other habit has no slips', otherSlips.length === 0);

	// Hand-written junk lines in a day file are tolerated.
	const todayFile = path.join(root, 'Habitude', 'Urge', `${todayKey()}.md`);
	fs.writeFileSync(todayFile, `${fs.readFileSync(todayFile, 'utf8')}\n随便手写的一行\n`);
	const afterJunk = await listUrgeEntries(app, 'Habitude', [todayKey()]);
	check('junk line tolerated', (afterJunk.get(todayKey()) ?? []).length === 2);

	// Day-file content check on disk (plain markdown).
	const raw = fs.readFileSync(todayFile, 'utf8');
	check('file has day header', raw.startsWith(`# ${todayKey()}`));

	console.log('[P3] days since last slip');
	check('slip today = 0', daysSinceLastSlip([todayKey()]) === 0);
	check('slip 3 days ago = 3', daysSinceLastSlip([addDays(todayKey(), -3)]) === 3);
	check('multiple slips use latest', daysSinceLastSlip([addDays(todayKey(), -9), addDays(todayKey(), -2)]) === 2);
	check('never slipped = null', daysSinceLastSlip([]) === null);
	check('doom = today (0)', daysSinceLastSlip(doomSlips) === 0);
	check('other = null', daysSinceLastSlip(otherSlips) === null);

	fs.rmSync(root, { recursive: true, force: true });
}

const CFG: GenerationConfig = { provider: 'deepseek', apiKey: 'k', baseUrl: '', model: '', language: 'zh' };

function mockTransport(reply: string): { requestFn: RequestFnLike; bodies: string[] } {
	const bodies: string[] = [];
	const requestFn = (async (opts: { url: string; body: string }): Promise<{ text: string }> => {
		bodies.push(opts.body);
		return { text: JSON.stringify({ choices: [{ message: { content: reply } }] }) };
	}) as unknown as RequestFnLike;
	return { requestFn, bodies };
}

function testReviewBlocks(): void {
	console.log('[P4] review data block + prompts');
	const habits = [
		{ id: 'run', title: '晨跑', type: 'good' as const, created: '', schedule: 'daily' as const, archived: false, plan: null },
		{ id: 'doom', title: '刷手机', type: 'bad' as const, created: '', schedule: 'daily' as const, archived: false, plan: null },
	];
	const week = lastDayKeys(7);
	const checks = new Map<string, Set<string>>();
	for (const k of week) checks.set(k, new Set(['run']));
	checks.get(week[3]!)?.add('doom');
	const urgeByDay = new Map<string, Array<{ date: string; time: string; habitId: string; situation: string; intensity: number; coping: string; outcome: 'resisted' | 'slip' }>>();
	urgeByDay.set(todayKey(), [
		{ date: todayKey(), time: '23:00', habitId: 'doom', situation: '睡前', intensity: 9, coping: '', outcome: 'slip' },
		{ date: todayKey(), time: '10:00', habitId: 'doom', situation: '无聊', intensity: 4, coping: '喝水', outcome: 'resisted' },
	]);

	const block = buildReviewDataBlock(habits, week, checks, urgeByDay);
	check('good habit line', block.includes('[good] 晨跑 — week 7/7 (100%), streak'));
	check('bad habit resisted days', block.includes('[bad] 刷手机 — resisted 1/7 days this week'));
	check('bad habit slip count', block.includes('slips this week: 1'));
	check('bad habit avg intensity', block.includes('avg intensity 6.5/10'));
	check('weekday spread present', block.includes('Weekday completion'));
	check('never-slipped wording', !block.includes('never') || block.includes('days since last slip: never'));

	const prompt = buildReviewPrompt('this week', block);
	check('review prompt names period + data', prompt.includes('this week') && prompt.includes('[bad] 刷手机'));
	check('review prompt asks 3 parts', prompt.includes('completion-rate') && prompt.includes('fails') && prompt.includes('suggestions'));

	const urgeBlock = buildUrgeDataBlock(urgeByDay.get(todayKey()) ?? []);
	check('urge block lines', urgeBlock.includes('intensity 9/10') && urgeBlock.includes('situation: 睡前'));
	check('urge block empty case', buildUrgeDataBlock([]) === '(no urge entries recorded)');
	const urgePrompt = buildUrgeAnalysisPrompt('刷手机', urgeBlock);
	check('urge prompt names habit', urgePrompt.includes('刷手机') && urgePrompt.includes('trigger patterns'));
}

async function testGenerate(): Promise<void> {
	console.log('[P5] generate review / urge analysis (mock transport)');
	{
		const { requestFn, bodies } = mockTransport('复盘文本');
		const out = await generateReview(CFG, 'this week', '- [good] x — week 1/7', requestFn);
		check('review text returned', out === '复盘文本');
		const body = JSON.parse(bodies[0] ?? '{}') as { messages: Array<{ content: string }> };
		check('review prompt carried', body.messages[1]?.content.includes('[good] x') === true);
	}
	{
		const { requestFn, bodies } = mockTransport('模式分析');
		const out = await generateUrgeAnalysis(CFG, '刷手机', '- 2026-09-22 23:00 | intensity 9/10', requestFn);
		check('urge analysis returned', out === '模式分析');
		const body = JSON.parse(bodies[0] ?? '{}') as { messages: Array<{ content: string }> };
		check('urge prompt carried', body.messages[1]?.content.includes('刷手机') === true);
	}
}

async function main(): Promise<void> {
	testLines();
	await testStoreRoundTrip();
	testReviewBlocks();
	await testGenerate();
	console.log(failures === 0 ? '\nALL URGE TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
