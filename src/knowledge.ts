// Knowledge cards: AI-generated Markdown notes under "<dataFolder>/Knowledge/".
//
// One habit gets ONE note named after the habit title (sanitized), e.g.
// "Knowledge/晨跑.md" — easy to recognize in the file explorer. All cards
// live in that single note as "##" sections. The note is tied to the habit
// by a frontmatter `habitId` field (stable across title renames) and is
// written/rewritten only by regeneration; anything else in the folder,
// including the user's own notes, is never touched.
//
// Legacy layout (one file per card, "<habitId>-<n>.md") is cleaned up
// automatically on the next regeneration.

import { TFile, normalizePath } from 'obsidian';
import type { Habit } from './types';
import type { KnowledgeCard } from './ai-generator';
import { t } from './i18n';
import { todayKey } from './utils/dates';

export const KNOWLEDGE_FOLDER = 'Knowledge';

/**
 * Frontmatter keys on a generated note. Files are WRITTEN with the canonical
 * camelCase keys; lookups are case-insensitive because the parse lowercases
 * everything (hand-edited frontmatter may use any case).
 */
const FM_HABIT_ID = 'habitId';
const FM_HABIT = 'habit';
const FM_GENERATED = 'generated';

export interface KnowledgeCardFile {
	file: TFile;
	habitId: string;
	/** Frontmatter habit title snapshot (may be stale after a rename). */
	habit: string;
	/** Generation date (YYYY-MM-DD), '' when absent. */
	generated: string;
	/** First "# heading" of the note; falls back to the file basename. */
	title: string;
}

function knowledgePath(dataFolder: string): string {
	return normalizePath(`${dataFolder}/${KNOWLEDGE_FOLDER}`);
}

/** Minimal frontmatter reader: "---" block with "key: value" lines. */
function parseFrontmatter(text: string): Record<string, string> {
	if (!text.startsWith('---')) return {};
	const end = text.indexOf('\n---', 3);
	if (end < 0) return {};
	const out: Record<string, string> = {};
	for (const line of text.slice(3, end).split('\n')) {
		const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/);
		if (m?.[1]) out[m[1].toLowerCase()] = (m[2] ?? '').trim();
	}
	return out;
}

/** Extract the first "# heading" (not the frontmatter) from a note body. */
function firstHeading(text: string): string {
	for (const line of text.split('\n')) {
		const m = line.match(/^#\s+(.+)$/);
		if (m?.[1]) return m[1].trim();
	}
	return '';
}

/** List every knowledge-card note in the folder (empty when it doesn't exist). */
export async function listKnowledgeCards(app: import('obsidian').App, dataFolder: string): Promise<KnowledgeCardFile[]> {
	const prefix = `${knowledgePath(dataFolder)}/`;
	const out: KnowledgeCardFile[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		if (!f.path.startsWith(prefix)) continue;
		const text = await app.vault.read(f);
		const fm = parseFrontmatter(text);
		// Only notes carrying a habitId are cards; user notes without one are left alone.
		const habitId = fm[FM_HABIT_ID.toLowerCase()];
		if (!habitId) continue;
		out.push({
			file: f,
			habitId,
			habit: fm[FM_HABIT.toLowerCase()] ?? '',
			generated: fm[FM_GENERATED.toLowerCase()] ?? '',
			title: firstHeading(text) || f.basename,
		});
	}
	return out;
}

/** Cards belonging to one habit, ordered by filename. */
export async function listCardsForHabit(
	app: import('obsidian').App,
	dataFolder: string,
	habitId: string,
): Promise<KnowledgeCardFile[]> {
	return (await listKnowledgeCards(app, dataFolder))
		.filter((c) => c.habitId === habitId)
		.sort((a, b) => a.file.path.localeCompare(b.file.path));
}

// --- One note per habit ------------------------------------------------------

/** Display emoji + Chinese label for a known card category. */
const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
	trigger: { emoji: '🎯', label: '触发因素' },
	replacement: { emoji: '🔄', label: '替代行为' },
	coping: { emoji: '🧘', label: '应对技巧' },
	motivation: { emoji: '💡', label: '为什么重要' },
	strategy: { emoji: '🛠️', label: '执行策略' },
	maintenance: { emoji: '🌱', label: '长期维持' },
};

