// Markdown-native storage for the Habitude Checklist plugin.
//
// Layout inside the vault (under settings.dataFolder, default "Habitude"):
//   Habits.md            — habit registry, one "## <id>" section per habit
//   Log/YYYY-MM-DD.md    — daily log with "- [x] <id> <!-- Title -->" checkboxes
//
// Both files are plain markdown: users can read and edit them by hand and the
// plugin will pick the changes up on the next render.

import { App, TFile, normalizePath } from 'obsidian';
import type { Habit } from './types';
import { slugify, todayKey } from './utils/dates';

const HABITS_FILE = 'Habits.md';
const LOG_FOLDER = 'Log';

function asFile(f: unknown): TFile | null {
	return f instanceof TFile ? f : null;
}

/** Parse the Habits.md registry into Habit objects. */
function parseHabits(text: string): Habit[] {
	const habits: Habit[] = [];
	const sections = text.split(/^## /m);
	// sections[0] is the "# Habits" header preface, not a habit section.
	for (const section of sections.slice(1)) {
		const lines = section.split('\n');
		const id = lines[0]?.trim();
		// Skip the header preface and any malformed sections (ids are slugs, never headings).
		if (!id || id.startsWith('#')) continue;
		const get = (key: string): string => {
			const line = lines.find((l) => l.trim().startsWith(`- ${key}:`));
			return line ? line.split(':').slice(1).join(':').trim() : '';
		};
		habits.push({
			id,
			title: get('Title') || id,
			created: get('Created') || todayKey(),
			schedule: 'daily',
			archived: get('Archived').toLowerCase() === 'true',
		});
	}
	return habits;
}

function renderHabits(habits: Habit[]): string {
	const out = ['# Habits', ''];
	for (const h of habits) {
		out.push(
			`## ${h.id}`,
			`- Title: ${h.title}`,
			`- Created: ${h.created}`,
			`- Schedule: daily`,
			`- Archived: ${h.archived}`,
			'',
		);
	}
	return out.join('\n');
}

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

	private async loadAllHabitsRaw(): Promise<Habit[]> {
		await this.ensureReady();
		const path = normalizePath(`${this.dataFolder}/${HABITS_FILE}`);
		const file = asFile(this.app.vault.getAbstractFileByPath(path));
		if (!file) return [];
		return parseHabits(await this.app.vault.read(file));
	}

	/** Active (non-archived) habits, oldest first. */
	async loadHabits(): Promise<Habit[]> {
		return (await this.loadAllHabitsRaw()).filter((h) => !h.archived);
	}

	async addHabit(title: string): Promise<Habit> {
		const all = await this.loadAllHabitsRaw();
		const base = slugify(title);
		let id = base;
		let n = 2;
		while (all.some((h) => h.id === id)) {
			id = `${base}-${n++}`;
		}
		const habit: Habit = {
			id,
			title: title.trim(),
			created: todayKey(),
			schedule: 'daily',
			archived: false,
		};
		all.push(habit);
		await this.saveAllHabits(all);
		return habit;
	}

	async archiveHabit(id: string): Promise<void> {
		const all = await this.loadAllHabitsRaw();
		const habit = all.find((h) => h.id === id);
		if (habit) {
			habit.archived = true;
			await this.saveAllHabits(all);
		}
	}

	private async saveAllHabits(habits: Habit[]): Promise<void> {
		const path = normalizePath(`${this.dataFolder}/${HABITS_FILE}`);
		await this.withWriteLock(path, async () => {
			const file = asFile(this.app.vault.getAbstractFileByPath(path));
			if (!file) return;
			await this.app.vault.modify(file, renderHabits(habits));
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
