// Twin-lite context assembler for the AI coach.
//
// Builds a compact, statistics-only block about the user's habits and recent
// history. The LLM never receives raw note text — only derived stats, the
// same boundary the Habitude backend enforces (stats block, not source).

import type { Habit } from '../types';
import { recentKeys, streakFor } from '../stats';
import { addDays, startOfWeek, todayKey } from '../utils/dates';

/** One habit's summarized state for the coach. */
export interface HabitSummary {
	title: string;
	streak: number;
	/** checks in the current week / 7 */
	weekChecks: number;
	weekRate: number;
	/** checks in the last 30 days / 30 */
	monthRate: number;
	checkedToday: boolean;
}

export interface TwinLiteContext {
	habitCount: number;
	habits: HabitSummary[];
	/** completion rate per weekday (0=Sun..6=Sat) over the last 60 days */
	weekdayPattern: number[];
	/** total checks in the last 7 days */
	checksLast7Days: number;
	today: string;
}

/**
 * Assemble the twin-lite context from the store.
 * Pure data work — the only Obsidian touch is via the store interface.
 */
export async function buildTwinLiteContext(
	store: {
		loadHabits(): Promise<Habit[]>;
		loadChecksRange(keys: string[]): Promise<Map<string, Set<string>>>;
		loadDayChecks(key: string): Promise<Set<string>>;
	},
	weekStart: 0 | 1,
): Promise<TwinLiteContext> {
	const habits = await store.loadHabits();
	const today = todayKey();
	const keys60 = recentKeys(60);
	const checksByDay = await store.loadChecksRange(keys60);
	const todayChecks = await store.loadDayChecks(today);

	const weekStartKey = startOfWeek(today, weekStart);
	const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
	const monthKeys = recentKeys(30);

	const summaries: HabitSummary[] = habits.map((h) => {
		const weekChecks = weekKeys.filter((k) => checksByDay.get(k)?.has(h.id)).length;
		const monthChecks = monthKeys.filter((k) => checksByDay.get(k)?.has(h.id)).length;
		return {
			title: h.title,
			streak: streakFor(h.id, checksByDay),
			weekChecks,
			weekRate: weekKeys.length ? weekChecks / weekKeys.length : 0,
			monthRate: monthKeys.length ? monthChecks / monthKeys.length : 0,
			checkedToday: todayChecks.has(h.id),
		};
	});

	// Weekday pattern: for each weekday, fraction of (habit, day) pairs checked.
	const weekdayPattern = Array.from({ length: 7 }, (_, wd) => {
		const days = keys60.filter((k) => new Date(`${k}T12:00:00`).getDay() === wd);
		if (days.length === 0 || habits.length === 0) return 0;
		let hits = 0;
		for (const k of days) {
			const set = checksByDay.get(k);
			if (!set) continue;
			for (const h of habits) if (set.has(h.id)) hits++;
		}
		return hits / (days.length * habits.length);
	});

	let checksLast7Days = 0;
	for (const k of recentKeys(7)) checksLast7Days += checksByDay.get(k)?.size ?? 0;

	return {
		habitCount: habits.length,
		habits: summaries,
		weekdayPattern,
		checksLast7Days,
		today,
	};
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/**
 * Per-habit line cap for the prompt block: beyond this, habits are summarized
 * in one aggregate line so the system prompt doesn't bloat with habit count.
 */
const MAX_HABIT_LINES = 25;

function pct(x: number): string {
	return `${Math.round(x * 100)}%`;
}

/** Render the context as a compact text block for the system prompt. */
export function renderContextBlock(ctx: TwinLiteContext): string {
	const lines: string[] = [];
	lines.push(`Today is ${ctx.today}. The user tracks ${ctx.habitCount} habit(s).`);
	lines.push(`Total check-ins in the last 7 days: ${ctx.checksLast7Days}.`);
	if (ctx.habits.length > 0) {
		lines.push('Habits:');
		// Most recently active first; cap lines and aggregate the long tail.
		const ranked = [...ctx.habits].sort(
			(a, b) => b.weekChecks - a.weekChecks || b.streak - a.streak,
		);
		const shown = ranked.slice(0, MAX_HABIT_LINES);
		for (const h of shown) {
			lines.push(
				`- "${h.title}": streak ${h.streak}d, this week ${h.weekChecks}/7 (${pct(h.weekRate)}), ` +
					`last 30d ${pct(h.monthRate)}, today ${h.checkedToday ? 'done' : 'not done'}`,
			);
		}
		if (ranked.length > shown.length) {
			const rest = ranked.slice(shown.length);
			const avg = rest.reduce((s, h) => s + h.monthRate, 0) / rest.length;
			lines.push(`…and ${rest.length} more habit(s), averaging ${pct(avg)} over the last 30d.`);
		}
		const pattern = ctx.weekdayPattern.map((r, i) => `${WEEKDAYS[i]} ${pct(r)}`).join(', ');
		lines.push(`Completion by weekday (last 60d): ${pattern}.`);
	}
	return lines.join('\n');
}
