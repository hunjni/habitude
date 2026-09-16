// Stress test runner for the Habitude Checklist plugin.
// Run: node /tmp/obs-stress.cjs  (built by test/stress/build-stress.sh)
//
// Scenarios:
//   S1  scale: 200 habits + 730 daily log files — load/stats/toggle timing
//   S2a rapid sequential toggles (50x) — latency + no lost writes
//   S2b concurrent toggles (50x, same file) — race-condition / lost-write check
//   S3  malformed data — parser must never throw (graceful degradation)
//   S4  external edit — store must pick up hand edits (reads are always fresh)
//   S5  empty vault — first-run experience

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTestApp } from './mock-obsidian';
import { HabitStore } from '../../src/store';
import { recentKeys, streakFor, weekRateFor } from '../../src/stats';
import { addDays, todayKey } from '../../src/utils/dates';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

function timed(name: string, ms: number, budgetMs: number): void {
	const ok = ms < budgetMs;
	if (!ok) failures++;
	console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${ms.toFixed(1)}ms (budget ${budgetMs}ms)`);
}

async function scenarioScale(): Promise<void> {
	console.log('\n[S1] scale: 200 habits, 730 log files');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s1-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');

	// Seed 200 habits via the store itself.
	let t0 = performance.now();
	for (let i = 0; i < 200; i++) {
		await store.addHabit(`Stress habit number ${i}`);
	}
	const seedHabitsMs = performance.now() - t0;
	timed('seed 200 habits (via addHabit)', seedHabitsMs, 30_000);

	// Seed 730 daily logs, each with 200 checked lines, written directly.
	t0 = performance.now();
	const today = todayKey();
	const habitIds: string[] = [];
	for (let i = 0; i < 200; i++) habitIds.push(`stress-habit-number-${i}`);
	const logDir = path.join(vaultDir, 'Habitude', 'Log');
	fs.mkdirSync(logDir, { recursive: true });
	for (let d = 0; d < 730; d++) {
		const key = addDays(today, -d);
		const lines = [`# ${key}`, ''];
		// checkerboard pattern: habit i checked on day d iff (i + d) % 2 === 0
		for (let i = 0; i < 200; i++) {
			const mark = (i + d) % 2 === 0 ? 'x' : ' ';
			lines.push(`- [${mark}] ${habitIds[i]} <!-- Stress habit number ${i} -->`);
		}
		fs.writeFileSync(path.join(logDir, `${key}.md`), lines.join('\n'));
	}
	timed('seed 730 log files (direct write)', performance.now() - t0, 60_000);

	t0 = performance.now();
	const habits = await store.loadHabits();
	const loadHabitsMs = performance.now() - t0;
	timed('loadHabits() with 200 habits', loadHabitsMs, 1000);
	check('200 habits parsed', habits.length === 200, ` (got ${habits.length})`);

	// What the view actually loads: 7-day window + 60 recent days.
	const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i));
	t0 = performance.now();
	const checks = await store.loadChecksRange([...weekKeys, ...recentKeys()]);
	timed('loadChecksRange(67 days)', performance.now() - t0, 1000);

	t0 = performance.now();
	let totalStreak = 0;
	for (const h of habits) totalStreak += streakFor(h.id, checks);
	const streakMs = performance.now() - t0;
	timed('streakFor x200 over 60 days', streakMs, 500);
	check('streaks computed sane', totalStreak >= 0, ` (sum=${totalStreak})`);

	t0 = performance.now();
	for (const h of habits) weekRateFor(h.id, weekKeys, checks);
	timed('weekRateFor x200', performance.now() - t0, 500);

	// Toggle latency on a file with 200 lines.
	t0 = performance.now();
	const probeId = habitIds[0] ?? '';
	await store.setCheck(today, probeId, 'Stress habit number 0', false);
	const toggleMs = performance.now() - t0;
	timed('setCheck on 200-line log', toggleMs, 1000);

	// addHabit rewrites the whole Habits.md (200 sections).
	t0 = performance.now();
	await store.addHabit('One more habit');
	timed('addHabit rewrite of 200-habit registry', performance.now() - t0, 1000);

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioDayCache(): Promise<void> {
	console.log('\n[S6] day-check mtime cache — re-renders skip disk reads');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s6-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	const h = await store.addHabit('Cached habit');
	const today = todayKey();
	const keys = Array.from({ length: 30 }, (_, i) => addDays(today, -i));
	for (const k of keys) {
		await store.setCheck(k, h.id, h.title, true);
	}

	const vault = (app as unknown as { vault: { readCount: number } }).vault;
	vault.readCount = 0;
	await store.loadChecksRange(keys);
	const firstReads = vault.readCount;
	check('first loadChecksRange reads 30 files', firstReads === 30, ` (reads=${firstReads})`);

	vault.readCount = 0;
	const t0 = performance.now();
	const cached = await store.loadChecksRange(keys);
	const cachedMs = performance.now() - t0;
	check('second loadChecksRange performs 0 file reads (cache hit)', vault.readCount === 0, ` (reads=${vault.readCount})`);
	check('cached data identical', cached.get(today)?.has(h.id) === true);
	timed('cached loadChecksRange(30 days)', cachedMs, 50);

	// External (hand) edit must invalidate: direct fs write, then re-read.
	const logPath = path.join(vaultDir, 'Habitude', 'Log', `${today}.md`);
	fs.writeFileSync(logPath, `# ${today}\n\n- [ ] ${h.id} <!-- hand unchecked -->\n`);
	vault.readCount = 0;
	const after = await store.loadDayChecks(today);
	check('hand edit invalidates cache (re-read from disk)', vault.readCount === 1, ` (reads=${vault.readCount})`);
	check('hand edit content visible', !after.has(h.id));

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioRapidToggle(): Promise<void> {
	console.log('\n[S2a] 50 rapid sequential toggles — latency + write integrity');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s2a-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	const h = await store.addHabit('Rapid toggle habit');
	const today = todayKey();

	const t0 = performance.now();
	for (let i = 0; i < 50; i++) {
		await store.setCheck(today, h.id, h.title, i % 2 === 0);
	}
	const total = performance.now() - t0;
	timed('50 sequential toggles', total, 5000);
	console.log(`       avg per toggle: ${(total / 50).toFixed(1)}ms`);

	const checks = await store.loadDayChecks(today);
	// 50 toggles: i=0 → checked, …, i=49 (odd) → unchecked. Final = unchecked.
	check('final state correct (50 toggles → unchecked)', !checks.has(h.id));
	// No duplicate lines for the habit.
	const raw = fs.readFileSync(path.join(vaultDir, 'Habitude', 'Log', `${today}.md`), 'utf8');
	const matches = raw.split('\n').filter((l) => l.includes(h.id));
	check('no duplicate checkbox lines', matches.length === 1, ` (found ${matches.length})`);

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioConcurrentToggle(): Promise<void> {
	console.log('\n[S2b] 50 CONCURRENT toggles on the same day file — race check');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s2b-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	const today = todayKey();
	const habits = [];
	for (let i = 0; i < 50; i++) {
		habits.push(await store.addHabit(`Concurrent habit ${i}`));
	}

	// 50 different habits toggled "at once" on the same day file.
	await Promise.all(habits.map((h) => store.setCheck(today, h.id, h.title, true)));

	const raw = fs.readFileSync(path.join(vaultDir, 'Habitude', 'Log', `${today}.md`), 'utf8');
	const lines = raw.split('\n').filter((l) => l.startsWith('- [x]'));
	check('all 50 concurrent writes landed (no lost writes)', lines.length === 50, ` (found ${lines.length})`);

	// Same habit toggled concurrently with mixed values — last writer should win,
	// and the file must stay well-formed (no duplicated lines).
	const h0 = habits[0];
	if (!h0) throw new Error('no habits seeded');
	await Promise.all([
		store.setCheck(today, h0.id, h0.title, true),
		store.setCheck(today, h0.id, h0.title, false),
		store.setCheck(today, h0.id, h0.title, true),
	]);
	const raw2 = fs.readFileSync(path.join(vaultDir, 'Habitude', 'Log', `${today}.md`), 'utf8');
	const dupes = raw2.split('\n').filter((l) => l.includes(h0.id));
	check('concurrent same-habit toggles leave exactly one line', dupes.length === 1, ` (found ${dupes.length})`);

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioMalformed(): Promise<void> {
	console.log('\n[S3] malformed data — parsers must never throw');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s3-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	await store.ensureReady();

	const garbage = [
		'', // empty
		'\x00\x01\x02 binary junk \xff\xfe', // binary-ish
		'just some prose\nwith no headers at all\n- Title: oops', // prose
		'# Habits\n## \n## #not-a-slug\n- Title:\n'.repeat(50), // empty / heading ids
		'## ' + 'a'.repeat(10000) + '\n- Title: huge\n', // 10k id
		'## ok\n' + '- Title: x\n'.repeat(5000), // 5000 title lines, first wins
	];
	let threw = false;
	for (const [i, g] of garbage.entries()) {
		fs.writeFileSync(path.join(vaultDir, 'Habitude', 'Habits.md'), g);
		try {
			const habits = await store.loadHabits();
			if (!Array.isArray(habits)) throw new Error('not an array');
		} catch (e) {
			threw = true;
			console.log(`       threw on case ${i}: ${String(e).slice(0, 120)}`);
		}
	}
	check('parseHabits never throws on garbage', !threw);

	const logGarbage = [
		'',
		'no checkboxes here',
		'- [] missing-space\n- [x]\n- [x] ',
		'- [x] id1\n- [X] id2\n- [y] id3\n- [] id4',
		'- [x] ' + 'b'.repeat(5000),
	];
	threw = false;
	for (const [i, g] of logGarbage.entries()) {
		fs.writeFileSync(path.join(vaultDir, 'Habitude', 'Log', '2099-01-01.md'), g);
		try {
			const s = await store.loadDayChecks('2099-01-01');
			if (!(s instanceof Set)) throw new Error('not a set');
		} catch (e) {
			threw = true;
			console.log(`       threw on log case ${i}: ${String(e).slice(0, 120)}`);
		}
	}
	check('parseDayChecks never throws on garbage', !threw);

	// addHabit must survive a garbage registry (no duplicate ids, file stays parseable).
	fs.writeFileSync(path.join(vaultDir, 'Habitude', 'Habits.md'), 'total garbage\n## ##\n');
	try {
		const h = await store.addHabit('Recovered habit');
		const reloaded = await store.loadHabits();
		check('addHabit recovers from garbage registry', reloaded.some((x) => x.id === h.id));
	} catch (e) {
		check('addHabit recovers from garbage registry', false, ` threw: ${String(e).slice(0, 80)}`);
	}

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioExternalEdit(): Promise<void> {
	console.log('\n[S4] external (hand) edit while plugin is "open" — freshness');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s4-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');
	await store.addHabit('Original title');

	// Simulate the user editing Habits.md by hand (outside the plugin).
	fs.writeFileSync(
		path.join(vaultDir, 'Habitude', 'Habits.md'),
		'# Habits\n\n## original-title\n- Title: Hand edited title\n- Created: 2026-01-01\n- Schedule: daily\n- Archived: false\n',
	);
	const habits = await store.loadHabits();
	check('hand-edited title is picked up', habits[0]?.title === 'Hand edited title');

	// Hand-edit a log file.
	const today = todayKey();
	fs.writeFileSync(
		path.join(vaultDir, 'Habitude', 'Log', `${today}.md`),
		`# ${today}\n\n- [x] original-title <!-- Hand edited -->\n`,
	);
	const checks = await store.loadDayChecks(today);
	check('hand-edited log check is picked up', checks.has('original-title'));

	// External edit then plugin write must not lose the external edit.
	await store.addHabit('Second habit');
	const reloaded = await store.loadHabits();
	check('plugin write preserves hand-edited habit', reloaded.some((h) => h.title === 'Hand edited title'));

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function scenarioEmptyVault(): Promise<void> {
	console.log('\n[S5] empty vault — first-run experience');
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stress-s5-'));
	const app = createTestApp(vaultDir);
	const store = new HabitStore(app, 'Habitude');

	const habits = await store.loadHabits();
	check('loadHabits on empty vault → []', habits.length === 0);
	check(
		'Habits.md created',
		fs.existsSync(path.join(vaultDir, 'Habitude', 'Habits.md')),
	);
	check('Log/ created', fs.existsSync(path.join(vaultDir, 'Habitude', 'Log')));
	const checks = await store.loadDayChecks(todayKey());
	check('loadDayChecks on missing file → empty set', checks.size === 0);

	fs.rmSync(vaultDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
	await scenarioScale();
	await scenarioRapidToggle();
	await scenarioConcurrentToggle();
	await scenarioMalformed();
	await scenarioExternalEdit();
	await scenarioEmptyVault();
	await scenarioDayCache();
	console.log(failures === 0 ? '\nALL STRESS TESTS PASSED' : `\n${failures} STRESS TEST(S) FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
