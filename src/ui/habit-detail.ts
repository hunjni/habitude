// Habit detail modal: execution plan (view/edit), knowledge cards (AI
// generated + manually linked notes), and AI regeneration.
//
// Everything here is an explicit user action: opening cards, editing plan
// fields, linking a note, or pressing the regenerate button (which shows the
// standard AI confirm dialog from ai-flow before any request is made).

import { App, Modal, Notice, Setting } from 'obsidian';
import { t } from '../i18n';
import type { Habit, HabitPlan } from '../types';
import type { HabitStore } from '../store';
import { writePlanNote, findPlanNote } from '../plan-note';
import {
	listCardsForHabit,
	parseManualLinks,
	renderManualLinks,
	MANUAL_LINKS_FIELD,
} from '../knowledge';
import { confirmAndGenerate, type AiConfigProvider } from './ai-flow';
import { renderUrgeSection } from './urge-view';

const PLAN_FIELDS: Array<[keyof Omit<HabitPlan, 'phases'>, string]> = [
	['microHabit', 'detail.planFieldMicroHabit'],
	['triggerCue', 'detail.planFieldTriggerCue'],
	['executionTime', 'detail.planFieldExecutionTime'],
	['location', 'detail.planFieldLocation'],
	['environmentDesign', 'detail.planFieldEnvironmentDesign'],
	['immediateReward', 'detail.planFieldImmediateReward'],
];

export class HabitDetailModal extends Modal {
	private editingPlan = false;

	constructor(
		app: App,
		private store: HabitStore,
		private dataFolder: string,
		private habit: Habit,
		private getAiConfig: AiConfigProvider,
		private onChanged: () => void,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habitude-habit-detail');

		contentEl.createEl('h3', { text: this.habit.title });
		contentEl.createDiv({
			text: t(this.habit.type === 'bad' ? 'detail.typeBad' : 'detail.typeGood'),
			cls: 'habitude-detail-type',
		});

		this.renderPlan(contentEl);
		if (this.habit.type === 'bad') {
			renderUrgeSection(this.app, contentEl, {
				store: this.store,
				dataFolder: this.dataFolder,
				habit: this.habit,
				getAiConfig: this.getAiConfig,
				onChanged: this.onChanged,
			});
		}
		await this.renderKnowledge(contentEl);
	}

	/** Plan display (or the edit form while `editingPlan`). */
	private renderPlan(host: HTMLElement): void {
		const section = host.createDiv({ cls: 'habitude-detail-plan' });
		section.createEl('h4', { text: t(this.editingPlan ? 'detail.planEdit' : 'detail.planSection') });
		const plan = this.habit.plan;
		if (!plan) {
			section.createEl('p', { text: t('detail.planEmpty') });
			return;
		}
		if (this.editingPlan) {
			this.renderPlanEditor(section, plan);
			return;
		}
		for (const [prop, key] of PLAN_FIELDS) {
			const value = plan[prop];
			if (!value) continue;
			const row = section.createDiv({ cls: 'habitude-plan-row' });
			row.createSpan({ text: t(key), cls: 'habitude-plan-label' });
			row.createSpan({ text: value, cls: 'habitude-plan-value' });
		}
		if (plan.phases.length > 0) {
			const list = section.createEl('ul', { cls: 'habitude-plan-phases' });
			for (const phase of plan.phases) {
				list.createEl('li', { text: `${phase.name}（${phase.days}）：${phase.focus}` });
			}
		}
	new Setting(section)
		.addButton((btn) => btn.setButtonText(t('detail.planOpenNote')).onClick(() => void this.openPlanNote()))
		.addButton((btn) =>
			btn.setButtonText(t('detail.planEdit')).onClick(() => {
				this.editingPlan = true;
				void this.onOpen();
			}),
		);
}

/** Open the generated Plans/<title>执行方案.md note (notice when absent). */
private async openPlanNote(): Promise<void> {
	const file = await findPlanNote(this.app, this.dataFolder, this.habit.id);
	if (!file) {
		new Notice(t('detail.planNoteMissing'));
		return;
	}
	await this.app.workspace.getLeaf('tab').openFile(file);
}

