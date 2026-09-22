// AI generation for knowledge cards and execution plans.
//
// Thin layer on top of the coach's multi-provider chatCompletion: prompt
// builders and tolerant JSON parsing are pure functions (unit-tested without
// any network); the generate* helpers only wire them to the user's provider.
//
// Generation is always explicitly triggered and confirmed by the user — the
// confirm dialog lives in the UI layer; this module just does the request.

import { chatCompletion, type LlmProviderId, type RequestFnLike } from './coach/providers';
import type { CoachLanguage } from './coach/prompt';
import type { Habit, HabitPlan, HabitType } from './types';
import { daysSinceLastSlip, streakFor } from './stats';
import { entriesForHabit, slipDateKeys, type UrgeEntry } from './urge-log';

/** One AI-generated knowledge card (JSON shape returned by the model). */
export interface KnowledgeCard {
	title: string;
	content: string;
	category: string;
}

export interface GenerationConfig {
	provider: LlmProviderId;
	apiKey: string;
	baseUrl: string;
	model: string;
	/** Reply language for generated content (from the coach language setting). */
	language: CoachLanguage;
}

// --- Prompt builders (pure, exported for tests) ------------------------------

const LANGUAGE_NOTE: Record<CoachLanguage, string> = {
	auto: '',
	en: '\n\nAlways respond in English.',
	ko: '\n\nAlways respond in Korean (한국어).',
	zh: '\n\nAlways respond in Simplified Chinese (简体中文).',
};

function systemPrompt(language: CoachLanguage): string {
	return `You are a behavioral science expert helping a user build habits.${LANGUAGE_NOTE[language]}`;
}

/** Prompt for the 3 knowledge cards of one habit (categories differ by type). */
export function buildKnowledgePrompt(habitName: string, type: HabitType): string {
	if (type === 'bad') {
		return [
			`The user is trying to break a bad habit: "${habitName}".`,
			'Generate 3 knowledge cards following the CBT (cognitive behavioral therapy) framework:',
			'1. trigger: what situations or emotions typically trigger this habit',
			'2. replacement: alternative behaviors to use when the urge arrives',
			'3. coping: urge-management techniques (e.g. response prevention, behavior substitution)',
			'',
			'Return ONLY a JSON array, no other text:',
			'[{"title": "...", "content": "...", "category": "trigger|replacement|coping"}]',
		].join('\n');
	}
	return [
		`The user is trying to build a good habit: "${habitName}".`,
		'Generate 3 knowledge cards from behavioral science:',
		'1. motivation: why this habit matters (1-2 sentences, with a scientific basis)',
		'2. strategy: how to make execution easier (concrete, actionable technique)',
		'3. maintenance: how to make the habit automatic long-term (environment design or psychology)',
		'',
		'Return ONLY a JSON array, no other text:',
		'[{"title": "...", "content": "...", "category": "motivation|strategy|maintenance"}]',
	].join('\n');
}

/** Prompt for the structured execution plan of one habit. */
export function buildPlanPrompt(habitName: string, type: HabitType): string {
	const kind = type === 'bad' ? 'reduce or break the habit' : 'build the habit';
	return [
		`You are a habit-design expert. The user wants to ${kind}: "${habitName}" (type: ${type}).`,
		'Generate a structured execution plan with:',
		'- microHabit: the smallest executable action (e.g. "read 2 pages", not "read daily")',
		'- triggerCue: time / place / event / emotion trigger',
		'- executionTime and location',
		'- environmentDesign: how to adjust the environment to support this habit',
		'- immediateReward: a reward given right after completion',
		'- phases: adaptation (days 1-7), consolidation (days 8-14), strengthening (days 15-21), each with its focus',
		'',
		'Return ONLY one JSON object, no other text:',
		'{"microHabit": "...", "triggerCue": "...", "executionTime": "...", "location": "...", "environmentDesign": "...", "immediateReward": "...", "phases": [{"name": "...", "days": "1-7", "focus": "..."}, ...]}',
	].join('\n');
}

// --- Tolerant JSON extraction (pure, exported for tests) ---------------------

/**
 * Extract the first JSON value from a model reply. Models wrap JSON in code
 * fences, prepend prose, or append commentary; this strips all of that.
 * Prefers an array (knowledge cards); falls back to an object (plan).
 */
