// Knowledge cards: AI-generated Markdown notes under "<dataFolder>/Knowledge/".
//
// Cards are ordinary vault notes — openable, editable, searchable, linkable —
// tied to a habit by a frontmatter `habitId` field (CONTEXT.md). AI-generated
// files are named "<habitId>-<n>.md"; regenerating replaces exactly those
// files (ADR on card regeneration) and never touches anything else in the
// folder, including the user's own notes or manually linked ones.

import { TFile, normalizePath } from 'obsidian';
import type { Habit } from './types';
import type { KnowledgeCard } from './ai-generator';

export const KNOWLEDGE_FOLDER = 'Knowledge';

/**
 * Frontmatter keys on a generated card file. Files are WRITTEN with the
 * canonical camelCase keys; lookups are case-insensitive because the parse
 * lowercases everything (hand-edited frontmatter may use any case).
 */
const FM_HABIT_ID = 'habitId';
const FM_CATEGORY = 'category';

export interface KnowledgeCardFile {
	file: TFile;
	habitId: string;
	category: string;
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

/** Build the on-disk note for one card: frontmatter + title heading + body. */
export function renderCardMarkdown(habitId: string, card: KnowledgeCard): string {
	const fm = [`---`, `${FM_HABIT_ID}: ${habitId}`, `${FM_CATEGORY}: ${card.category}`, `---`].join('\n');
	return `${fm}\n\n# ${card.title}\n\n${card.content}\n`;
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
			category: fm[FM_CATEGORY.toLowerCase()] ?? '',
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

/**
 * Write freshly generated cards for a habit. Replace semantics: existing
 * AI-generated files "<habitId>-<n>.md" are trashed first, then the new
 * cards are written from <habitId>-1.md upward. Any other file in the
 * folder (user notes, manually linked notes, other habits' cards) is
 * untouched.
 */
export async function writeGeneratedCards(
	app: import('obsidian').App,
	dataFolder: string,
	habit: Pick<Habit, 'id'>,
	cards: KnowledgeCard[],
): Promise<TFile[]> {
	const folder = knowledgePath(dataFolder);
	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}
	const generatedRe = new RegExp(`^${escapeRegExp(habit.id)}-\\d+\\.md$`);
	for (const c of await listKnowledgeCards(app, dataFolder)) {
		if (c.habitId === habit.id && generatedRe.test(c.file.name)) {
			// FileManager.trashFile respects the user's deletion preference.
			await app.fileManager.trashFile(c.file);
		}
	}
	const written: TFile[] = [];
	for (let i = 0; i < cards.length; i++) {
		const card = cards[i];
		if (!card) continue;
		const path = normalizePath(`${folder}/${habit.id}-${i + 1}.md`);
		written.push(await app.vault.create(path, renderCardMarkdown(habit.id, card)));
	}
	return written;
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
