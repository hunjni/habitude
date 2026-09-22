// Tests for src/knowledge.ts against the fs-backed mock vault: card writing,
// listing, replace-on-regenerate semantics, and manual Notes links round-trip
// through the habit store.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTestApp } from '../stress/mock-obsidian';
import { HabitStore } from '../../src/store';
import {
	listCardsForHabit,
	listKnowledgeCards,
	parseManualLinks,
	renderCardMarkdown,
	renderManualLinks,
	writeGeneratedCards,
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
	console.log('[P1] card markdown shape');
	const md = renderCardMarkdown('run', { title: '为什么跑步', content: '有氧改善情绪。', category: 'motivation' });
	check('frontmatter habitId (case-insensitive lookup)', /^---\nhabitId: run$/m.test(md));
	check('frontmatter category', md.includes('category: motivation'));
	check('title heading + body', md.includes('# 为什么跑步') && md.includes('有氧改善情绪。'));

	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'habitude-knowledge-'));
	const app = createTestApp(root);
	const store = new HabitStore(app, DATA);
	await store.ensureReady();
	const run = await store.addHabit('Morning run', 'good');
	const doom = await store.addHabit('Doomscroll', 'bad');

	console.log('[P2] write + list');
	await writeGeneratedCards(app, DATA, run, [
		{ title: '动机', content: '为什么重要', category: 'motivation' },
		{ title: '策略', content: '降低难度', category: 'strategy' },
	]);
	const cards = await listCardsForHabit(app, DATA, run.id);
	check('two cards listed', cards.length === 2);
	check('ordered filenames', cards[0]?.file.name === `${run.id}-1.md` && cards[1]?.file.name === `${run.id}-2.md`);
	check('titles read from heading', cards[0]?.title === '动机');
	check('categories from frontmatter', cards[0]?.category === 'motivation');

	console.log('[P3] regenerate replaces only generated files');
	// A user note in the same folder must survive regeneration.
	const userNotePath = `${DATA}/Knowledge/my-own-note.md`;
	await app.vault.create(userNotePath, '# 我自己的笔记\n');
	// And a card for a different habit.
	await writeGeneratedCards(app, DATA, doom, [{ title: '触发', content: '睡前无聊', category: 'trigger' }]);
	// Seed extra old generated files (e.g. from a run that produced 4 cards).
	await app.vault.create(`${DATA}/Knowledge/${run.id}-3.md`, `---\nhabitId: ${run.id}\ncategory: old\n---\n# 旧卡\n`);

	await writeGeneratedCards(app, DATA, run, [{ title: '新动机', content: '重新生成', category: 'motivation' }]);
	const after = await listCardsForHabit(app, DATA, run.id);
	check('regenerated to 1 card', after.length === 1 && after[0]?.file.name === `${run.id}-1.md`);
	check('new content in place', (await app.vault.read(after[0]!.file)).includes('重新生成'));
	check('stale run-3 trashed', fs.existsSync(path.join(root, 'Habitude/Knowledge', `${run.id}-3.md`)) === false);
	check('user note untouched', fs.existsSync(path.join(root, 'Habitude/Knowledge/my-own-note.md')));
	const doomCards = await listCardsForHabit(app, DATA, doom.id);
	check('other habit card untouched', doomCards.length === 1 && doomCards[0]?.title === '触发');
	const all = await listKnowledgeCards(app, DATA);
	check('user note not a card (no habitId)', all.every((c) => c.file.name !== 'my-own-note.md'));

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
