// Tests for opt-in progress sharing (src/share.ts) and local graphs
// (src/graphs.ts).
//
// The critical property under test: the share payload is built from a
// field whitelist, so raw note/journal text, file paths, vault names and
// habit ids can NEVER leak into what is sent — even if the input objects
// carry such fields.
//
// Build & run:
//   esbuild test/share/share-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/share/dist/share-test.cjs --format=cjs --log-level=warning \
//   && node test/share/dist/share-test.cjs

import {
	SHARE_API_URL,
	aggregateHabitStats,
	buildSharePayload,
	isValidShareId,
	shareFromStore,
	sharePageUrl,
	shareProgress,
	trailingWeekKeys,
	type SharePayload,
} from '../../src/share';
import { escapeXml, historyStripSvg, weeklyBarsSvg } from '../../src/graphs';
import { t } from '../../src/i18n';
import { addDays, todayKey } from '../../src/utils/dates';
import type { Habit } from '../../src/types';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

function makeHabit(id: string, title: string): Habit {
	return { id, title, created: todayKey(), schedule: 'daily', archived: false };
}

/** Check-set where the given habit was checked on the given day offsets (0 = today). */
function checksFor(habitId: string, offsets: number[]): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const off of offsets) {
		const key = addDays(todayKey(), -off);
		map.set(key, new Set([habitId]));
	}
	return map;
}

function testAggregate(): void {
	console.log('aggregateHabitStats');
	const habit = makeHabit('morning-run', 'Morning run');
	// checked today, yesterday, and 2 days ago -> streak 3; 3 of last 7 -> 3/7
	const checks = checksFor('morning-run', [0, 1, 2]);
	const [stat] = aggregateHabitStats([habit], checks);
	check('one stat per habit', !!stat);
	check('streak counted', stat?.streak === 3, ` (was ${stat?.streak})`);
	check('weekRate = 3/7 rounded to 3 decimals', stat?.weekRate === 0.429, ` (was ${stat?.weekRate})`);
	check('title kept', stat?.title === 'Morning run');

	// habit unchecked today but checked yesterday -> streak still alive
	const checks2 = checksFor('morning-run', [1, 2]);
	const [stat2] = aggregateHabitStats([habit], checks2);
	check('streak alive when yesterday checked', stat2?.streak === 2, ` (was ${stat2?.streak})`);

	// trailing week is exactly 7 keys ending today
	const wk = trailingWeekKeys();
	check('trailing week has 7 keys', wk.length === 7);
	check('trailing week ends today', wk[6] === todayKey());
}

function testPayloadSchema(): void {
	console.log('buildSharePayload schema');
	const payload = buildSharePayload({
		habits: [{ title: 'Read', streak: 5, weekRate: 0.7142857 }],
		pluginVersion: '0.3.0',
		generatedAt: '2026-09-17T00:00:00.000Z',
	});
	check('version is "1"', payload.version === '1');
	check('pluginVersion passes through', payload.pluginVersion === '0.3.0');
	check('generatedAt kept when valid ISO', payload.generatedAt === '2026-09-17T00:00:00.000Z');
	check('top-level keys whitelisted', keysOf(payload).join(',') === 'generatedAt,pluginVersion,stats,version');
	check('stats keys whitelisted', keysOf(payload.stats).join(',') === 'habits');
	check('habit keys whitelisted', keysOf(payload.stats.habits[0] ?? {}).join(',') === 'streak,title,weekRate');
	check('weekRate rounded to 3 decimals', payload.stats.habits[0]?.weekRate === 0.714);
	check(
		'generatedAt defaults to now when invalid',
		Number.isFinite(Date.parse(buildSharePayload({ habits: [], pluginVersion: 'x' }).generatedAt)),
	);
}

function keysOf(o: object): string[] {
	return Object.keys(o).sort();
}

function testNoLeak(): void {
	console.log('sanitizer: no raw-note leakage');
	// Simulate input objects polluted with everything that must NOT be sent.
	const secretNote = 'SECRET-JOURNAL-BODY-my therapist said XYZ';
	const secretPath = 'SECRET-VAULT/PATH/Journal/2026-09-17.md';
	const polluted = [
		{
			title: 'Meditate',
			streak: 2,
			weekRate: 0.5,
			// fields that must never appear in the payload:
			id: 'meditate',
			created: '2026-01-01',
			noteText: secretNote,
			filePath: secretPath,
			vault: 'MyVault',
		},
	];
	const payload = buildSharePayload({ habits: polluted, pluginVersion: '0.3.0' });
	const json = JSON.stringify(payload);
	check('no note body in payload', !json.includes(secretNote));
	check('no file path in payload', !json.includes(secretPath));
	check('no habit id in payload', !json.includes('"meditate"'));
	check('no created date in payload', !json.includes('2026-01-01'));
	check('title survives sanitizing', json.includes('Meditate'));

	// hostile values are neutralized, not passed through
	const hostile = buildSharePayload({
		habits: [
			{ title: 'x'.repeat(500), streak: NaN, weekRate: 99 },
			{ title: 12345, streak: -3, weekRate: -0.5 },
		],
		pluginVersion: '',
	});
	check('long title truncated to 120', (hostile.stats.habits[0]?.title.length ?? 0) <= 120);
	check('NaN streak -> 0', hostile.stats.habits[0]?.streak === 0);
	check('weekRate clamped to 1', hostile.stats.habits[0]?.weekRate === 1);
	check('numeric title stringified', hostile.stats.habits[1]?.title === '12345');
	check('negative streak -> 0', hostile.stats.habits[1]?.streak === 0);
	check('negative rate -> 0', hostile.stats.habits[1]?.weekRate === 0);
	check('empty version -> unknown', hostile.pluginVersion === 'unknown');
}