export function extractJson(raw: string): unknown {
	let text = raw.trim();
	// Strip a leading ``` fence (with optional language tag) and trailing ```.
	const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
	if (fence?.[1]) text = fence[1].trim();
	// Find the first array or object span and try to parse it.
	const spans: Array<[number, number]> = [];
	const firstArray = text.indexOf('[');
	const lastArray = text.lastIndexOf(']');
	if (firstArray >= 0 && lastArray > firstArray) spans.push([firstArray, lastArray]);
	const firstObj = text.indexOf('{');
	const lastObj = text.lastIndexOf('}');
	if (firstObj >= 0 && lastObj > firstObj) spans.push([firstObj, lastObj]);
	// Prefer the span that starts earlier (a reply may hold both).
	spans.sort((a, b) => a[0] - b[0]);
	const errors: string[] = [];
	for (const [start, end] of spans) {
		try {
			return JSON.parse(text.slice(start, end + 1)) as unknown;
		} catch (e) {
			errors.push(String(e));
		}
	}
	throw new Error(`No valid JSON found in AI reply${errors.length ? `: ${errors[0]}` : ''}`);
}

function asString(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

/** Validate/coerce a parsed array into knowledge cards (invalid entries dropped). */
export function parseKnowledgeCards(data: unknown): KnowledgeCard[] {
	if (!Array.isArray(data)) throw new Error('Expected a JSON array of knowledge cards');
	const cards: KnowledgeCard[] = [];
	for (const item of data) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const title = asString(o.title);
		const content = asString(o.content);
		const category = asString(o.category).toLowerCase();
		if (title && content) cards.push({ title, content, category });
	}
	if (cards.length === 0) throw new Error('AI reply contained no usable knowledge cards');
	return cards;
}

/** Validate/coerce a parsed object into a HabitPlan. */
export function parsePlan(data: unknown): HabitPlan {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('Expected a JSON object for the execution plan');
	}
	const o = data as Record<string, unknown>;
	const phases: HabitPlan['phases'] = Array.isArray(o.phases)
		? o.phases
				.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
				.map((p) => ({
					name: asString(p.name),
					days: asString(p.days),
					focus: asString(p.focus),
				}))
				.filter((p) => p.name || p.focus)
		: [];
	return {
		microHabit: asString(o.microHabit),
		triggerCue: asString(o.triggerCue),
		executionTime: asString(o.executionTime),
		location: asString(o.location),
		environmentDesign: asString(o.environmentDesign),
		immediateReward: asString(o.immediateReward),
		phases,
	};
}

// --- Generation entry points --------------------------------------------------

async function generate(
	cfg: GenerationConfig,
	prompt: string,
	requestFn?: RequestFnLike,
): Promise<string> {
	return chatCompletion(
		{
			provider: cfg.provider,
			apiKey: cfg.apiKey,
			baseUrl: cfg.baseUrl,
			model: cfg.model,
			systemPrompt: systemPrompt(cfg.language),
			history: [],
			message: prompt,
		},
		requestFn,
	);
}

/** Generate the knowledge cards for one habit. */
export async function generateKnowledgeCards(
	cfg: GenerationConfig,
	habit: Pick<Habit, 'title' | 'type'>,
	requestFn?: RequestFnLike,
): Promise<KnowledgeCard[]> {
	return parseKnowledgeCards(extractJson(await generate(cfg, buildKnowledgePrompt(habit.title, habit.type), requestFn)));
}

/** Generate the structured execution plan for one habit. */
export async function generatePlan(
	cfg: GenerationConfig,
	habit: Pick<Habit, 'title' | 'type'>,
	requestFn?: RequestFnLike,
): Promise<HabitPlan> {
	return parsePlan(extractJson(await generate(cfg, buildPlanPrompt(habit.title, habit.type), requestFn)));
}

// --- AI review & urge analysis (free-text replies, no JSON) ------------------

/**
 * Build the statistics block fed to the review prompt: one line per habit
 * (good: week rate + streak; bad: resisted days, slips, days since last
 * slip, urge count/average intensity) plus the weekday completion spread.
 * Pure — exported for tests.
 */
