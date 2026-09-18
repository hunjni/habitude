// AI Coach chat view — BYOK (bring your own key): Gemini, OpenAI, Claude,
// OpenRouter, or a local model via Ollama / LM Studio.
//
// The chat runs entirely between this device and the selected provider. Your
// API key is stored only in this vault's plugin data and is never sent to
// Habitude servers. What makes this different from chatting with a raw model
// is the curation: every message carries your live habit stats (twin-lite)
// plus the Habitude coaching persona.

import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { t } from '../i18n';
import type HabitudePlugin from '../main';
import { buildTwinLiteContext } from '../coach/context';
import {
	chatCompletion,
	CoachError,
	getProvider,
	LLM_PROVIDER_IDS,
	type ChatMessage,
	type LlmProviderId,
} from '../coach/providers';
import { buildGreeting, buildSystemPrompt } from '../coach/prompt';

export const COACH_VIEW_TYPE = 'habitude-coach-view';

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
		return t('view.coach.title');
	}

	getIcon(): string {
		return 'sparkles';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	private providerLabel(): string {
		return t(`settings.provider.${this.plugin.settings.llmProvider}`);
	}

	private hasCredentials(): boolean {
		const def = getProvider(this.plugin.settings.llmProvider);
		return def.needsKey ? !!this.plugin.settings.llmApiKey.trim() : true;
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('habitude-coach');
		if (!this.hasCredentials()) {
			this.renderSetup(container);
		} else {
			await this.renderChat(container);
		}
	}

	// -- Setup (no key yet, or provider without a key) -----------------------

	private renderSetup(container: HTMLElement): void {
		const def = getProvider(this.plugin.settings.llmProvider);
		const wrap = container.createDiv({ cls: 'habitude-coach-setup' });
		wrap.createEl('h3', { text: t('coach.setupTitle') });
		wrap.createEl('p', { text: t('coach.setupDesc') });

		wrap.createEl('label', { cls: 'habitude-coach-field', text: t('settings.provider.name') });
		const select = wrap.createEl('select', { cls: 'habitude-coach-provider' });
		for (const id of LLM_PROVIDER_IDS) {
			const opt = select.createEl('option', { text: t(`settings.provider.${id}`), value: id });
			if (id === this.plugin.settings.llmProvider) opt.selected = true;
		}
		select.addEventListener('change', () => {
			const v = select.value;
			this.plugin.settings.llmProvider = (LLM_PROVIDER_IDS as string[]).includes(v)
				? (v as LlmProviderId)
				: 'gemini';
			void this.plugin.saveSettings().then(() => this.render());
		});

		let keyInput: HTMLInputElement | null = null;
		if (def.needsKey) {
			if (def.keyUrl) {
				const p = wrap.createEl('p');
				const link = p.createEl('a', { text: t('coach.getKeyLink'), href: def.keyUrl });
				link.setAttr('target', '_blank');
			}
			keyInput = wrap.createEl('input', {
				attr: { type: 'password', placeholder: t('coach.keyPlaceholder') },
				cls: 'habitude-coach-key',
			});
		} else {
			wrap.createEl('p', { text: t('coach.noKeyNeeded') });
		}

		wrap.createEl('label', { cls: 'habitude-coach-field', text: t('settings.baseUrl.name') });
		const baseInput = wrap.createEl('input', {
			attr: { type: 'text', placeholder: def.defaultBaseUrl || 'https://…' },
			cls: 'habitude-coach-key',
		});
		baseInput.value = this.plugin.settings.llmBaseUrl;

		const row = wrap.createDiv({ cls: 'habitude-coach-row' });
		const save = row.createEl('button', { text: t('coach.saveKey'), cls: 'mod-cta' });
		save.addEventListener('click', () => {
			const key = keyInput ? keyInput.value.trim() : '';
			if (def.needsKey && !key && !this.plugin.settings.llmApiKey) {
				new Notice(t('coach.pasteKeyFirst'));
				return;
			}
			if (def.needsKey && key) {
				this.plugin.settings.llmApiKey = key;
			}
			this.plugin.settings.llmBaseUrl = baseInput.value.trim();
			void this.plugin.saveSettings().then(() => this.render());
		});
		const enterSaves = (e: KeyboardEvent) => {
			if (e.key === 'Enter') save.click();
		};
		if (keyInput) keyInput.addEventListener('keydown', enterSaves);
		baseInput.addEventListener('keydown', enterSaves);
	}

	// -- Chat ---------------------------------------------------------------

	private async renderChat(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: 'habitude-coach-header' });
		header.createEl('strong', { text: t('coach.headerTitle') });
		const newChat = header.createEl('button', { text: t('coach.newChat') });
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
				const fallback = t('coach.fallbackGreeting');
				this.messages.push({ role: 'model', text: fallback });
				this.pushMessage(log, 'model', fallback);
			}
			this.greeted = true;
		} else {
			for (const m of this.messages) this.pushMessage(log, m.role, m.text);
		}

		const composer = container.createDiv({ cls: 'habitude-coach-composer' });
		const input = composer.createEl('textarea', {
			attr: { rows: '2', placeholder: t('coach.inputPlaceholder') },
			cls: 'habitude-coach-input',
		});
		const send = composer.createEl('button', { text: t('coach.send'), cls: 'mod-cta' });

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
			text: t('coach.footnote', { provider: this.providerLabel() }),
		});
		const clear = foot.createEl('a', { text: t('coach.removeKey'), href: '#' });
		clear.addEventListener('click', (e) => {
			e.preventDefault();
			this.plugin.settings.llmApiKey = '';
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
		if (!this.hasCredentials()) {
			new Notice(t('coach.addKeyFirst'));
			return;
		}
		this.sending = true;
		sendBtn.disabled = true;
		input.value = '';
		this.pushMessage(log, 'user', text);
		const typing = log.createDiv({ cls: 'habitude-coach-msg habitude-coach-model habitude-coach-typing' });
		typing.setText(t('coach.thinking'));
		log.scrollTop = log.scrollHeight;

		try {
			const ctx = await this.context();
			const systemPrompt = buildSystemPrompt(ctx, this.plugin.settings.coachLanguage);
			const reply = await chatCompletion({
				provider: this.plugin.settings.llmProvider,
				apiKey: this.plugin.settings.llmApiKey,
				baseUrl: this.plugin.settings.llmBaseUrl,
				model: this.plugin.settings.llmModel,
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
			const msg = e instanceof CoachError ? e.message : t('coach.genericError');
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
