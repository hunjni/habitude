// Core domain types for the Habitude Checklist plugin.
// Local-first: habits + daily checks in Markdown. The optional AI coach is
// BYOK — the user's own API key for any of the supported LLM providers,
// stored on-device, calling the provider directly. No Habitude backend, no
// account, no sync.

import type { LlmProviderId } from './coach/providers';
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
	/** color of the ✓ check mark in the checklist grid ('#rrggbb'); user-configurable */
	checkmarkColor: string;
	/** AI coach provider (gemini, openai, anthropic, openrouter, ollama, lmstudio, custom) */
	llmProvider: LlmProviderId;
	/** BYOK key for the AI coach. Empty = coach disabled (or local provider without a key). Stored on-device only. */
	llmApiKey: string;
	/** model id used for coaching; empty = provider default */
	llmModel: string;
	/** base URL override; empty = provider default */
	llmBaseUrl: string;
	/** reply language for the coach */
	coachLanguage: CoachLanguage;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	dataFolder: 'Habitude',
	weekStart: 1,
	checkmarkColor: '#ffffff',
	llmProvider: 'gemini',
	llmApiKey: '',
	llmModel: '',
	llmBaseUrl: '',
	coachLanguage: 'auto',
};

/**
 * Normalize a user-supplied checkmark color to a valid '#rrggbb' string.
 * Anything invalid (including values from older data or hand-edited
 * configs) falls back to the white default so the check mark never renders
 * with a broken color.
 */
export function normalizeCheckmarkColor(value: unknown): string {
	const s = typeof value === 'string' ? value.trim() : '';
	return /^#[0-9a-fA-F]{6}$/.test(s) ? s : DEFAULT_SETTINGS.checkmarkColor;
}
