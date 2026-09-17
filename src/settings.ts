// Settings: interface, defaults, and the settings tab UI.
// Local-first: checklist settings plus optional BYOK Gemini key for the AI
// coach. The key is stored only in this device's plugin data and is sent
// only to Google AI — never to Habitude servers.

import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type HabitudePlugin from './main';
import { DEFAULT_SETTINGS, type PluginSettings } from './types';

export type { PluginSettings };
export { DEFAULT_SETTINGS };

export class HabitudeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: HabitudePlugin) {
		super(app, plugin);
	}

	/**
	 * Declarative settings for Obsidian 1.13.0+: makes the settings appear in
	 * the native settings search. On 1.13+, display() is bypassed and only
	 * this runs; display() below remains as the fallback for older versions
	 * (minAppVersion is still 1.7.2).
	 *
	 * NOTE: the declarative SettingControl union has NO password/secret
	 * variant, so a plain `control: { type: 'text' }` would render the API key
	 * in clear text on 1.13+. The key therefore uses the `render` escape hatch
	 * (the community-standard pattern) and hand-renders a password input —
	 * exactly like the display() fallback. The definition still carries
	 * name/desc so settings search keeps working.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Data folder',
				desc: 'Vault folder for Habits.md and daily Log notes.',
				control: {
					type: 'text',
					key: 'dataFolder',
					placeholder: 'Habitude',
					defaultValue: DEFAULT_SETTINGS.dataFolder,
				},
			},
			{
				name: 'Week starts on',
				desc: 'First day of the week in the checklist grid.',
				control: {
					type: 'dropdown',
					key: 'weekStart',
					options: { '1': 'Monday', '0': 'Sunday' },
					defaultValue: String(DEFAULT_SETTINGS.weekStart),
				},
			},
			{
				name: 'Gemini API key (AI coach, optional)',
				desc: 'Your own free Gemini key. Stored only on this device; sent only to Google AI, never to Habitude.',
				render: (setting) => {
					// Escape hatch: no declarative password control exists, so the
					// key is rendered as a masked input on 1.13+ too.
					setting.addText((text) => this.configureApiKeyInput(text));
				},
			},
			{
				name: 'Coach model',
				desc: 'Model ID used by the AI coach.',
				control: {
					type: 'text',
					key: 'coachModel',
					placeholder: DEFAULT_SETTINGS.coachModel,
					defaultValue: DEFAULT_SETTINGS.coachModel,
				},
			},
			{
				name: 'Coach language',
				desc: 'Reply language for the AI coach.',
				control: {
					type: 'dropdown',
					key: 'coachLanguage',
					options: { auto: 'Auto (match me)', en: 'English', ko: '한국어' },
					defaultValue: DEFAULT_SETTINGS.coachLanguage,
				},
			},
			{
				// Info-only row (SettingDefinitionEmpty): no control rendered.
				name: 'Sharing',
				desc: '공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',
			},
		];
	}

	getControlValue(key: string): unknown {
		const value = this.plugin.settings[key as keyof PluginSettings];
		// The dropdown control works with strings; keep settings typed as 0 | 1.
		return key === 'weekStart' ? String(value) : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'weekStart') {
			this.plugin.settings.weekStart = value === '0' ? 0 : 1;
		} else if (key === 'dataFolder') {
			const raw = typeof value === 'string' ? value : '';
			this.plugin.settings.dataFolder = raw.trim() || 'Habitude';
		} else if (key === 'geminiApiKey') {
			this.plugin.settings.geminiApiKey = typeof value === 'string' ? value.trim() : '';
		} else if (key === 'coachModel') {
			const raw = typeof value === 'string' ? value.trim() : '';
			this.plugin.settings.coachModel = raw || DEFAULT_SETTINGS.coachModel;
		} else if (key === 'coachLanguage') {
			this.plugin.settings.coachLanguage = value === 'ko' ? 'ko' : value === 'en' ? 'en' : 'auto';
		}
		await this.plugin.saveSettings();
	}

	/**
	 * Shared wiring for the Gemini API-key input. Used by BOTH the declarative
	 * `render` escape hatch (Obsidian 1.13+) and the display() fallback
	 * (older versions), so the key is always a masked password input and the
	 * two paths cannot drift apart.
	 *
	 * The input never pre-fills the saved key into the DOM: when a key is
	 * stored the placeholder shows a mask hint instead.
	 */
	private configureApiKeyInput(text: TextComponent): TextComponent {
		text.inputEl.type = 'password';
		return text
			.setPlaceholder(
				this.plugin.settings.geminiApiKey ? '•••••••• (key saved)' : 'Paste key to enable the AI coach',
			)
			.onChange(async (value) => {
				this.plugin.settings.geminiApiKey = value.trim();
				await this.plugin.saveSettings();
			});
	}

	/** Fallback for Obsidian < 1.13.0 (bypassed when getSettingDefinitions runs). */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Data folder')
			.setDesc('Vault folder for Habits.md and daily Log notes.')
			.addText((text) =>
				text
					.setPlaceholder('Habitude')
					.setValue(this.plugin.settings.dataFolder)
					.onChange(async (value) => {
						this.plugin.settings.dataFolder = value.trim() || 'Habitude';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Week starts on')
			.setDesc('First day of the week in the checklist grid.')
			.addDropdown((drop) =>
				drop
					.addOption('1', 'Monday')
					.addOption('0', 'Sunday')
					.setValue(String(this.plugin.settings.weekStart))
					.onChange(async (value) => {
						this.plugin.settings.weekStart = value === '0' ? 0 : 1;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Gemini API key (AI coach, optional)')
			.setDesc('Your own free Gemini key (Google AI Studio). Stored only on this device; sent only to Google AI, never to Habitude.')
			.addText((text) => {
				this.configureApiKeyInput(text);
			});

		new Setting(containerEl)
			.setName('Coach model')
			.setDesc('Model ID used by the AI coach.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.coachModel)
					.setValue(this.plugin.settings.coachModel)
					.onChange(async (value) => {
						this.plugin.settings.coachModel = value.trim() || DEFAULT_SETTINGS.coachModel;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Coach language')
			.setDesc('Reply language for the AI coach.')
			.addDropdown((drop) =>
				drop
					.addOption('auto', 'Auto (match me)')
					.addOption('en', 'English')
					.addOption('ko', '한국어')
					.setValue(this.plugin.settings.coachLanguage)
					.onChange(async (value) => {
						this.plugin.settings.coachLanguage = value === 'ko' ? 'ko' : value === 'en' ? 'en' : 'auto';
						await this.plugin.saveSettings();
					}),
			);

		// Info-only row: no control added, renders name + description.
		new Setting(containerEl)
			.setName('Sharing')
			.setDesc(
				'공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',
			);
	}
}
