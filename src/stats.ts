// Streak and completion statistics computed from daily check sets.

import { addDays, todayKey } from './utils/dates';
import type { HabitPhase, HabitPlan, HabitType } from './types';

/**
 * Consecutive checked days ending today. If today is not checked yet,
 * the streak counts back from yesterday (a habit done daily until yesterday
 * is still "alive").
 */
export function streakFor(habitId: string, checksByDay: Map<string, Set<string>>): number {
	let cursor = todayKey();
	if (!checksByDay.get(cursor)?.has(habitId)) {
		cursor = addDays(cursor, -1);
	}
	let streak = 0;
	while (checksByDay.get(cursor)?.has(habitId)) {
		streak++;
		cursor = addDays(cursor, -1);
		// bound the scan: a streak can never exceed the days we loaded
		if (streak > 370) break;
	}
	return streak;
}

/** Fraction of the given week days checked (0..1). */
export function weekRateFor(habitId: string, weekKeys: string[], checksByDay: Map<string, Set<string>>): number {
	if (weekKeys.length === 0) return 0;
	let n = 0;
	for (const key of weekKeys) {
		if (checksByDay.get(key)?.has(habitId)) n++;
	}
	return n / weekKeys.length;
}

/** Keys for the 60 days ending today (used for streak scans). */
export function recentKeys(days = 60): string[] {
	const keys: string[] = [];
	for (let i = 0; i < days; i++) {
		keys.push(addDays(todayKey(), -i));
	}
	return keys;
}

/**
 * Days elapsed since the last slip date (bad-habit metric, ADR-0003).
 * Returns null when the habit has never slipped — "no data", not 0.
 * A slip today yields 0. slipDates are YYYY-MM-DD keys, any order.
 */
export function daysSinceLastSlip(slipDates: string[], from = todayKey()): number | null {
	let latest: string | null = null;
	for (const d of slipDates) {
		if (latest === null || d > latest) latest = d;
	}
	if (latest === null) return null;
	// Calendar-day difference via a forward scan is overkill; compute from
	// the day the other way: walk back from `from` until we hit `latest`,
	// bounded so a corrupt far-past date cannot loop forever.
	let cursor = from;
	for (let i = 0; i < 3700; i++) {
		if (cursor === latest) return i;
		if (cursor < latest) return null; // slip date in the future: treat as no data
		cursor = addDays(cursor, -1);
	}
	return null;
}

// --- Plan stage tracking (Q6: badge + stage-linked knowledge push) ----------

const PLAN_TOTAL_DAYS = 21;

export interface CurrentPhase {
	phase: HabitPhase;
	/** 1-based day within the 21-day plan timeline. */
	day: number;
}

/**
 * Which plan phase "today" falls into, given the plan's generation date.
 * Returns null when there is no anchored plan, the plan has no phases, or
 * the timeline is over (> 21 days) — the badge then disappears (Q6).
 * Phase ranges come from the "days" strings ("1-7"); when a range is not
 * parsable the 21 days are distributed evenly across phases as a fallback.
 */
export function currentPhase(plan: HabitPlan, planGenerated: string | undefined, from = todayKey()): CurrentPhase | null {
	if (!planGenerated || plan.phases.length === 0) return null;
	const ms = Date.parse(from) - Date.parse(planGenerated);
	if (Number.isNaN(ms)) return null;
	const day = Math.floor(ms / 86_400_000) + 1;
	if (day < 1 || day > PLAN_TOTAL_DAYS) return null;

	const ranges = plan.phases.map((p) => {
		const m = p.days.match(/(\d+)\s*-\s*(\d+)/);
		return m ? [Number(m[1]), Number(m[2])] : null;
	});
	if (ranges.every((r) => r !== null)) {
		for (let i = 0; i < plan.phases.length; i++) {
			const r = ranges[i] as [number, number];
			if (day >= r[0] && day <= r[1]) return { phase: plan.phases[i] as HabitPhase, day };
		}
		return null; // day outside every declared range
	}
	// Fallback: even thirds (3 phases) or a plain even split.
	const per = Math.ceil(PLAN_TOTAL_DAYS / plan.phases.length);
	const idx = Math.min(plan.phases.length - 1, Math.floor((day - 1) / per));
	return { phase: plan.phases[idx] as HabitPhase, day };
}

/**
 * Knowledge-card category to prioritize for the current stage (target D):
 * adaptation pushes strategy (good) / trigger awareness (bad), consolidation
 * pushes maintenance / replacement, reinforcement pushes motivation / coping.
 */
export function stageCategory(type: HabitType, day: number): string {
	const idx = day <= 7 ? 0 : day <= 14 ? 1 : 2;
	return type === 'bad' ? ['trigger', 'replacement', 'coping'][idx] ?? '' : ['strategy', 'maintenance', 'motivation'][idx] ?? '';
}
