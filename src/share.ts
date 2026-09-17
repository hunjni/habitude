// Opt-in progress sharing. This module runs ONLY when the user clicks the
// "Share progress" button — nothing here is called on load, on render, or
// on any timer.
//
// What is sent: aggregate statistics only — habit titles, streaks, and
// weekly completion rates. Raw note/journal text, file paths, vault names,
// and habit ids are NEVER included; the payload is built field-by-field
// from a whitelist so nothing else can leak through.
//
// Endpoint: https://habi.sh/api/share (public; no secret is involved).

import { Notice, requestUrl } from 'obsidian';
import type { Habit } from './types';
import { recentKeys, streakFor, weekRateFor } from './stats';
import { addDays, todayKey } from './utils/dates';

export const SHARE_API_URL = 'https://habi.sh/api/share';
export const SHARE_PAYLOAD_VERSION = '1';
/** Keep titles bounded: long titles are truncated, never dropped silently. */
const MAX_TITLE_LEN = 120;
/** Hanging requests must not freeze the UI. */
const SHARE_TIMEOUT_MS = 15000;

export function sharePageUrl(id: string): string {
	return `https://habi.sh/s/${id}`;
}

export interface ShareHabitStat {
	title: string;
	streak: number;
	weekRate: number;
}

export interface SharePayload {
	version: string;
	pluginVersion: string;
	generatedAt: string;
	stats: {
		habits: ShareHabitStat[];
	};
}

/** YYYY-MM-DD keys for the trailing 7 days ending today. */
export function trailingWeekKeys(): string[] {
	const today = todayKey();
	return Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)));
}

/**
 * Aggregate per-habit statistics for sharing. Reads only the check sets;
 * never touches note text.
 */
export function aggregateHabitStats(
	habits: Habit[],
	checksByDay: Map<string, Set<string>>,
): ShareHabitStat[] {
	const weekKeys = trailingWeekKeys();
	return habits.map((h) => ({
		title: sanitizeTitle(h.title),
		streak: sanitizeCount(streakFor(h.id, checksByDay)),
		weekRate: sanitizeRate(weekRateFor(h.id, weekKeys, checksByDay)),
	}));
}

function sanitizeTitle(raw: unknown): string {
	let s: string;
	if (typeof raw === 'string') {
		s = raw;
	} else if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') {
		s = String(raw);
	} else {
		return '';
	}
	return s.trim().slice(0, MAX_TITLE_LEN);
}

function sanitizeCount(raw: unknown): number {
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.floor(n));
}

function sanitizeRate(raw: unknown): number {
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(n)) return 0;
	const clamped = Math.min(1, Math.max(0, n));
	return Math.round(clamped * 1000) / 1000;
}

function sanitizeVersion(raw: unknown): string {
	let s: string;
	if (typeof raw === 'string') {
		s = raw;
	} else if (typeof raw === 'number') {
		s = String(raw);
	} else {
		return 'unknown';
	}
	return s.trim().slice(0, 32) || 'unknown';
}

function sanitizeTimestamp(raw: unknown): string {
	if (typeof raw === 'string') {
		const t = Date.parse(raw);
		if (Number.isFinite(t)) return new Date(t).toISOString();
	}
	return new Date().toISOString();
}

/**
 * Build the share payload. Every field is re-created from the whitelist —
 * even if the input objects carry extra fields (note text, file paths,
 * ids, …), none of them can end up in the output.
 */
export function buildSharePayload(input: {
	habits: Array<{ title: unknown; streak: unknown; weekRate: unknown }>;
	pluginVersion: unknown;
	generatedAt?: unknown;
}): SharePayload {
	return {
		version: SHARE_PAYLOAD_VERSION,
		pluginVersion: sanitizeVersion(input.pluginVersion),
		generatedAt: sanitizeTimestamp(input.generatedAt),
		stats: {
			habits: input.habits.map((h) => ({
				title: sanitizeTitle(h.title),
				streak: sanitizeCount(h.streak),
				weekRate: sanitizeRate(h.weekRate),
			})),
		},
	};
}

/** Share ids are server-minted URL-safe tokens; anything else is rejected. */
export function isValidShareId(id: unknown): id is string {
	return typeof id === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(id);
}

export interface SharePostResult {
	ok: boolean;
	json: () => Promise<unknown>;
}

export interface ShareDeps {
	post?: (url: string, body: string) => Promise<SharePostResult>;
}

export type ShareOutcome = { ok: true; url: string } | { ok: false };

async function defaultPost(url: string, body: string): Promise<SharePostResult> {
	let timer: number | undefined;
	try {
		const res = await Promise.race([
			requestUrl({
				url,
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				throw: false,
			}),
			new Promise<never>((_, reject) => {
				timer = window.setTimeout(() => reject(new Error('share timeout')), SHARE_TIMEOUT_MS);
			}),
		]);
		return {
			ok: res.status >= 200 && res.status < 300,
			json: () => Promise.resolve(res.json as unknown),
		};
	} finally {
		if (timer !== undefined) window.clearTimeout(timer);
	}
}

/**
 * POST the payload to the share endpoint. Never throws: every failure mode
 * (no backend yet, timeout, bad response, invalid id) resolves to
 * `{ ok: false }` and the caller shows the "server getting ready" notice.
 */
export async function shareProgress(
	payload: SharePayload,
	deps: ShareDeps = {},
): Promise<ShareOutcome> {
	const post = deps.post ?? defaultPost;
	try {
		const res = await post(SHARE_API_URL, JSON.stringify(payload));
		if (!res.ok) return { ok: false };
		const data = (await res.json()) as { id?: unknown } | null;
		const id = data !== null && typeof data === 'object' ? data.id : undefined;
		if (!isValidShareId(id)) return { ok: false };
		return { ok: true, url: sharePageUrl(id) };
	} catch {
		return { ok: false };
	}
}

/**
 * UI entry point: build the payload from the store and share it. Loads 60
 * days of checks so streaks are accurate. Shows the Korean "server getting
 * ready" notice on any failure and always resolves.
 */
export async function shareFromStore(
	loadHabits: () => Promise<Habit[]>,
	loadChecksRange: (keys: string[]) => Promise<Map<string, Set<string>>>,
	pluginVersion: string,
	notify: (msg: string) => void = (msg) => new Notice(msg),
	copyText: (text: string) => Promise<void> = (text) => navigator.clipboard.writeText(text),
): Promise<void> {
	try {
		const [habits, checks] = await Promise.all([
			loadHabits(),
			loadChecksRange(recentKeys(60)),
		]);
		const payload = buildSharePayload({
			habits: aggregateHabitStats(habits, checks),
			pluginVersion,
		});
		const outcome = await shareProgress(payload);
		if (!outcome.ok) {
			notify('공유 서버 준비 중');
			return;
		}
		try {
			await copyText(outcome.url);
			notify('Share link copied to clipboard.');
		} catch {
			// Clipboard unavailable (permissions, insecure context): hand the
			// user the link itself so they can copy it manually.
			notify(`Share link: ${outcome.url}`);
		}
	} catch {
		notify('공유 서버 준비 중');
	}
}
