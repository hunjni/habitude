// Plan notes: a human-readable copy of each habit's execution plan under
// "<dataFolder>/Plans/", named "<habit title><suffix>.md" (suffix defaults to
// 执行方案 in the Chinese locale) so plan notes are recognizable at a glance
// and distinguishable from knowledge notes.
//
// The structured "### Plan" subsection in Habits.md stays the machine source
// of truth (phase badge, stats, round-trip safety per ADR-0002); the note is
// a generated pretty render of the same data, rewritten whenever the plan is
// written (AI generation or a manual save in the detail modal). Hand edits
// to the note are NOT read back — edit the plan in the detail modal instead.

import { TFile, normalizePath } from 'obsidian';
import { t } from './i18n';
import { todayKey } from './utils/dates';
import { parseFrontmatter, sanitizeFileName } from './knowledge';
import type { Habit, HabitPlan } from './types';

export const PLAN_FOLDER = 'Plans';

/** Frontmatter keys on a generated plan note (same convention as knowledge). */
const FM_HABIT_ID = 'habitId';
const FM_HABIT = 'habit';
const FM_GENERATED = 'generated';

function planFolderPath(dataFolder: string): string {
	return normalizePath(`${dataFolder}/${PLAN_FOLDER}`);
}

/**
 * "<title><suffix>" — the localized suffix distinguishes plan notes from
 * knowledge notes with the same habit name. Falls back to the habit id when
 * the title sanitizes to nothing.
 */
export function planBaseName(habit: Pick<Habit, 'id' | 'title'>): string {
	const base = sanitizeFileName(habit.title) || habit.id;
	return `${base}${t('planNote.suffix')}`;
}

/**
 * Render the whole plan note: frontmatter (habitId anchor + title snapshot +
 * generation date), the six recipe fields as a labeled list, then one section
 * per phase with a divider between them.
 */
export function renderPlanNote(
	habit: Pick<Habit, 'id' | 'title' | 'type'>,
	plan: HabitPlan,
	generated: string,
): string {
	const fm = [
		'---',
		`${FM_HABIT_ID}: ${habit.id}`,
		`${FM_HABIT}: ${habit.title.replace(/\n/g, ' ')}`,
		`${FM_GENERATED}: ${generated}`,
		'---',
	].join('\n');
	const head = `# 📋 ${habit.title} · ${t('planNote.suffix')}\n\n> ${t('planNote.meta', { date: generated })}\n`;

	const fields: Array<[keyof Omit<HabitPlan, 'phases'>, string]> = [
		['microHabit', 'detail.planFieldMicroHabit'],
		['triggerCue', 'detail.planFieldTriggerCue'],
		['executionTime', 'detail.planFieldExecutionTime'],
		['location', 'detail.planFieldLocation'],
		['environmentDesign', 'detail.planFieldEnvironmentDesign'],
		['immediateReward', 'detail.planFieldImmediateReward'],
	];
	const fieldLines = fields
		.map(([prop, key]) => {
			const value = plan[prop];
			return value ? `- **${t(key)}**：${value}` : '';
		})
		.filter(Boolean);
	const fieldsBlock =
		fieldLines.length > 0 ? `## ${t('planNote.fieldsSection')}\n\n${fieldLines.join('\n')}` : '';

	const phases = plan.phases
		.filter((p) => p.name || p.days || p.focus)
		.map((p) => `### ${p.name}${p.days ? `（${p.days}）` : ''}\n\n${p.focus}`);
	const phasesBlock =
		phases.length > 0 ? `## ${t('planNote.phasesSection')}\n\n${phases.join('\n\n---\n\n')}` : '';

	const body = [fieldsBlock, phasesBlock].filter(Boolean).join('\n\n---\n\n');
	return `${fm}\n\n${head}\n\n${body}\n`;
}

/** Find the generated plan note of a habit (null when there is none). */
export async function findPlanNote(
	app: import('obsidian').App,
	dataFolder: string,
	habitId: string,
): Promise<TFile | null> {
	const prefix = `${planFolderPath(dataFolder)}/`;
	for (const f of app.vault.getMarkdownFiles()) {
		if (!f.path.startsWith(prefix)) continue;
		const fm = parseFrontmatter(await app.vault.read(f));
		if (fm[FM_HABIT_ID.toLowerCase()] === habitId) return f;
	}
	return null;
}

/**
 * Write (or rewrite) the plan note of a habit. Replace semantics: the
 * previous note for this habit is trashed first; any other file in the
 * folder — user notes, other habits' notes — is untouched. A name collision
 * with an unrelated note resolves by suffixing " 2", " 3", … instead of
 * overwriting.
 */
export async function writePlanNote(
	app: import('obsidian').App,
	dataFolder: string,
	habit: Pick<Habit, 'id' | 'title' | 'type'>,
	plan: HabitPlan,
): Promise<TFile> {
	const folder = planFolderPath(dataFolder);
	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}
	for (const prev of await findPlanNotesForHabit(app, dataFolder, habit.id)) {
		// FileManager.trashFile respects the user's deletion preference.
		await app.fileManager.trashFile(prev);
	}
	const base = planBaseName(habit);
	let name = `${base}.md`;
	let n = 2;
	while (app.vault.getAbstractFileByPath(normalizePath(`${folder}/${name}`))) {
		name = `${base} ${n}.md`;
		n++;
	}
	return await app.vault.create(normalizePath(`${folder}/${name}`), renderPlanNote(habit, plan, todayKey()));
}

async function findPlanNotesForHabit(
	app: import('obsidian').App,
	dataFolder: string,
	habitId: string,
): Promise<TFile[]> {
	const out: TFile[] = [];
	const prefix = `${planFolderPath(dataFolder)}/`;
	for (const f of app.vault.getMarkdownFiles()) {
		if (!f.path.startsWith(prefix)) continue;
		const fm = parseFrontmatter(await app.vault.read(f));
		if (fm[FM_HABIT_ID.toLowerCase()] === habitId) out.push(f);
	}
	return out;
}
