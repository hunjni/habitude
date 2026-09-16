// Settings: interface, defaults, and the settings tab UI.
// Pure local settings only. No connection, no API keys, no network.

import { App, PluginSettingTab, Setting } from 'obsidian';
import type HabitudePlugin from './main';
import { DEFAULT_SETTINGS, type PluginSettings } from './types';

export type { PluginSettings };
export { DEFAULT_SETTINGS };

export class HabitudeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: HabitudePlugin) {
		super(app, plugin);
	}

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
	}
}