function testShareId(): void {
	console.log('isValidShareId');
	check('accepts token', isValidShareId('abcXYZ-123_'));
	check('accepts token-style id', isValidShareId('k9x2mQ7'));
	check('rejects empty', !isValidShareId(''));
	check('rejects path traversal', !isValidShareId('../../etc'));
	check('rejects url', !isValidShareId('https://habitude.ai/s/abc'));
	check('rejects non-string', !isValidShareId(123));
	check('rejects too-short', !isValidShareId('ab'));
	check('sharePageUrl format', sharePageUrl('abc123') === 'https://habitude.ai/s/abc123');
	check('endpoint constant', SHARE_API_URL === 'https://habitude.ai/api/share');
}

async function testShareProgress(): Promise<void> {
	console.log('shareProgress');
	const payload: SharePayload = buildSharePayload({
		habits: [{ title: 'Run', streak: 1, weekRate: 0.5 }],
		pluginVersion: '0.3.0',
	});

	let postedUrl = '';
	let postedBody = '';
	const okPost = async (url: string, body: string) => {
		postedUrl = url;
		postedBody = body;
		return { ok: true, json: async () => ({ id: 'abc123' }) };
	};
	const ok = await shareProgress(payload, { post: okPost });
	check('success resolves ok', ok.ok === true);
	if (ok.ok) check('url built from id', ok.url === 'https://habitude.ai/s/abc123');
	check('posts to share api', postedUrl === 'https://habitude.ai/api/share');
	const parsed = JSON.parse(postedBody) as SharePayload;
	check('posted body is the payload', parsed.version === '1' && parsed.stats.habits.length === 1);

	const throwing = await shareProgress(payload, {
		post: async () => {
			throw new Error('no backend yet');
		},
	});
	check('network throw -> ok:false (no throw)', throwing.ok === false);

	const badStatus = await shareProgress(payload, {
		post: async () => ({ ok: false, json: async () => ({}) }),
	});
	check('non-2xx -> ok:false', badStatus.ok === false);

	const badId = await shareProgress(payload, {
		post: async () => ({ ok: true, json: async () => ({ id: '../../evil' }) }),
	});
	check('invalid id -> ok:false', badId.ok === false);

	const noId = await shareProgress(payload, {
		post: async () => ({ ok: true, json: async () => ({}) }),
	});
	check('missing id -> ok:false', noId.ok === false);

	const badJson = await shareProgress(payload, {
		post: async () => ({
			ok: true,
			json: async () => {
				throw new Error('not json');
			},
		}),
	});
	check('json parse failure -> ok:false', badJson.ok === false);
}

async function testShareFromStore(): Promise<void> {
	console.log('shareFromStore');
	const habit = makeHabit('read-20-pages', 'Read 20 pages');
	const loadHabits = async () => [habit];
	const loadChecksRange = async () => checksFor('read-20-pages', [0]);

	// failure path: backend not there yet
	const notices: string[] = [];
	const copies: string[] = [];
	await shareFromStore(loadHabits, loadChecksRange, '0.3.0', (m) => notices.push(m), async (t) => {
		copies.push(t);
	});
	// defaultPost hits the real network in the plugin; in tests the sandbox
	// has no share backend, so this must resolve to the ready notice
	// (localized for the test env's UI locale, which is English in node).
	check('failure notice shown', notices.includes(t('share.serverNotReady')), ` (was ${JSON.stringify(notices)})`);
	check('nothing copied on failure', copies.length === 0);
}

function testGraphs(): void {
	console.log('graphs');
	const days = Array.from({ length: 30 }, (_, i) => ({
		key: addDays(todayKey(), -(29 - i)),
		checked: i % 2 === 0,
	}));
	const strip = historyStripSvg(days, 'Test habit');
	check('strip is svg', strip.includes('<svg') && strip.includes('</svg>'));
	check('strip has 30 cells', (strip.match(/<rect/g) ?? []).length === 30);
	check('strip has no raw script', !strip.includes('<script>'));

	const bars = weeklyBarsSvg([0, 0.5, 1, 0.25, 0.75, 1, 0, 0.5], 'Test habit');
	check('bars is svg', bars.includes('<svg'));
	check('bars has 8 bars', (bars.match(/<rect/g) ?? []).length === 8);
	check('bars show % labels', bars.includes('50%') && bars.includes('100%'));

	check('escapeXml escapes', escapeXml('<a href="x">&\'y\'</a>') === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;y&#39;&lt;/a&gt;');
	const evil = historyStripSvg([{ key: '2026-09-17', checked: true }], '<script>alert(1)</script>');
	check('label escaped in svg', evil.includes('&lt;script&gt;') && !evil.includes('<script>alert'));
	const evilTitle = historyStripSvg([{ key: '2026-09-17', checked: false }], '"><img src=x onerror=alert(1)>');
	check('no attribute breakout', !evilTitle.includes('"><img'));
}

async function main(): Promise<void> {
	testAggregate();
	testPayloadSchema();
	testNoLeak();
	testShareId();
	await testShareProgress();
	await testShareFromStore();
	testGraphs();
	if (failures > 0) {
		console.log(`\n${failures} check(s) FAILED`);
		process.exit(1);
	}
	console.log('\nAll share/graph checks passed.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
