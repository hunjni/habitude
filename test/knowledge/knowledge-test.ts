// Tests for src/knowledge.ts against the fs-backed mock vault: single-note
// knowledge writing (one habit -> one file named after the habit title),
// listing, replace-on-regenerate semantics (incl. legacy "<habitId>-<n>.md"
// cleanup), file-name sanitization, collision suffixing, and manual Notes
// links round-trip through the habit store.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore } from '../../src/store';
import {
	listCardsForHabit,
	listKnowledgeCards,
	parseManualLinks,
	renderKnowledgeNote,
	renderManualLinks,
	sanitizeFileName,
	writeGeneratedKnowledgeNote,
	MANUAL_LINKS_FIELD,
} from '../../src/knowledge';

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

async function main(): Promise<void> {
	console.log('[P1] note markdown shape');
	const md = renderKnowledgeNote(
		{ id: 'h1', title: '晨跑' },
		[
			{ title: '有氧改善情绪', content: '科学依据：内啡肽。', category: 'motivation' },
			{ title: '两页起步法', content: '从最小动作开始。', category: 'strategy' },
		],
		'2026-09-22',
	);
	check('frontmatter habitId', /^---\nhabitId: h1$/m.test(md));
	check('frontmatter habit title snapshot', /^habit: 晨跑$/m.test(md));
	check('frontmatter generated date', /^generated: 2026-09-22$/m.test(md));
	check('note title heading carries habit name', md.includes('# 🧠 晨跑'));
	check('meta line renders', md.includes('2026-09-22') && md.includes('2'));
	check('section heading has emoji + label + card title', md.includes('## 💡 1. 为什么重要：有氧改善情绪'));
	check('section heading for second card', md.includes('## 🛠️ 2. 执行策略：两页起步法'));
	check('content bodies present', md.includes('内啡肽。') && md.includes('最小动作'));
	check('sections separated by hr', md.includes('\n\n---\n\n'));

	console.log('[P1b] file name sanitization');
	check('strips forbidden chars', sanitizeFileName('a/b\\c:d*e?f"g<h>i|j') === 'abcdefghij');
	check('collapses whitespace and trims dots', sanitizeFileName('  早睡 .. ') === '早睡');
	check('caps length at 60', sanitizeFileName('x'.repeat(100)).length === 60);
	check('empty -> empty (caller falls back to id)', sanitizeFileName('///') === '');

	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-knowledge-'));
	const app = createTestApp(root);
	const store = new HabitStore(app, DATA);
	await store.ensureReady();
	const run = await store.addHabit('Morning run', 'good');
	const doom = await store.addHabit('Doomscroll', 'bad');

	console.log('[P2] one note per habit, named after the habit');
	await writeGeneratedKnowledgeNote(app, DATA, run, [
		{ title: '动机', content: '为什么重要', category: 'motivation' },
		{ title: '策略', content: '降低难度', category: 'strategy' },
	]);
	const cards = await listCardsForHabit(app, DATA, run.id);
	check('exactly one note for the habit', cards.length === 1);
	check('file named after the habit title', cards[0]?.file.name === 'Morning run.md');
	check('single note holds both sections', (await app.vault.read(cards[0]!.file)).includes('## 💡 1. 为什么重要：动机'));
	check('note title read from heading', cards[0]?.title === '🧠 Morning run');
	check('generated date parsed', (cards[0]?.generated ?? '').match(/^\d{4}-\d{2}-\d{2}$/) !== null);
	check('habit snapshot in frontmatter', cards[0]?.habit === 'Morning run');

	console.log('[P3] regenerate replaces only generated files');
	// A user note in the same folder must survive regeneration.
	const userNotePath = `${DATA}/Knowledge/my-own-note.md`;
	await app.vault.create(userNotePath, '# 我自己的笔记\n');
	// And a note for a different habit.
	await writeGeneratedKnowledgeNote(app, DATA, doom, [{ title: '触发', content: '睡前无聊', category: 'trigger' }]);
	// Seed legacy per-card files from an older plugin version.
	await app.vault.create(`${DATA}/Knowledge/${run.id}-1.md`, `---\nhabitId: ${run.id}\n---\n# 旧卡1\n`);
	await app.vault.create(`${DATA}/Knowledge/${run.id}-3.md`, `---\nhabitId: ${run.id}\n---\n# 旧卡3\n`);

	await writeGeneratedKnowledgeNote(app, DATA, run, [{ title: '新动机', content: '重新生成', category: 'motivation' }]);
	const after = await listCardsForHabit(app, DATA, run.id);
	check('still exactly one note after regenerate', after.length === 1);
	check('note keeps the habit-titled name', after[0]?.file.name === 'Morning run.md');
	check('new content in place', (await app.vault.read(after[0]!.file)).includes('重新生成'));
	check('legacy run-1 trashed', fs.existsSync(path.join(root, 'Habitude/Knowledge', `${run.id}-1.md`)) === false);
	check('legacy run-3 trashed', fs.existsSync(path.join(root, 'Habitude/Knowledge', `${run.id}-3.md`)) === false);
	check('user note untouched', fs.existsSync(path.join(root, 'Habitude/Knowledge/my-own-note.md')));
	const doomCards = await listCardsForHabit(app, DATA, doom.id);
	check('other habit note untouched', doomCards.length === 1 && doomCards[0]?.file.name === 'Doomscroll.md');
	const all = await listKnowledgeCards(app, DATA);
	check('user note not a card (no habitId)', all.every((c) => c.file.name !== 'my-own-note.md'));

	console.log('[P3b] collision suffixing, no overwrite');
	// A second habit with the SAME title must not clobber the first note.
	const twin = await store.addHabit('Morning run', 'good');
	await writeGeneratedKnowledgeNote(app, DATA, twin, [{ title: '双胞胎', content: '同名习惯', category: 'strategy' }]);
	const twinCards = await listCardsForHabit(app, DATA, twin.id);
	check('twin habit gets suffixed file', twinCards[0]?.file.name === 'Morning run 2.md');
	const runCardsAfter = await listCardsForHabit(app, DATA, run.id);
	check('original note intact', runCardsAfter[0]?.file.name === 'Morning run.md' && (await app.vault.read(runCardsAfter[0]!.file)).includes('重新生成'));
	// A user note occupying the target name is never overwritten.
	const squatter = await store.addHabit('Yoga', 'good');
	await app.vault.create(`${DATA}/Knowledge/Yoga.md`, '# 我的瑜伽手记\n');
	await writeGeneratedKnowledgeNote(app, DATA, squatter, [{ title: '拉伸', content: '热身后进行', category: 'strategy' }]);
	const yoga = await listCardsForHabit(app, DATA, squatter.id);
	check('yoga card suffixed around user note', yoga[0]?.file.name === 'Yoga 2.md');
	const yogaUser = app.vault.getAbstractFileByPath(`${DATA}/Knowledge/Yoga.md`);
	check('user yoga note intact', yogaUser !== null && (await app.vault.read(yogaUser as never)).includes('我的瑜伽手记'));

	console.log('[P4] manual links via Notes field');
	check('parse plain', JSON.stringify(parseManualLinks('[[a]], [[b]]')) === JSON.stringify(['a', 'b']));
	check('parse bare words', JSON.stringify(parseManualLinks('a, b')) === JSON.stringify(['a', 'b']));
	check('parse empty', parseManualLinks('').length === 0);
	check('render round-trip', parseManualLinks(renderManualLinks(['x', 'y'])).join('|') === 'x|y');

	await store.setHabitField(run.id, MANUAL_LINKS_FIELD, renderManualLinks(['自控力指南']));
	const reloaded = (await store.loadHabits()).find((h) => h.id === run.id);
	check('notes field round-trips through the store', reloaded?.notes === '[[自控力指南]]');
	await store.setHabitField(run.id, MANUAL_LINKS_FIELD, '');
	const cleared = (await store.loadHabits()).find((h) => h.id === run.id);
	check('clearing links keeps the section valid', cleared?.notes === '' && cleared?.type === 'good');

	// Cleanup temp dir.
	fs.rmSync(root, { recursive: true, force: true });

	console.log(failures === 0 ? '\nALL KNOWLEDGE TESTS PASSED' : `\n${failures} FAILURES`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