export function buildReviewDataBlock(
	habits: Habit[],
	weekKeys: string[],
	checksByDay: Map<string, Set<string>>,
	urgeByDay: Map<string, UrgeEntry[]>,
): string {
	const lines: string[] = [];
	for (const habit of habits) {
		const checked = weekKeys.filter((k) => checksByDay.get(k)?.has(habit.id)).length;
		if (habit.type === 'bad') {
			const entries = entriesForHabit(urgeByDay, habit.id);
			const weekEntries = entries.filter((e) => weekKeys.includes(e.date));
			const slips = weekEntries.filter((e) => e.outcome === 'slip').length;
			const avg = entries.length
				? Math.round((entries.reduce((s, e) => s + e.intensity, 0) / entries.length) * 10) / 10
				: 0;
			const since = daysSinceLastSlip(slipDateKeys(urgeByDay, habit.id));
			lines.push(
				`- [bad] ${habit.title} — resisted ${checked}/${weekKeys.length} days this week; ` +
					`slips this week: ${slips}; days since last slip: ${since === null ? 'never' : since}; ` +
					`urge entries (30d): ${entries.length}${entries.length ? `, avg intensity ${avg}/10` : ''}`,
			);
		} else {
			const streak = streakFor(habit.id, checksByDay);
			const rate = weekKeys.length ? Math.round((checked / weekKeys.length) * 100) : 0;
			lines.push(`- [good] ${habit.title} — week ${checked}/${weekKeys.length} (${rate}%), streak ${streak}d`);
		}
	}
	// Weekday completion spread across all habits (the "failure time slots"
	// signal at the granularity the log supports: days, not hours).
	const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const spread = weekKeys
		.map((k) => {
			const d = new Date(`${k}T00:00:00`);
			const total = habits.length || 1;
			const done = habits.filter((h) => checksByDay.get(k)?.has(h.id)).length;
			return `${names[d.getDay()]} ${done}/${total}`;
		})
		.join(', ');
	lines.push(`Weekday completion (all habits): ${spread}`);
	return lines.join('\n');
}

/** Prompt for the weekly/monthly AI review (free text). */
export function buildReviewPrompt(periodLabel: string, dataBlock: string): string {
	return [
		`You are a habit coach. Below are the user's habit statistics for ${periodLabel}.`,
		'',
		dataBlock,
		'',
		'Please give:',
		'1. A brief analysis of the completion-rate trend',
		'2. The weekdays or situations where the user most often fails',
		'3. Concrete, actionable adjustment suggestions for the next step',
		'Keep it under 200 words. Plain text only.',
	].join('\n');
}

/** Prompt for analyzing a bad habit's urge-log entries (free text). */
export function buildUrgeAnalysisPrompt(habitName: string, entriesBlock: string): string {
	return [
		`You are a CBT (cognitive behavioral therapy) expert. Below are the urge-log entries from the last 30 days for the user's bad habit "${habitName}".`,
		'',
		entriesBlock,
		'',
		'Please give:',
		'1. The recurring trigger patterns (time of day, situations, emotions, intensity trend)',
		'2. Recommended replacement behaviors and coping techniques that fit these patterns',
		'Keep it under 200 words. Plain text only.',
	].join('\n');
}

/** Render one habit's urge entries as the analysis data block. Pure. */
export function buildUrgeDataBlock(entries: UrgeEntry[]): string {
	return entries.length
		? entries
				.map(
					(e) =>
						`- ${e.date} ${e.time} | intensity ${e.intensity}/10 | situation: ${e.situation} | coping: ${e.coping} | ${e.outcome}`,
				)
				.join('\n')
		: '(no urge entries recorded)';
}

/** Generate the weekly/monthly review text. */
export async function generateReview(
	cfg: GenerationConfig,
	periodLabel: string,
	dataBlock: string,
	requestFn?: RequestFnLike,
): Promise<string> {
	return generate(cfg, buildReviewPrompt(periodLabel, dataBlock), requestFn);
}

/** Generate the urge-pattern analysis text for one bad habit. */
export async function generateUrgeAnalysis(
	cfg: GenerationConfig,
	habitName: string,
	entriesBlock: string,
	requestFn?: RequestFnLike,
): Promise<string> {
	return generate(cfg, buildUrgeAnalysisPrompt(habitName, entriesBlock), requestFn);
}
