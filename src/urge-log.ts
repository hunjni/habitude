// Urge log for bad habits (CONTEXT.md "Urge log", ADR-0003).
//
// One file per day at "<dataFolder>/Urge/YYYY-MM-DD.md", parallel to Log/.
// Entry line format (6 fields, pipe-separated):
//   - HH:MM | <habitId> | <situation> | <intensity 1-10> | <coping> | <resisted|slip>
//
// The habitId field is the one addition to the format sketched in ADR-0003:
// without it, entries from several bad habits could not be told apart.
// A slip (CONTEXT.md) is ONLY ever an entry with outcome "slip" — an
// unchecked day is never treated as a slip.
//
// Storage is plain markdown; users can hand-edit files and the parser
// tolerates junk lines (they are skipped, not repaired).

import { normalizePath, TFile } from 'obsidian';
import { addDays, todayKey } from './utils/dates';

export const URGE_FOLDER = 'Urge';

export type UrgeOutcome = 'resisted' | 'slip';

export interface UrgeEntry {
	/** Date key (YYYY-MM-DD) the entry was found in (from the filename). */
	date: string;
	/** HH:MM (24h). */
	time: string;
	habitId: string;
	situation: string;
	/** 1-10. */
	intensity: number;
	coping: string;
	outcome: UrgeOutcome;
}

/** Render one entry as a markdown line (without trailing newline). */
export function renderUrgeLine(e: Omit<UrgeEntry, 'date'>): string {
	return `- ${e.time} | ${e.habitId} | ${e.situation} | ${e.intensity} | ${e.coping} | ${e.outcome}`;
}

const LINE_RE =
	/^- (\d{1,2}:\d{2}) \| ([^|]+) \| ([^|]*) \| (\d{1,2}) \| ([^|]*) \| (resisted|slip)\s*$/;

/** Parse one line; returns null for anything that is not a valid entry. */
export function parseUrgeLine(line: string): Omit<UrgeEntry, 'date'> | null {
	const m = line.trim().match(LINE_RE);
	if (!m) return null;
	const intensity = Number(m[4]);
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 10) return null;
	return {
		time: m[1] ?? '',
		habitId: (m[2] ?? '').trim(),
		situation: (m[3] ?? '').trim(),
		intensity,
		coping: (m[5] ?? '').trim(),
		outcome: m[6] === 'slip' ? 'slip' : 'resisted',
	};
}

function urgePath(dataFolder: string, dateKey: string): string {
	return normalizePath(`${dataFolder}/${URGE_FOLDER}/${dateKey}.md`);
}

function asFile(f: unknown): TFile | null {
	return f instanceof TFile ? f : null;
}

/**
 * Read urge entries for the given date keys. Missing days are simply absent
 * from the result; unparseable lines inside a file are skipped.
 */
export async function listUrgeEntries(
	app: import('obsidian').App,
	dataFolder: string,
	dateKeys: string[],
): Promise<Map<string, UrgeEntry[]>> {
	const result = new Map<string, UrgeEntry[]>();
	for (const key of dateKeys) {
		const file = asFile(app.vault.getAbstractFileByPath(urgePath(dataFolder, key)));
		if (!file) continue;
		const entries: UrgeEntry[] = [];
		for (const line of (await app.vault.read(file)).split('\n')) {
			const parsed = parseUrgeLine(line);
			if (parsed) entries.push({ ...parsed, date: key });
		}
		if (entries.length > 0) result.set(key, entries);
	}
	return result;
}

/** Append one entry to the day's urge file (created with a header when absent). */
export async function appendUrgeEntry(
	app: import('obsidian').App,
	dataFolder: string,
	entry: Omit<UrgeEntry, 'date'>,
	dateKey = todayKey(),
): Promise<void> {
	const path = urgePath(dataFolder, dateKey);
	const existing = asFile(app.vault.getAbstractFileByPath(path));
	if (existing) {
		const text = await app.vault.read(existing);
		const lines = text.split('\n');
		if (lines[lines.length - 1]?.trim() !== '') lines.push('');
		lines.push(renderUrgeLine(entry));
		await app.vault.modify(existing, lines.join('\n'));
	} else {
		await app.vault.create(path, `# ${dateKey}\n\n${renderUrgeLine(entry)}\n`);
	}
}

/**
 * Date keys (within the given map) that contain at least one slip entry.
 * With `habitId`, only that habit's entries are considered — the metric
 * "days since last slip" is per habit, never global.
 */
export function slipDateKeys(entriesByDay: Map<string, UrgeEntry[]>, habitId?: string): string[] {
	const out: string[] = [];
	for (const [key, entries] of entriesByDay) {
		if (entries.some((e) => e.outcome === 'slip' && (!habitId || e.habitId === habitId))) {
			out.push(key);
		}
	}
	return out.sort();
}

/** Entries of one habit across the given days, oldest first. */
export function entriesForHabit(entriesByDay: Map<string, UrgeEntry[]>, habitId: string): UrgeEntry[] {
	return [...entriesByDay.values()]
		.flat()
		.filter((e) => e.habitId === habitId)
		.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Default time for a new entry, "HH:MM" 24h. */
export function nowTimeKey(): string {
	const d = new Date();
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Convenience: the last n day keys ending today (oldest first). */
export function lastDayKeys(n: number): string[] {
	const out: string[] = [];
	for (let i = n - 1; i >= 0; i--) out.push(addDays(todayKey(), -i));
	return out;
}
