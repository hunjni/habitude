// BYOK Gemini client for the AI coach.
//
// The user brings their own API key (free tier on Google AI Studio). The key
// is stored only in this device's plugin data and is sent ONLY to
// generativelanguage.googleapis.com — never to Habitude servers (there is no
// Habitude backend involved at all).
//
// Non-streaming generateContent for v1: simpler and robust inside Obsidian.
// requestUrl is injectable so unit tests never touch the network.

import { requestUrl } from 'obsidian';

export const DEFAULT_COACH_MODEL = 'gemini-2.5-flash';
const API_HOST = 'https://generativelanguage.googleapis.com';
/** Cap on conversation history sent per request — the view keeps the full local transcript. */
const MAX_HISTORY_BLOCKS = 20;

export interface ChatMessage {
	role: 'user' | 'model';
	text: string;
}

type RequestFn = typeof requestUrl;

export class CoachError extends Error {
	readonly kind: 'auth' | 'quota' | 'network' | 'api';
	constructor(kind: CoachError['kind'], message: string) {
		super(message);
		this.kind = kind;
	}
}

interface GenerateContentResponse {
	candidates?: Array<{
		content?: { parts?: Array<{ text?: string }> };
		finishReason?: string;
	}>;
	error?: { code?: number; message?: string; status?: string };
}

export async function chatCompletion(
	args: {
		apiKey: string;
		model: string;
		systemPrompt: string;
		history: ChatMessage[];
		message: string;
	},
	requestFn: RequestFn = requestUrl,
): Promise<string> {
	const { apiKey, model, systemPrompt, history, message } = args;
	// Sliding window: bound the request size on long conversations.
	const recent = history.slice(-MAX_HISTORY_BLOCKS);
	const contents = [
		...recent.map((m) => ({
			role: m.role,
			parts: [{ text: m.text }],
		})),
		{ role: 'user', parts: [{ text: message }] },
	];

	let raw: string;
	try {
		const res = await requestFn({
			url: `${API_HOST}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': apiKey,
			},
			body: JSON.stringify({
				system_instruction: { parts: [{ text: systemPrompt }] },
				contents,
				generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
			}),
		});
		raw = res.text;
	} catch (e) {
		// Obsidian's requestUrl REJECTS on HTTP 4xx/5xx with the status on the
		// error — classify those instead of blaming the connection.
		const status =
			typeof (e as { status?: unknown } | null | undefined)?.status === 'number'
				? (e as { status: number }).status
				: 0;
		if (status === 400 || status === 401 || status === 403) {
			throw new CoachError(
				'auth',
				'That API key was rejected or lacks access. Double-check it in Settings → Habitude checklist.',
			);
		}
		if (status === 429) {
			throw new CoachError('quota', 'Rate limit hit (free tier). Wait a minute and try again.');
		}
		if (status >= 400) {
			throw new CoachError('api', `Google AI returned an error (status ${status}). Please try again.`);
		}
		throw new CoachError('network', `Could not reach Google AI. Check your connection. (${String(e)})`);
	}

	let data: GenerateContentResponse;
	try {
		data = JSON.parse(raw) as GenerateContentResponse;
	} catch {
		throw new CoachError('api', 'Got an unreadable response from the model. Please try again.');
	}

	if (data.error) {
		const code = data.error.code ?? 0;
		const msg = data.error.message ?? 'Unknown error';
		if (code === 400 && /api key/i.test(msg)) {
			throw new CoachError('auth', 'That API key was rejected. Double-check it in Settings → Habitude checklist.');
		}
		if (code === 401 || code === 403) {
			throw new CoachError('auth', 'The API key is invalid or lacks access. Check it in Settings → Habitude checklist.');
		}
		if (code === 429) {
			throw new CoachError('quota', 'Rate limit hit (free tier). Wait a minute and try again.');
		}
		throw new CoachError('api', `Model error: ${msg}`);
	}

	const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
	if (!text.trim()) {
		throw new CoachError('api', 'The model returned an empty reply. Please try again.');
	}
	return text.trim();
}
