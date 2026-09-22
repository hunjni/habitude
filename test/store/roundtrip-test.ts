// Round-trip tests for the Habits.md registry (src/store.ts).
//
// Verifies ADR-0002: hand-written content the plugin does not understand
// (unknown "- Key: value" fields, free-text lines) and the "### Plan"
// subsection must survive every plugin save. All store calls run through the
// public API against the fs-backed mock vault; the file is also seeded and
// inspected directly on disk.
//
// Build & run:
//   esbuild test/store/roundtrip-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/store/dist/roundtrip-test.cjs --format=cjs \
//     --log-level=warning && node test/store/dist/roundtrip-test.cjs

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore, parseSections, renderSections } from '../../src/store';
import { currentPhase, stageCategory } from '../../src/stats';
import type { HabitPlan } from '../../src/types';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
	}
}

const LEGACY = [
	'# Habits',
	'',
	'## run',
	'- Title: Morning run',
	'- Created: 2026-01-01',
	'- Schedule: daily',
	'- Archived: false',
	'',
	'',
].join('\n');

const SEEDED = [
	'# Habits',
	'',
	'## run',
	'- Title: Morning run',
	'- Created: 2026-01-01',
	'- Schedule: daily',
	'- Archived: false',
	'- Foo: bar', // unknown field: must survive
	'some free text', // raw line: must survive
	'',
	'## doom',
	'- Title: Doomscroll',
	'- Created: 2026-02-02',
	'- Archived: false',
	'- Type: bad',
	'- Owner: hand-written too', // unknown field in another section
	'',
	'',
].join('\n');

const PLAN: HabitPlan = {
	microHabit: 'Read 2 pages',
	triggerCue: 'After dinner, at the desk',
	executionTime: '20:30',
	location: 'Study room',
	environmentDesign: 'Book on the pillow',
	immediateReward: 'Tick the box',
	phases: [
		{ name: '适应期', days: '1-7', focus: 'shrink the step' },
		{ name: '巩固期', days: '8-14', focus: 'same time, same place' },
		{ name: '强化期', days: '15-21', focus: 'raise the bar | keep the streak' },
	],
};

