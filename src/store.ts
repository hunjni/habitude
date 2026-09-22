// Markdown-native storage for the Habitude Checklist plugin.
//
// Layout inside the vault (under settings.dataFolder, default "Habitude"):
//   Habits.md            — habit registry, one "## <id>" section per habit
//                          Fields are "- Key: value" lines; sections may carry
//                          a "- Type: good|bad" field and a "### Plan"
//                          subsection (the execution plan). Anything else the
//                          user hand-writes inside a section is preserved
//                          verbatim across saves (round-trip, ADR-0002).
//   Log/YYYY-MM-DD.md    — daily log with "- [x] <id> <!-- Title -->" checkboxes
//
// Both files are plain markdown: users can read and edit them by hand and the
// plugin will pick the changes up on the next render.

import { App, TFile, normalizePath } from 'obsidian';
import type { Habit, HabitPhase, HabitPlan, HabitType } from './types';
import { slugify, todayKey } from './utils/dates';

const HABITS_FILE = 'Habits.md';
const LOG_FOLDER = 'Log';

function asFile(f: unknown): TFile | null {
	return f instanceof TFile ? f : null;
}

// --- Habits.md sections: round-trip parse/render ----------------------------
//
// renderSections is a full-file rewrite, so unknown hand-written content
// (extra "- Key: value" fields, free-text lines, extra "- Phase:" entries)
// must survive every save. Sections are therefore parsed into ordered items
// and rendered back verbatim — only known keys are ever mutated in place.

/** One "- Key: value" line inside a habit section (or its Plan subsection). */
export interface SectionField {
	kind: 'field';
	key: string;
	value: string;
}

/** Any other line inside a section, preserved verbatim. */
export interface SectionRawLine {
	kind: 'raw';
	text: string;
}

export type SectionItem = SectionField | SectionRawLine;

export interface HabitSection {
	id: string;
	items: SectionItem[];
	/** Items of the "### Plan" subsection; null when the section has none. */
	plan: SectionItem[] | null;
}

/** "- Key: value" — keys are ASCII identifiers (with spaces/hyphens), values may contain anything. */
const FIELD_RE = /^-\s+([A-Za-z][A-Za-z0-9 _-]*):\s?(.*)$/;
const PLAN_HEADING_RE = /^###\s+Plan\s*$/i;

/**
 * Parse the Habits.md registry into ordered sections. Exported for tests.
 * A "### Plan" heading switches capture into the subsection; any other "###"
 * heading switches back. Blank lines are normalized away by the renderer.
 */
