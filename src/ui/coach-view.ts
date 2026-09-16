// AI Coach chat view — BYOK (bring your own Gemini key), free tier.
//
// The chat runs entirely between this device and Google AI. Your API key is
// stored only in this vault's plugin data and is never sent to Habitude
// servers. What makes this different from chatting with a raw model is the
// curation: every message carries your live habit stats (twin-lite) plus the
// Habitude coaching persona.

import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type HabitudePlugin from '../main';
import { buildTwinLiteContext } from '../coach/context';
import { DEFAULT_COACH_MODEL, chatCompletion, CoachError, type ChatMessage } from '../coach/gemini';
import { buildGreeting, buildSystemPrompt } from '../coach/prompt';

export const COACH_VIEW_TYPE = 'habitude-coach-view';

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

export class CoachView extends ItemView {
	private plugin: HabitudePlugin;
	private messages: ChatMessage[] = [];
	private sending = false;
	private greeted = false;

	constructor(leaf: WorkspaceLeaf, plugin: HabitudePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return COACH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Habitude AI coach';
	}

	getIcon(): string {
		return 'sparkles';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('habitude-coach');
		if (!this.plugin.settings.geminiApiKey) {
			this.renderSetup(container);
		} else {
			await this.renderChat(container);
		}
	}

	// -- Setup (no key yet) -------------------------------------------------

	private renderSetup(container: HTMLElement): void {
		const wrap = container.createDiv({ cls: 'habitude-coach-setup' });
		wrap.createEl('h3', { text: 'AI coach — free with your own key' });
		wrap.createEl('p', {
			text: 'Bring a free Gemini API key and chat with a coach that knows your habits — your streaks, weekly rates, and weak days are shared with the model automatically as statistics.',
		});
		const steps = wrap.createEl('ol');
		const li1 = steps.createEl('li');
		li1.appendText('Get a free key at ');
		const link = li1.createEl('a', { text: 'Google AI Studio', href: AI_STUDIO_URL });
		link.setAttr('target', '_blank');
		li1.appendText('.');
		steps.createEl('li', { text: 'Paste it below. It stays on this device — it is only ever sent to Google, never to Habitude.' });

		const input = wrap.createEl('input', {
			attr: { type: 'password', placeholder: 'Paste Gemini API key' },
			cls: 'habitude-coach-key',
		});
		const row = wrap.createDiv({ cls: 'habitude-coach-row' });
		const save = row.createEl('button', { text: 'Save key & start', cls: 'mod-cta' });
		save.addEventListener('click', () => {
			const key = input.value.trim();
			if (!key) {
				new Notice('Paste your Gemini API key first.');
				return;
			}
			this.plugin.settings.geminiApiKey = key;
			void this.plugin.saveSettings().then(() => this.render());
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') save.click();
		});
	}

	// -- Chat ---------------------------------------------------------------

	private async renderChat(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: 'habitude-coach-header' });
		header.createEl('strong', { text: 'AI Coach' });
		const newChat = header.createEl('button', { text: 'New chat' });
		newChat.addEventListener('click', () => {
			this.messages = [];
			this.greeted = false;
			void this.render();
		});

		const log = container.createDiv({ cls: 'habitude-coach-log' });

		if (!this.greeted) {
			// Record the greeting in the message history so it survives re-renders
			// (e.g. a settings change re-rendering this view) and is included as
			// prior assistant context in later model calls.
			try {
				const ctx = await this.context();
				const greeting = buildGreeting(ctx);
				this.messages.push({ role: 'model', text: greeting });
				this.pushMessage(log, 'model', greeting);
			} catch {
				const fallback = "Hi, I'm your Habitude Coach. What's on your mind?";
				this.messages.push({ role: 'model', text: fallback });
				this.pushMessage(log, 'model', fallback);
			}
			this.greeted = true;
		} else {
			for (const m of this.messages) this.pushMessage(log, m.role, m.text);
		}

		const composer = container.createDiv({ cls: 'habitude-coach-composer' });
		const input = composer.createEl('textarea', {
			attr: { rows: '2', placeholder: 'Ask your coach…' },
			cls: 'habitude-coach-input',
		});
		const send = composer.createEl('button', { text: 'Send', cls: 'mod-cta' });

		const doSend = () => void this.send(log, input, send);
		send.addEventListener('click', doSend);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				doSend();
			}
		});

		const foot = container.createDiv({ cls: 'habitude-coach-foot' });
		foot.createEl('small', {
			text: 'Your key and chats stay on this device. Requests go directly to Google AI.',
		});
		const clear = foot.createEl('a', { text: 'Remove key', href: '#' });
		clear.addEventListener('click', (e) => {
			e.preventDefault();
			this.plugin.settings.geminiApiKey = '';
			this.messages = [];
			this.greeted = false;
			void this.plugin.saveSettings().then(() => this.render());
		});
	}

	private async context() {
		return buildTwinLiteContext(this.plugin.getStore(), this.plugin.settings.weekStart);
	}

	private pushMessage(log: HTMLElement, role: 'user' | 'model', text: string): void {
		const bubble = log.createDiv({ cls: `habitude-coach-msg habitude-coach-${role}` });
		void MarkdownRenderer.render(this.app, text, bubble, '', this);
		log.scrollTop = log.scrollHeight;
	}

	private async send(log: HTMLElement, input: HTMLTextAreaElement, sendBtn: HTMLButtonElement): Promise<void> {
		const text = input.value.trim();
		if (!text || this.sending) return;
		const key = this.plugin.settings.geminiApiKey;
		if (!key) {
			new Notice('Add your Gemini API key first.');
			return;
		}
		this.sending = true;
		sendBtn.disabled = true;
		input.value = '';
		this.pushMessage(log, 'user', text);
		const typing = log.createDiv({ cls: 'habitude-coach-msg habitude-coach-model habitude-coach-typing' });
		typing.setText('Coach is thinking…');
		log.scrollTop = log.scrollHeight;

		try {
			const ctx = await this.context();
			const systemPrompt = buildSystemPrompt(ctx, this.plugin.settings.coachLanguage);
			const reply = await chatCompletion({
				apiKey: key,
				model: this.plugin.settings.coachModel || DEFAULT_COACH_MODEL,
				systemPrompt,
				history: this.messages,
				message: text,
			});
			typing.remove();
			this.messages.push({ role: 'user', text });
			this.messages.push({ role: 'model', text: reply });
			this.pushMessage(log, 'model', reply);
		} catch (e) {
			typing.remove();
			const msg = e instanceof CoachError ? e.message : 'Something went wrong. Please try again.';
			const err = log.createDiv({ cls: 'habitude-coach-msg habitude-coach-error' });
			err.setText(msg);
			log.scrollTop = log.scrollHeight;
		} finally {
			this.sending = false;
			sendBtn.disabled = false;
			input.focus();
		}
	}
}