async function main(): Promise<void> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-rt-'));
	const app = createTestApp(root);
	const store = new HabitStore(app, 'Habitude');
	const habitsPath = path.join(root, 'Habitude', 'Habits.md');

	try {
		// --- legacy file: no Type / no Plan -------------------------------
		console.log('legacy file');
		await store.ensureReady();
		fs.writeFileSync(habitsPath, LEGACY);
		const legacy = await store.loadHabits();
		check('legacy parses 1 habit', legacy.length === 1 && legacy[0]?.id === 'run');
		check('legacy defaults type=good', legacy[0]?.type === 'good');
		check('legacy has no plan', legacy[0]?.plan === null);
		check('legacy title read', legacy[0]?.title === 'Morning run');

		// --- round-trip: unknown content survives a rewrite -----------------
		console.log('round-trip unknown content');
		fs.writeFileSync(habitsPath, SEEDED);
		await store.archiveHabit('doom');
		const afterArchive = fs.readFileSync(habitsPath, 'utf8');
		check('unknown field kept (run)', afterArchive.includes('- Foo: bar'));
		check('raw line kept (run)', afterArchive.includes('some free text'));
		check('unknown field kept (doom)', afterArchive.includes('- Owner: hand-written too'));
		check('doom archived', /^- Archived: true$/m.test(afterArchive));
		check('run not archived', /## run[\s\S]*?- Archived: false/.test(afterArchive));
		// doom is archived now, so loadHabits() hides it — inspect via parseSections.
		const doomSection = parseSections(afterArchive).find((s) => s.id === 'doom');
		check(
			'doom type=bad survives',
			doomSection?.items.some((i) => i.kind === 'field' && i.key === 'Type' && i.value === 'bad') ?? false,
		);

		// --- addHabit with type ---------------------------------------------
		console.log('addHabit(type)');
		const snack = await store.addHabit('Late snacks', 'bad');
		check('id slugified', snack.id === 'late-snacks');
		check('new habit type=bad', snack.type === 'bad');
		const afterAdd = fs.readFileSync(habitsPath, 'utf8');
		check('Type field written', /## late-snacks[\s\S]*?- Type: bad/.test(afterAdd));
		check('unknown content still kept after add', afterAdd.includes('- Foo: bar') && afterAdd.includes('some free text'));
		check(
			'doom still bad after add',
			parseSections(afterAdd)
				.find((s) => s.id === 'doom')
				?.items.some((i) => i.kind === 'field' && i.key === 'Type' && i.value === 'bad') ?? false,
		);

		// --- plan write/read --------------------------------------------------
		console.log('plan write/read');
		await store.updatePlan('run', PLAN);
		const withPlan = await store.loadHabits();
		const runPlan = withPlan.find((h) => h.id === 'run')?.plan;
		check('plan parsed back', runPlan !== null);
		check('plan microHabit', runPlan?.microHabit === 'Read 2 pages');
		check('plan triggerCue', runPlan?.triggerCue === 'After dinner, at the desk');
		check('plan phases count', runPlan?.phases.length === 3);
		check('plan phase[0]', runPlan?.phases[0]?.name === '适应期' && runPlan?.phases[0]?.days === '1-7');
		// focus text containing '|' must round-trip through the split/join
		check('plan phase focus with pipe', runPlan?.phases[2]?.focus === 'raise the bar | keep the streak');
		const planText = fs.readFileSync(habitsPath, 'utf8');
		check('### Plan subsection written', planText.includes('### Plan'));
		check('PlanGenerated anchored on write', /- PlanGenerated: \d{4}-\d{2}-\d{2}/.test(planText));
		// Active habits: run + late-snacks (doom was archived earlier).
		check('plan not split into a section', (await store.loadHabits()).length === 2);
		const runGenerated = (await store.loadHabits()).find((h) => h.id === 'run')?.planGenerated;
		check('planGenerated read back', typeof runGenerated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(runGenerated ?? ''));

		// --- plan survives further mutations ----------------------------------
		console.log('plan survives mutations');
		await store.archiveHabit('late-snacks');
		await store.addHabit('Read', 'good');
		const finalText = fs.readFileSync(habitsPath, 'utf8');
		check('### Plan still present', finalText.includes('### Plan'));
		check('plan fields still present', finalText.includes('- MicroHabit: Read 2 pages'));
		check('- Phase line rendered', finalText.includes('- Phase: 适应期 | 1-7 | shrink the step'));
		check('PlanGenerated survives mutations', finalText.includes('- PlanGenerated:'));
		const finalRun = (await store.loadHabits()).find((h) => h.id === 'run')?.plan;
		check('plan still parses with 3 phases', finalRun?.phases.length === 3);

		// --- setHabitType -------------------------------------------------------
		console.log('setHabitType');
		await store.setHabitType('read', 'bad');
		check('type flipped to bad', (await store.loadHabits()).find((h) => h.id === 'read')?.type === 'bad');
		await store.setHabitType('read', 'good');
		check('type flipped back', (await store.loadHabits()).find((h) => h.id === 'read')?.type === 'good');

		// --- deleteHabit ---------------------------------------------------------
		console.log('deleteHabit');
		await store.addHabit('Temp habit', 'bad');
		const withTemp = await store.loadHabits();
		const tempId = withTemp[withTemp.length - 1]?.id ?? '';
		check('temp habit added', withTemp.some((h) => h.title === 'Temp habit'));
		await store.deleteHabit(tempId);
		const afterDelete = await store.loadHabits();
		check('temp habit gone', afterDelete.every((h) => h.id !== tempId));
		check('other habits survive', afterDelete.some((h) => h.title === 'Read'));
		const afterDeleteText = fs.readFileSync(habitsPath, 'utf8');
		check('registry has no temp section', !afterDeleteText.includes('Temp habit'));
		check('other sections intact', afterDeleteText.includes('### Plan'));

		// --- parseSections unit cases -------------------------------------------
		console.log('parseSections units');
		const lower = parseSections('## a\n### plan\n- MicroHabit: x\n### Other\n- Note: y\n');
		check('lowercase plan heading captured', lower[0]?.plan?.length === 1);
		const other = parseSections('## a\n- Title: t\n### Plan\n- MicroHabit: x\n### Notes\n- free note\n');
		check('other ### heading ends plan', other[0]?.items.some((i) => i.kind === 'raw' && i.text === '- free note') ?? false);
		const noSection = parseSections('# Habits\n');
		check('empty registry', noSection.length === 0);
		const dup = parseSections('## a\n### Plan\n- Phase: P1 | 1-3 | one\n- Phase: P2 | 4-6 | two\n');
		check('duplicate Phase keys kept', dup[0]?.plan?.filter((i) => i.kind === 'field' && i.key === 'Phase').length === 2);
		check('render(parse(x)) stable', renderSections(parseSections(SEEDED)) === renderSections(parseSections(renderSections(parseSections(SEEDED)))));

		// --- stage tracking (Q6): currentPhase + stageCategory ----------------
		console.log('stage tracking');
		check('no anchor -> no phase', currentPhase(PLAN, undefined) === null);
		check('over 21 days -> no phase', currentPhase(PLAN, '2020-01-01', '2020-02-01') === null);
		check('future anchor -> no phase', currentPhase(PLAN, '2999-01-01', '2026-09-22') === null);
		const d1 = currentPhase(PLAN, '2026-09-22', '2026-09-22');
		check('day 1 is adaptation', d1?.day === 1 && d1?.phase.name === '适应期');
		const d7 = currentPhase(PLAN, '2026-09-16', '2026-09-22');
		check('day 7 still adaptation', d7?.day === 7 && d7?.phase.name === '适应期');
		const d8 = currentPhase(PLAN, '2026-09-15', '2026-09-22');
		check('day 8 is consolidation', d8?.day === 8 && d8?.phase.name === '巩固期');
		const d21 = currentPhase(PLAN, '2026-09-01', '2026-09-21');
		check('day 21 is reinforcement', d21?.day === 21 && d21?.phase.name === '强化期');
		check('day 22 gone', currentPhase(PLAN, '2026-09-01', '2026-09-22') === null);
		// Unparsable ranges fall back to an even 21-day split.
		const freeform: HabitPlan = { ...PLAN, phases: [{ name: 'A', days: 'early', focus: '' }, { name: 'B', days: 'late', focus: '' }] };
		const f10 = currentPhase(freeform, '2026-09-13', '2026-09-22'); // day 10
		check('fallback even split (day 10 -> A)', f10?.phase.name === 'A');
		const f12 = currentPhase(freeform, '2026-09-11', '2026-09-22'); // day 12
		check('fallback even split (day 12 -> B)', f12?.phase.name === 'B');
		// Category priorities per stage/type (target D).
		check('good adaptation = strategy', stageCategory('good', 3) === 'strategy');
		check('good consolidation = maintenance', stageCategory('good', 10) === 'maintenance');
		check('good reinforcement = motivation', stageCategory('good', 20) === 'motivation');
		check('bad adaptation = trigger', stageCategory('bad', 3) === 'trigger');
		check('bad consolidation = replacement', stageCategory('bad', 10) === 'replacement');
		check('bad reinforcement = coping', stageCategory('bad', 20) === 'coping');
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}

	if (failures > 0) {
		console.log(`\n${failures} check(s) FAILED`);
		process.exit(1);
	}
	console.log('\nAll round-trip checks passed.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