export function parseSections(text: string): HabitSection[] {
	const sections: HabitSection[] = [];
	const parts = text.split(/^## /m);
	// parts[0] is the "# Habits" header preface, not a habit section.
	for (const part of parts.slice(1)) {
		const lines = part.split('\n');
		const id = lines[0]?.trim();
		// Skip the header preface and any malformed sections (ids are slugs, never headings).
		if (!id || id.startsWith('#')) continue;
		const items: SectionItem[] = [];
		let plan: SectionItem[] | null = null;
		let target: SectionItem[] = items;
		for (const line of lines.slice(1)) {
			const trimmed = line.trim();
			if (PLAN_HEADING_RE.test(trimmed)) {
				plan = [];
				target = plan;
				continue;
			}
			if (trimmed.startsWith('###')) {
				// A different subsection ends the Plan capture.
				target = items;
			}
			if (trimmed === '') continue;
			const m = trimmed.match(FIELD_RE);
			if (m) {
				target.push({ kind: 'field', key: m[1]?.trim() ?? '', value: m[2]?.trim() ?? '' });
			} else {
				target.push({ kind: 'raw', text: trimmed });
			}
		}
		sections.push({ id, items, plan });
	}
	return sections;
}

function renderItem(item: SectionItem): string {
	return item.kind === 'field' ? `- ${item.key}: ${item.value}` : item.text;
}

/** Render the full Habits.md text. Exported for tests. */
export function renderSections(sections: HabitSection[]): string {
	const out = ['# Habits', ''];
	for (const s of sections) {
		out.push(`## ${s.id}`);
		for (const item of s.items) out.push(renderItem(item));
		if (s.plan) {
			if (out[out.length - 1]?.trim() !== '') out.push('');
			out.push('### Plan');
			for (const item of s.plan) out.push(renderItem(item));
		}
		out.push('');
	}
	return out.join('\n');
}

function getField(items: SectionItem[], key: string): string {
	const f = items.find((i) => i.kind === 'field' && i.key.toLowerCase() === key.toLowerCase());
	return f && f.kind === 'field' ? f.value : '';
}

/** Set the first field with the given key; append at the end when absent. */
function setField(items: SectionItem[], key: string, value: string): void {
	const f = items.find((i) => i.kind === 'field' && i.key.toLowerCase() === key.toLowerCase());
	if (f && f.kind === 'field') {
		f.value = value;
	} else {
		items.push({ kind: 'field', key, value });
	}
}

// --- Plan subsection <-> HabitPlan -------------------------------------------

const PLAN_FIELD_KEYS: Array<[Exclude<keyof HabitPlan, 'phases'>, string]> = [
	['microHabit', 'MicroHabit'],
	['triggerCue', 'TriggerCue'],
	['executionTime', 'ExecutionTime'],
	['location', 'Location'],
	['environmentDesign', 'EnvironmentDesign'],
	['immediateReward', 'ImmediateReward'],
];

/** Repeated "- Phase: name | days | focus" lines carry the phase timeline. */
function planFromFields(items: SectionItem[]): HabitPlan {
	const plan: HabitPlan = {
		microHabit: '',
		triggerCue: '',
		executionTime: '',
		location: '',
		environmentDesign: '',
		immediateReward: '',
		phases: [],
	};
	for (const [prop, key] of PLAN_FIELD_KEYS) {
		plan[prop] = getField(items, key);
	}
	for (const item of items) {
		if (item.kind !== 'field' || item.key.toLowerCase() !== 'phase') continue;
		const parts = item.value.split('|').map((p) => p.trim());
		const phase: HabitPhase = {
			name: parts[0] ?? '',
			days: parts[1] ?? '',
			// A '|' inside the focus text itself round-trips via the join.
			focus: parts.slice(2).join(' | '),
		};
		plan.phases.push(phase);
	}
	return plan;
}

function planToFields(plan: HabitPlan): SectionItem[] {
	const items: SectionItem[] = PLAN_FIELD_KEYS.map(([prop, key]) => ({
		kind: 'field',
		key,
		value: plan[prop],
	}));
	for (const phase of plan.phases) {
		items.push({
			kind: 'field',
			key: 'Phase',
			value: `${phase.name} | ${phase.days} | ${phase.focus}`,
		});
	}
	return items;
}

function habitFromSection(s: HabitSection): Habit {
	return {
		id: s.id,
		title: getField(s.items, 'Title') || s.id,
		created: getField(s.items, 'Created') || todayKey(),
		schedule: 'daily',
		archived: getField(s.items, 'Archived').toLowerCase() === 'true',
		// Missing field (legacy sections) defaults to 'good'.
		type: getField(s.items, 'Type').toLowerCase() === 'bad' ? 'bad' : 'good',
		plan: s.plan ? planFromFields(s.plan) : null,
		notes: getField(s.items, 'Notes'),
		planGenerated: getField(s.items, 'PlanGenerated') || undefined,
	};
}

// --- Day checks --------------------------------------------------------------

function parseDayChecks(text: string): Set<string> {
	const checked = new Set<string>();
	for (const line of text.split('\n')) {
		const m = line.match(/^-\s*\[(x|X)\]\s+(\S+)/);
		const id = m?.[2];
		if (id) checked.add(id);
	}
	return checked;
}

export class HabitStore {
	constructor(private app: App, private dataFolder: string) {}

	/**
	 * Per-file write serialization. setCheck/addHabit/archiveHabit all do
	 * read-modify-write; without a lock, concurrent toggles on the same file
	 * interleave reads and later writes clobber earlier ones (lost updates).
	 */
	private writeLocks = new Map<string, Promise<void>>();

	/**
	 * Per-day check cache keyed by file mtime. A toggle re-renders the whole
	 * view; without this, every render re-reads ~67 log files through the
	 * vault API. External (hand) edits bump mtime and invalidate correctly.
	 * Invalidated explicitly after our own writes (same-ms writes can share
	 * an mtime).
	 */
	private dayCache = new Map<string, { mtime: number; checks: Set<string> }>();

	private invalidateDay(dateKey: string): void {
		this.dayCache.delete(dateKey);
	}

	private async withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prev = this.writeLocks.get(key) ?? Promise.resolve();
		let release!: () => void;
		const next = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.writeLocks.set(key, prev.then(() => next));
		await prev;
		try {
			return await fn();
		} finally {
			release();
			if (this.writeLocks.get(key) === next) this.writeLocks.delete(key);
		}
	}

	async ensureReady(): Promise<void> {
		await this.ensureFolder(this.dataFolder);
		await this.ensureFolder(`${this.dataFolder}/${LOG_FOLDER}`);
		const path = normalizePath(`${this.dataFolder}/${HABITS_FILE}`);
		if (!asFile(this.app.vault.getAbstractFileByPath(path))) {
			await this.app.vault.create(path, '# Habits\n');
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(normalizePath(path))) {
			await this.app.vault.createFolder(normalizePath(path));
		}
	}

	private async loadAllSections(): Promise<HabitSection[]> {
		await this.ensureReady();
		const path = normalizePath(`${this.dataFolder}/${HABITS_FILE}`);
		const file = asFile(this.app.vault.getAbstractFileByPath(path));
		if (!file) return [];
		return parseSections(await this.app.vault.read(file));
	}

	/** Active (non-archived) habits, oldest first. */
	async loadHabits(): Promise<Habit[]> {
		return (await this.loadAllSections()).map(habitFromSection).filter((h) => !h.archived);
	}

	async addHabit(title: string, type: HabitType = 'good'): Promise<Habit> {
		const all = await this.loadAllSections();
		const base = slugify(title);
		let id = base;
		let n = 2;
		while (all.some((h) => h.id === id)) {
			id = `${base}-${n++}`;
		}
		const section: HabitSection = {
			id,
			items: [
				{ kind: 'field', key: 'Title', value: title.trim() },
				{ kind: 'field', key: 'Created', value: todayKey() },
				{ kind: 'field', key: 'Schedule', value: 'daily' },
				{ kind: 'field', key: 'Type', value: type },
				{ kind: 'field', key: 'Archived', value: 'false' },
			],
			plan: null,
		};
		all.push(section);
		await this.saveSections(all);
		return habitFromSection(section);
	}

	async archiveHabit(id: string): Promise<void> {
		const all = await this.loadAllSections();
		const section = all.find((h) => h.id === id);
		if (section) {
			setField(section.items, 'Archived', 'true');
			await this.saveSections(all);
		}
	}

	/**
	 * Remove a habit section from Habits.md entirely — including its check
	 * history and "### Plan" data. Irreversible (the registry is a single
	 * file, so there is nothing to trash); generated Knowledge/Plans notes
	 * are left in place and can be deleted separately.
	 */
	async deleteHabit(id: string): Promise<void> {
		const all = await this.loadAllSections();
		const next = all.filter((h) => h.id !== id);
		if (next.length !== all.length) {
			await this.saveSections(next);
		}
	}

	/** Change a habit's good/bad type (missing field = legacy, defaults 'good'). */
	async setHabitType(id: string, type: HabitType): Promise<void> {
		const all = await this.loadAllSections();
		const section = all.find((h) => h.id === id);
		if (section) {
			setField(section.items, 'Type', type);
			await this.saveSections(all);
		}
	}

	/**
	 * Set an arbitrary "- Key: value" field on a habit section (e.g. the
	 * manual knowledge-note links in "Notes"). Round-trip rendering keeps
	 * everything else in the section untouched.
	 */
	async setHabitField(id: string, key: string, value: string): Promise<void> {
		const all = await this.loadAllSections();
		const section = all.find((h) => h.id === id);
		if (section) {
			setField(section.items, key, value);
			await this.saveSections(all);
		}
	}

	/**
	 * Write (or replace) the habit's execution plan. Replaces the structured
	 * fields of the "### Plan" subsection with the given plan; hand-written
	 * content elsewhere in the file is untouched. The subsection is created
	 * when absent.
	 */
	async updatePlan(id: string, plan: HabitPlan): Promise<void> {
		const all = await this.loadAllSections();
		const section = all.find((h) => h.id === id);
		if (!section) return;
		section.plan = planToFields(plan);
		// Anchor for stage badges (Q6): the day the current plan took effect.
		setField(section.items, 'PlanGenerated', todayKey());
		await this.saveSections(all);
	}

	private async saveSections(sections: HabitSection[]): Promise<void> {
		const path = normalizePath(`${this.dataFolder}/${HABITS_FILE}`);
		await this.withWriteLock(path, async () => {
			const file = asFile(this.app.vault.getAbstractFileByPath(path));
			if (!file) return;
			await this.app.vault.modify(file, renderSections(sections));
		});
	}

	private logPath(dateKey: string): string {
		return normalizePath(`${this.dataFolder}/${LOG_FOLDER}/${dateKey}.md`);
	}

	/** Set of habit ids checked on the given day (mtime-cached). */
	async loadDayChecks(dateKey: string): Promise<Set<string>> {
		const path = this.logPath(dateKey);
		const file = asFile(this.app.vault.getAbstractFileByPath(path));
		if (!file) {
			this.invalidateDay(dateKey);
			return new Set();
		}
		const mtime = file.stat?.mtime ?? 0;
		const cached = this.dayCache.get(dateKey);
		if (cached && cached.mtime === mtime) return cached.checks;
		const checks = parseDayChecks(await this.app.vault.read(file));
		this.dayCache.set(dateKey, { mtime, checks });
		return checks;
	}

	/** Checked-id sets for a list of date keys. Reads run in parallel. */
	async loadChecksRange(dateKeys: string[]): Promise<Map<string, Set<string>>> {
		const entries = await Promise.all(dateKeys.map(async (key) => [key, await this.loadDayChecks(key)] as const));
		return new Map(entries);
	}

	async setCheck(dateKey: string, habitId: string, title: string, checked: boolean): Promise<void> {
		await this.ensureFolder(`${this.dataFolder}/${LOG_FOLDER}`);
		const path = this.logPath(dateKey);
		await this.withWriteLock(path, async () => {
			const existing = asFile(this.app.vault.getAbstractFileByPath(path));
			let lines: string[];
			if (existing) {
				lines = (await this.app.vault.read(existing)).split('\n');
			} else {
				lines = [`# ${dateKey}`, ''];
			}
			const idx = lines.findIndex((l) => {
				const m = l.match(/^-\s*\[[ xX]\]\s+(\S+)/);
				return m?.[1] === habitId;
			});
			const line = `- [${checked ? 'x' : ' '}] ${habitId} <!-- ${title} -->`;
			if (idx >= 0) {
				lines[idx] = line;
			} else {
				if (lines[lines.length - 1]?.trim() !== '') lines.push('');
				lines.push(line);
			}
			const text = lines.join('\n');
			if (existing) {
				await this.app.vault.modify(existing, text);
			} else {
				await this.app.vault.create(path, text);
			}
			// Our own write: drop the cache entry (same-ms writes can share
			// an mtime, so mtime comparison alone is not enough here).
			this.invalidateDay(dateKey);
		});
	}
}
