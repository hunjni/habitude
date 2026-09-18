// Core domain types for the Habitude Checklist plugin.
// Local-first: habits + daily checks in Markdown. The optional AI coach is
// BYOK — the user's own API key for any of the supported LLM providers,
// stored on-device, calling the provider directly. No Habitude backend, no
// account, no sync.

import { DEFAULT_COACH_MODEL, type LlmProviderId } from './coach/providers';
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
	/** AI coach provider (gemini, openai, anthropic, openrouter, ollama, lmstudio, custom) */
	llmProvider: LlmProviderId;
	/** BYOK key for the AI coach. Empty = coach disabled (or local provider without a key). Stored on-device only. */
	llmApiKey: string;
	/** model id used for coaching; empty = provider default */
	llmModel: string;
	/** base URL override; empty = provider default */
	llmBaseUrl: string;
	/** @deprecated migrated to llmApiKey (provider=gemini). Kept so existing users keep their key. */
	geminiApiKey: string;
	/** @deprecated migrated to llmModel. Kept so existing users keep their model. */
	coachModel: string;
	/** reply language for the coach */
	coachLanguage: CoachLanguage;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	dataFolder: 'Habitude',
	weekStart: 1,
	llmProvider: 'gemini',
	llmApiKey: '',
	llmModel: '',
	llmBaseUrl: '',
	geminiApiKey: '',
	coachModel: DEFAULT_COACH_MODEL,
	coachLanguage: 'auto',
};
