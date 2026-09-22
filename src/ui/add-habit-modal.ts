// Add-habit modal: title + good/bad type selection + optional AI generation.
//
// Replaces the old "type title, press Enter" inline quick-add: a bad habit's
// check semantics differ (resisted, not done), so the type must be chosen at
// creation time. The AI checkbox only marks intent — the actual request is
// confirmed (and named with its provider) in a second dialog by ai-flow.

import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';
import type { HabitType } from '../types';

export class AddHabitModal extends Modal {
	constructor(
		app: App,
		private initialTitle: string,
		private onSubmit: (title: string, type: HabitType, wantAi: boolean) => void,
		private aiAvailable = true,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habitude-add-habit');
		contentEl.createEl('h3', { text: t('checklist.addHabitTitle') });

		let title = this.initialTitle;
		let type: HabitType = 'good';
		let wantAi = this.aiAvailable;
		const submit = () => {
			const trimmed = title.trim();
			if (!trimmed) return;
			this.onSubmit(trimmed, type, wantAi);
			this.close();
		};

		new Setting(contentEl)
			.setName(t('checklist.habitTitleLabel'))
			.addText((text) => {
				text.setPlaceholder(t('checklist.addHabitPlaceholder')).setValue(title);
				text.onChange((v) => (title = v));
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						submit();
					}
				});
			});

		new Setting(contentEl)
			.setName(t('checklist.habitTypeLabel'))
			.addDropdown((drop) => {
				drop.addOption('good', t('checklist.habitTypeGood'));
				drop.addOption('bad', t('checklist.habitTypeBad'));
				drop.setValue('good');
				drop.onChange((v) => (type = v === 'bad' ? 'bad' : 'good'));
			});

		const aiSetting = new Setting(contentEl).setName(t('addHabit.aiToggle'));
		// When no usable AI config exists, show WHY instead of a toggle that
		// silently produces a transient "not configured" notice later.
		if (!this.aiAvailable) {
			aiSetting.setDesc(t('addHabit.aiUnavailable'));
		}
		aiSetting.addToggle((toggle) => {
			toggle.setValue(wantAi).setDisabled(!this.aiAvailable);
			toggle.onChange((v) => (wantAi = v));
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t('checklist.add')).setCta().onClick(() => submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
