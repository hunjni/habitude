// Core domain types for the Habitude Checklist plugin.
// Pure local checklist: habits + daily checks in Markdown. No network, no account.

export interface Habit {
	/** URL-safe unique id, also used as the section heading in Habits.md */
	id: string;
	title: string;
	/** YYYY-MM-DD */
	created: string;
	/** 'daily' for now; weekly/custom schedules are a later stage */
	schedule: 'daily';
	archived: boolean;
}

export interface HabitStats {
	habitId: string;
	/** consecutive checked days ending today (or yesterday if today is unchecked) */
	streak: number;
	/** checks in the given week / 7 */
	weekChecks: number;
	weekRate: number;
}

/** The funnel bridge: a plain external link. Never an API client. */
export const COACHING_URL = 'https://habitude.ai';

export interface PluginSettings {
	/** vault-relative folder that holds Habits.md and Log/ */
	dataFolder: string;
	/** 0 = Sunday, 1 = Monday */
	weekStart: 0 | 1;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	dataFolder: 'Habitude',
	weekStart: 1,
};
