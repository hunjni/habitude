// Generic yes/no confirmation modal. Used before every AI request: the
// privacy requirement is an explicit user confirmation that names the
// provider the data will be sent to.

import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private body: string,
		private okLabel: string,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.title });
		contentEl.createEl('p', { text: this.body });
		const row = contentEl.createDiv({ cls: 'habitude-confirm-row' });
		row.createEl('button', { text: t('common.cancel'), cls: 'habitude-confirm-cancel' }).onclick = () =>
			this.close();
		row.createEl('button', { text: this.okLabel, cls: 'mod-cta' }).onclick = () => {
			this.close();
			this.onConfirm();
		};
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
