// Tests for src/plan-note.ts against the fs-backed mock vault: note markdown
// shape, "<title>执行方案" naming, replace-on-save semantics (scoped to the
// habit's own note), collision suffixing around foreign notes, and
// findPlanNote lookup by habitId.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestApp } from '../stress/mock-obsidian';
import { setUiLocale } from '../../src/i18n';
import { HabitStore } from '../../src/store';
import { findPlanNote, planBaseName, renderPlanNote, writePlanNote } from '../../src/plan-note';
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

const DATA = 'Habitude';

const PLAN: HabitPlan = {
	microHabit: '读两页',
	triggerCue: '晚饭后坐下时',
	executionTime: '20:30',
	location: '书房',
	environmentDesign: '书上不挪位置',
	immediateReward: '打一个勾',
	phases: [
		{ name: '适应期', days: '1-7', focus: '只求出现不求量' },
		{ name: '巩固期', days: '8-14', focus: '固定时间' },
	],
};

async function main(): Promise<void> {
	// The plan-note suffix and section labels come from i18n; pin the Chinese
	// locale so assertions against 执行方案 / 核心做法 are deterministic.
	setUiLocale('zh');
	console.log('[P1] note markdown shape');
	const md = renderPlanNote({ id: 'h1', title: '晨读', type: 'good' }, PLAN, '2026-09-22');
	check('frontmatter habitId', /^---\nhabitId: h1$/m.test(md));
	check('frontmatter habit snapshot', /^habit: 晨读$/m.test(md));
	check('frontmatter generated date', /^generated: 2026-09-22$/m.test(md));
	check('title heading carries habit name + suffix', md.includes('# 📋 晨读 · 执行方案'));
	check('fields section present', md.includes('## 核心做法'));
	check('field labels and values', md.includes('读两页') && md.includes('20:30'));
	check('phases section present', md.includes('## 阶段安排'));
	check('phase heading with day range', md.includes('### 适应期（1-7）'));
	check('phase focus body', md.includes('只求出现不求量'));
	check('phases separated by hr', md.includes('\n\n---\n\n'));

	console.log('[P1b] base name');
	check('suffix appended', planBaseName({ id: 'h2', title: '早睡' }) === '早睡执行方案');
	check('empty title falls back to id', planBaseName({ id: 'h3', title: '///' }) === 'h3执行方案');

	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-plan-note-'));
	const app = createTestApp(root);
	const store = new HabitStore(app, DATA);
	await store.ensureReady();
	const run = await store.addHabit('Morning run', 'good');
	const other = await store.addHabit('Meditation', 'good');

	console.log('[P2] write + find');
	await writePlanNote(app, DATA, run, PLAN);
	const found = await findPlanNote(app, DATA, run.id);
	check('note found by habitId', found !== null);
	check('file named <title>执行方案', found?.name === 'Morning run执行方案.md');
	check('lives in Plans folder', found?.path === `${DATA}/Plans/Morning run执行方案.md`);
	const text = await app.vault.read(found!);
	check('note carries plan content', text.includes('读两页') && text.includes('适应期'));

	console.log('[P3] replace semantics');
	// User note and another habit's note must survive a rewrite.
	await app.vault.create(`${DATA}/Plans/我的方案.md`, '# 手写方案\n');
	await writePlanNote(app, DATA, other, { ...PLAN, microHabit: '静坐一分钟' });
	const updated = { ...PLAN, microHabit: '读三页' };
	await writePlanNote(app, DATA, run, updated);
	const runNotes = [];
	// findPlanNote returns one; count via folder scan through a second find.
	const afterFind = await findPlanNote(app, DATA, run.id);
	check('still exactly one resolvable note', afterFind !== null);
	check('content updated', (await app.vault.read(afterFind!)).includes('读三页'));
	check(
		'old content gone',
		!(await app.vault.read(afterFind!)).includes('读两页'),
	);
	check('user note untouched', fs.existsSync(path.join(root, 'Habitude/Plans/我的方案.md')));
	const otherNote = await findPlanNote(app, DATA, other.id);
	check('other habit note untouched', otherNote !== null && (await app.vault.read(otherNote)).includes('静坐一分钟'));

	console.log('[P3b] collision suffixing, no overwrite');
	// A user note occupying the target name is never overwritten.
	const yoga = await store.addHabit('Yoga', 'good');
	await app.vault.create(`${DATA}/Plans/Yoga执行方案.md`, '# 我的瑜伽方案\n');
	await writePlanNote(app, DATA, yoga, PLAN);
	const yogaNote = await findPlanNote(app, DATA, yoga.id);
	check('yoga note suffixed around user note', yogaNote?.name === 'Yoga执行方案 2.md');
	const squatter = app.vault.getAbstractFileByPath(`${DATA}/Plans/Yoga执行方案.md`);
	check('user yoga plan intact', squatter !== null && (await app.vault.read(squatter as never)).includes('我的瑜伽方案'));

	console.log('[P4] store round-trip unaffected');
	await store.updatePlan(run.id, PLAN);
	const reloaded = (await store.loadHabits()).find((h) => h.id === run.id);
	check('plan fields still round-trip via Habits.md', reloaded?.plan?.microHabit === '读两页');
	check('planGenerated anchor present', !!reloaded?.planGenerated);

	fs.rmSync(root, { recursive: true, force: true });
	console.log(failures === 0 ? '\nALL PLAN-NOTE TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