	/** Editable form: one input per plan field + a phases textarea. */
	private renderPlanEditor(section: HTMLElement, plan: HabitPlan): void {
		const values: Record<string, string> = {};
		for (const [prop, key] of PLAN_FIELDS) {
			new Setting(section).setName(t(key)).addText((text) => {
				text.setValue(plan[prop]).onChange((v) => (values[prop] = v));
			});
		}
		let phasesText = plan.phases.map((p) => `${p.name} | ${p.days} | ${p.focus}`).join('\n');
		new Setting(section).setName(t('detail.planPhasesLabel')).addTextArea((area) => {
			area.setValue(phasesText).onChange((v) => (phasesText = v));
		});
		new Setting(section)
			.addButton((btn) =>
				btn.setButtonText(t('common.cancel')).onClick(() => {
					this.editingPlan = false;
					void this.onOpen();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('detail.planSave'))
					.setCta()
					.onClick(() => {
						const next: HabitPlan = { ...plan, phases: [] };
						for (const [prop] of PLAN_FIELDS) {
							const v = values[prop];
							if (v !== undefined) next[prop] = v.trim();
						}
						next.phases = phasesText
							.split('\n')
							.map((line) => line.split('|').map((p) => p.trim()))
							.filter((parts) => !!parts[0])
							.map((parts) => ({
								name: parts[0] ?? '',
								days: parts[1] ?? '',
								focus: parts.slice(2).join(' | '),
							}));
						void this.store.updatePlan(this.habit.id, next).then(async () => {
							this.editingPlan = false;
							this.habit = { ...this.habit, plan: next };
							// Keep the Plans/ readable copy in sync with the
							// structured source (same as AI regeneration does).
							await writePlanNote(this.app, this.dataFolder, this.habit, next);
							this.onChanged();
							void this.onOpen();
						});
					}),
			);
	}

	/** Knowledge cards (AI files + manual wikilinks) and the regenerate button. */
	private async renderKnowledge(host: HTMLElement): Promise<void> {
		const section = host.createDiv({ cls: 'habitude-detail-knowledge' });
		section.createEl('h4', { text: t('detail.knowledgeSection') });

		const cards = await listCardsForHabit(this.app, this.dataFolder, this.habit.id);
		const links = parseManualLinks(this.habit.notes ?? '');

		if (cards.length === 0 && links.length === 0) {
			section.createEl('p', { text: t('detail.knowledgeEmpty') });
		}
		for (const card of cards) {
			const item = section.createDiv({ cls: 'habitude-card-item' });
			const btn = item.createEl('button', {
				cls: 'habitude-card-link',
				attr: { 'aria-label': t('detail.openCardAria', { title: card.title }) },
			});
			const when = card.generated ? ` · ${card.generated}` : '';
			btn.setText(`${card.title}${when}`);
			btn.onclick = () => void this.app.workspace.getLeaf('tab').openFile(card.file);
		}
		for (const link of links) {
			const item = section.createDiv({ cls: 'habitude-card-item' });
			item.createSpan({ text: `🔗 ${link}`, cls: 'habitude-manual-link' });
			item
				.createEl('button', { text: '✕', attr: { 'aria-label': t('detail.linkRemove') } })
				.onclick = () => this.saveLinks(links.filter((l) => l !== link));
		}

		// Add a manual link (comma-separated wikilinks).
		let linkValue = '';
		new Setting(section)
			.setName(t('detail.linkLabel'))
			.addText((text) => {
				text.setPlaceholder(t('detail.linkPlaceholder'));
				text.onChange((v) => (linkValue = v));
			})
			.addButton((btn) =>
				btn.setButtonText(t('detail.linkAdd')).onClick(() => {
					const parsed = parseManualLinks(linkValue);
					if (parsed.length === 0) return;
					this.saveLinks([...links, ...parsed]);
				}),
			);

		new Setting(section).addButton((btn) =>
			btn.setButtonText(t('detail.regenerate')).onClick(() => {
				confirmAndGenerate(this.app, this.getAiConfig(), this.store, this.dataFolder, this.habit, () => {
					this.onChanged();
					void this.onOpen();
				});
			}),
		);
	}

	private saveLinks(links: string[]): void {
		const value = renderManualLinks(links);
		void this.store.setHabitField(this.habit.id, MANUAL_LINKS_FIELD, value).then(() => {
			this.habit = { ...this.habit, notes: value };
			this.onChanged();
			void this.onOpen();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
