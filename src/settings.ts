// Settings: interface, defaults, and the settings tab UI.
// Local-first: checklist settings plus optional BYOK Gemini key for the AI
// coach. The key is stored only in this device's plugin data and is sent
// only to Google AI — never to Habitude servers.

import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { t } from './i18n';
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
				name: t('settings.dataFolder.name'),
				desc: t('settings.dataFolder.desc'),
				control: {
					type: 'text',
					key: 'dataFolder',
					placeholder: t('settings.dataFolder.placeholder'),
					defaultValue: DEFAULT_SETTINGS.dataFolder,
				},
			},
			{
				name: t('settings.weekStart.name'),
				desc: t('settings.weekStart.desc'),
				control: {
					type: 'dropdown',
					key: 'weekStart',
					options: { '1': t('settings.weekStart.monday'), '0': t('settings.weekStart.sunday') },
					defaultValue: String(DEFAULT_SETTINGS.weekStart),
				},
			},
			{
				name: t('settings.apiKey.name'),
				desc: t('settings.apiKey.desc'),
				render: (setting) => {
					// Escape hatch: no declarative password control exists, so the
					// key is rendered as a masked input on 1.13+ too.
					setting.addText((text) => this.configureApiKeyInput(text));
				},
			},
			{
				name: t('settings.coachModel.name'),
				desc: t('settings.coachModel.desc'),
				control: {
					type: 'text',
					key: 'coachModel',
					placeholder: DEFAULT_SETTINGS.coachModel,
					defaultValue: DEFAULT_SETTINGS.coachModel,
				},
			},
			{
				name: t('settings.coachLanguage.name'),
				desc: t('settings.coachLanguage.desc'),
				control: {
					type: 'dropdown',
					key: 'coachLanguage',
					options: {
						auto: t('settings.coachLanguage.auto'),
						en: t('settings.coachLanguage.english'),
						ko: t('settings.coachLanguage.korean'),
					},
					defaultValue: DEFAULT_SETTINGS.coachLanguage,
				},
			},
			{
				// Info-only row (SettingDefinitionEmpty): no control rendered.
				name: t('settings.sharing.name'),
				desc: t('settings.sharing.desc'),
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
				this.plugin.settings.geminiApiKey
					? t('settings.apiKey.savedPlaceholder')
					: t('settings.apiKey.emptyPlaceholder'),
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
			.setName(t('settings.dataFolder.name'))
			.setDesc(t('settings.dataFolder.desc'))
			.addText((text) =>
				text
					.setPlaceholder(t('settings.dataFolder.placeholder'))
					.setValue(this.plugin.settings.dataFolder)
					.onChange(async (value) => {
						this.plugin.settings.dataFolder = value.trim() || 'Habitude';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.weekStart.name'))
			.setDesc(t('settings.weekStart.desc'))
			.addDropdown((drop) =>
				drop
					.addOption('1', t('settings.weekStart.monday'))
					.addOption('0', t('settings.weekStart.sunday'))
					.setValue(String(this.plugin.settings.weekStart))
					.onChange(async (value) => {
						this.plugin.settings.weekStart = value === '0' ? 0 : 1;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.apiKey.name'))
			.setDesc(t('settings.apiKey.desc'))
			.addText((text) => {
				this.configureApiKeyInput(text);
			});

		new Setting(containerEl)
			.setName(t('settings.coachModel.name'))
			.setDesc(t('settings.coachModel.desc'))
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
			.setName(t('settings.coachLanguage.name'))
			.setDesc(t('settings.coachLanguage.desc'))
			.addDropdown((drop) =>
				drop
					.addOption('auto', t('settings.coachLanguage.auto'))
					.addOption('en', t('settings.coachLanguage.english'))
					.addOption('ko', t('settings.coachLanguage.korean'))
					.setValue(this.plugin.settings.coachLanguage)
					.onChange(async (value) => {
						this.plugin.settings.coachLanguage = value === 'ko' ? 'ko' : value === 'en' ? 'en' : 'auto';
						await this.plugin.saveSettings();
					}),
			);

		// Info-only row: no control added, renders name + description.
		new Setting(containerEl)
			.setName(t('settings.sharing.name'))
			.setDesc(t('settings.sharing.desc'));
	}
}
