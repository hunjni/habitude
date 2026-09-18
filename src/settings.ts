// Settings: interface, defaults, and the settings tab UI.
// Local-first: checklist settings plus an optional BYOK API key for the AI
// coach (any supported LLM provider). The key is stored only in this
// device's plugin data and is sent only to the selected provider — never
// to Habitude servers.

import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { t } from './i18n';
import type HabitudePlugin from './main';
import { getProvider, LLM_PROVIDER_IDS, type LlmProviderId } from './coach/providers';
import { DEFAULT_SETTINGS, normalizeCheckmarkColor, type PluginSettings } from './types';

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
		const def = getProvider(this.plugin.settings.llmProvider);
		const providerOptions: Record<string, string> = {};
		for (const id of LLM_PROVIDER_IDS) {
			providerOptions[id] = t(`settings.provider.${id}`);
		}
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
				name: t('settings.checkmarkColor.name'),
				desc: t('settings.checkmarkColor.desc'),
				control: {
					type: 'color',
					key: 'checkmarkColor',
					defaultValue: DEFAULT_SETTINGS.checkmarkColor,
				},
			},
			{
				name: t('settings.provider.name'),
				desc: t('settings.provider.desc'),
				control: {
					type: 'dropdown',
					key: 'llmProvider',
					options: providerOptions,
					defaultValue: DEFAULT_SETTINGS.llmProvider,
				},
			},
			{
				name: t('settings.llmKey.name'),
				desc: def.needsKey ? t('settings.llmKey.desc') : t('settings.llmKey.noKeyDesc'),
				render: (setting) => {
					// Escape hatch: no declarative password control exists, so the
					// key is rendered as a masked input on 1.13+ too.
					setting.addText((text) => this.configureLlmKeyInput(text));
				},
			},
			{
				name: t('settings.llmModel.name'),
				desc: t('settings.llmModel.desc'),
				control: {
					type: 'text',
					key: 'llmModel',
					placeholder: def.modelPlaceholder,
					defaultValue: DEFAULT_SETTINGS.llmModel,
				},
			},
			{
				name: t('settings.baseUrl.name'),
				desc: def.id === 'custom' ? t('settings.baseUrl.requiredDesc') : t('settings.baseUrl.desc'),
				control: {
					type: 'text',
					key: 'llmBaseUrl',
					placeholder: t('settings.baseUrl.placeholder', { url: def.defaultBaseUrl || '—' }),
					defaultValue: DEFAULT_SETTINGS.llmBaseUrl,
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
		} else if (key === 'checkmarkColor') {
			this.plugin.settings.checkmarkColor = normalizeCheckmarkColor(value);
		} else if (key === 'dataFolder') {
			const raw = typeof value === 'string' ? value : '';
			this.plugin.settings.dataFolder = raw.trim() || 'Habitude';
		} else if (key === 'llmProvider') {
			const id = typeof value === 'string' ? value : 'gemini';
			this.plugin.settings.llmProvider = (
				LLM_PROVIDER_IDS as string[]
			).includes(id)
				? (id as LlmProviderId)
				: 'gemini';
		} else if (key === 'llmApiKey') {
			this.plugin.settings.llmApiKey = typeof value === 'string' ? value.trim() : '';
		} else if (key === 'llmModel') {
			this.plugin.settings.llmModel = typeof value === 'string' ? value.trim() : '';
		} else if (key === 'llmBaseUrl') {
			this.plugin.settings.llmBaseUrl = typeof value === 'string' ? value.trim() : '';
		} else if (key === 'coachLanguage') {
			this.plugin.settings.coachLanguage = value === 'ko' ? 'ko' : value === 'en' ? 'en' : 'auto';
		}
		await this.plugin.saveSettings();
	}

	/**
	 * Shared wiring for the LLM API-key input. Used by BOTH the declarative
	 * `render` escape hatch (Obsidian 1.13+) and the display() fallback
	 * (older versions), so the key is always a masked password input and the
	 * two paths cannot drift apart.
	 *
	 * The input never pre-fills the saved key into the DOM: when a key is
	 * stored the placeholder shows a mask hint instead.
	 */
	private configureLlmKeyInput(text: TextComponent): TextComponent {
		text.inputEl.type = 'password';
		return text
			.setPlaceholder(
				this.plugin.settings.llmApiKey
					? t('settings.llmKey.savedPlaceholder')
					: t('settings.llmKey.emptyPlaceholder'),
			)
			.onChange(async (value) => {
				this.plugin.settings.llmApiKey = value.trim();
				await this.plugin.saveSettings();
			});
	}

	/** Fallback for Obsidian < 1.13.0 (bypassed when getSettingDefinitions runs). */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const def = getProvider(this.plugin.settings.llmProvider);

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
			.setName(t('settings.checkmarkColor.name'))
			.setDesc(t('settings.checkmarkColor.desc'))
			.addColorPicker((cp) =>
				cp
					.setValue(normalizeCheckmarkColor(this.plugin.settings.checkmarkColor))
					.onChange(async (value) => {
						this.plugin.settings.checkmarkColor = normalizeCheckmarkColor(value);
						// saveSettings() re-renders open views → color updates live.
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.provider.name'))
			.setDesc(t('settings.provider.desc'))
			.addDropdown((drop) => {
				for (const id of LLM_PROVIDER_IDS) {
					drop.addOption(id, t(`settings.provider.${id}`));
				}
				return drop.setValue(this.plugin.settings.llmProvider).onChange(async (value) => {
					const id = (LLM_PROVIDER_IDS as string[]).includes(value) ? (value as LlmProviderId) : 'gemini';
					this.plugin.settings.llmProvider = id;
					await this.plugin.saveSettings();
					// Re-render so the model placeholder / key hint follow the provider.
					this.display();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.llmKey.name'))
			.setDesc(def.needsKey ? t('settings.llmKey.desc') : t('settings.llmKey.noKeyDesc'))
			.addText((text) => {
				this.configureLlmKeyInput(text);
			});

		new Setting(containerEl)
			.setName(t('settings.llmModel.name'))
			.setDesc(t('settings.llmModel.desc'))
			.addText((text) =>
				text
					.setPlaceholder(def.modelPlaceholder)
					.setValue(this.plugin.settings.llmModel)
					.onChange(async (value) => {
						this.plugin.settings.llmModel = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.baseUrl.name'))
			.setDesc(def.id === 'custom' ? t('settings.baseUrl.requiredDesc') : t('settings.baseUrl.desc'))
			.addText((text) =>
				text
					.setPlaceholder(t('settings.baseUrl.placeholder', { url: def.defaultBaseUrl || '—' }))
					.setValue(this.plugin.settings.llmBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.llmBaseUrl = value.trim();
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
