// Urge recording modal (bad habits): time, situation, intensity 1-10,
// coping, outcome. `preSlip` pre-selects "gave in" — this is how the
// "Record a slip" quick action works (ADR-0003: slips are recorded facts,
// never derived from unchecked days).

import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';
import type { UrgeOutcome } from '../urge-log';
import { nowTimeKey } from '../urge-log';

export class UrgeModal extends Modal {
	constructor(
		app: App,
		private preSlip: boolean,
		private onSubmit: (entry: {
			time: string;
			situation: string;
			intensity: number;
			coping: string;
			outcome: UrgeOutcome;
		}) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habitude-urge-modal');
		contentEl.createEl('h3', { text: t('urge.recordTitle') });

		let time = nowTimeKey();
		let situation = '';
		let intensity = 5;
		let coping = '';
		let outcome: UrgeOutcome = this.preSlip ? 'slip' : 'resisted';

		const submit = () => {
			if (!situation.trim()) return;
			this.onSubmit({
				time: time.trim() || nowTimeKey(),
				situation: situation.trim(),
				intensity,
				coping: coping.trim(),
				outcome,
			});
			this.close();
		};

		new Setting(contentEl).setName(t('urge.timeLabel')).addText((text) => {
			text.setValue(time).onChange((v) => (time = v));
		});
		new Setting(contentEl).setName(t('urge.situationLabel')).addText((text) => {
			text.setPlaceholder(t('urge.situationPlaceholder'));
			text.onChange((v) => (situation = v));
			text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					submit();
				}
			});
		});
		new Setting(contentEl).setName(t('urge.intensityLabel')).addDropdown((drop) => {
			for (let i = 1; i <= 10; i++) drop.addOption(String(i), String(i));
			drop.setValue('5');
			drop.onChange((v) => (intensity = Number(v) || 5));
		});
		new Setting(contentEl).setName(t('urge.copingLabel')).addText((text) => {
			text.setPlaceholder(t('urge.copingPlaceholder'));
			text.onChange((v) => (coping = v));
		});
		new Setting(contentEl).setName(t('urge.outcomeLabel')).addDropdown((drop) => {
			drop.addOption('resisted', t('urge.outcomeResisted'));
			drop.addOption('slip', t('urge.outcomeSlip'));
			drop.setValue(outcome);
			drop.onChange((v) => (outcome = v === 'slip' ? 'slip' : 'resisted'));
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t('urge.save')).setCta().onClick(() => submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
