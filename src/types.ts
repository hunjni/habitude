// Core domain types for the Habitude Checklist plugin.
// Local-first: habits + daily checks in Markdown. The optional AI coach is
// BYOK — the user's own Gemini key, stored on-device, calling Google
// directly. No Habitude backend, no account, no sync.

import { DEFAULT_COACH_MODEL } from './coach/gemini';
import type { CoachLanguage } from './coach/prompt';

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
	/** BYOK Gemini key for the AI coach. Empty = coach disabled. Stored on-device only. */
	geminiApiKey: string;
	/** model id used for coaching */
	coachModel: string;
	/** reply language for the coach */
	coachLanguage: CoachLanguage;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	dataFolder: 'Habitude',
	weekStart: 1,
	geminiApiKey: '',
	coachModel: DEFAULT_COACH_MODEL,
	coachLanguage: 'auto',
};