/**
 * File-name-safe base from a habit title: strips characters Obsidian and
 * Windows reject, collapses whitespace, caps length. Empty result falls back
 * to the habit id at the call site.
 */
export function sanitizeFileName(title: string): string {
	return title
		.replace(/[\\/:*?"<>|#^[\]]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.\s]+$/, '')
		.slice(0, 60)
		.trim();
}

/** Build the whole single-note markdown for one habit's cards. */
export function renderKnowledgeNote(
	habit: Pick<Habit, 'id' | 'title'>,
	cards: KnowledgeCard[],
	generated: string,
): string {
	const fm = [
		'---',
		`${FM_HABIT_ID}: ${habit.id}`,
		`${FM_HABIT}: ${habit.title.replace(/\n/g, ' ')}`,
		`${FM_GENERATED}: ${generated}`,
		'---',
	].join('\n');
	const head = `# 🧠 ${habit.title}\n\n> ${t('knowledge.noteMeta', { date: generated, n: String(cards.length) })}\n`;
	const sections = cards.map((card, i) => {
		const meta = CATEGORY_META[card.category] ?? { emoji: '📌', label: card.category };
		return `## ${meta.emoji} ${i + 1}. ${meta.label}：${card.title}\n\n${card.content}`;
	});
	return `${fm}\n\n${head}\n\n${sections.join('\n\n---\n\n')}\n`;
}

/**
 * Write all freshly generated cards of a habit into ONE note named after the
 * habit title. Replace semantics: the previous note for this habit (same
 * target name) and legacy "<habitId>-<n>.md" card files are trashed first;
 * any other file in the folder — user notes, other habits' notes — is
 * untouched. A name collision with an unrelated note resolves by suffixing
 * " 2", " 3", … instead of overwriting.
 */
export async function writeGeneratedKnowledgeNote(
	app: import('obsidian').App,
	dataFolder: string,
	habit: Pick<Habit, 'id' | 'title'>,
	cards: KnowledgeCard[],
): Promise<TFile> {
	const folder = knowledgePath(dataFolder);
	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}
	const base = sanitizeFileName(habit.title) || habit.id;
	const legacyRe = new RegExp(`^${escapeRegExp(habit.id)}-\\d+\\.md$`);
	for (const c of await listKnowledgeCards(app, dataFolder)) {
		if (c.habitId !== habit.id) continue;
		// Only files whose NAME marks them as plugin-generated are replaced;
		// a user note carrying a hand-written habitId is left alone.
		if (legacyRe.test(c.file.name) || c.file.name === `${base}.md`) {
			// FileManager.trashFile respects the user's deletion preference.
			await app.fileManager.trashFile(c.file);
		}
	}
	let name = `${base}.md`;
	let n = 2;
	while (app.vault.getAbstractFileByPath(normalizePath(`${folder}/${name}`))) {
		name = `${base} ${n}.md`;
		n++;
	}
	const path = normalizePath(`${folder}/${name}`);
	return await app.vault.create(path, renderKnowledgeNote(habit, cards, todayKey()));
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Manual associations (the "Notes" field on the habit section) -----------

/** The Habits.md field holding manually linked note wikilinks. */
export const MANUAL_LINKS_FIELD = 'Notes';

/** Parse a "Notes" field value into wikilink targets ("[[a]], [[b]]" → [a, b]). */
export function parseManualLinks(value: string): string[] {
	return value
		.split(',')
		.map((part) => part.trim())
		.map((part) => part.replace(/^\[\[/, '').replace(/\]\]$/, '').trim())
		.filter(Boolean);
}

/** Render wikilink targets back into a "Notes" field value. */
export function renderManualLinks(links: string[]): string {
	return links.map((l) => `[[${l}]]`).join(', ');
}
