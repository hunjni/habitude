// Command registration (stable IDs — do not rename after release).

import { Notice, SuggestModal } from 'obsidian';
import { t } from '../i18n';
import type HabitudePlugin from '../main';
import { CHECKLIST_VIEW_TYPE } from '../ui/checklist-view';
import { COACH_VIEW_TYPE } from '../ui/coach-view';
import { ReviewModal } from '../ui/review-modal';
import { addDays, startOfWeek, todayKey } from '../utils/dates';

async function openChecklist(plugin: HabitudePlugin): Promise<void> {
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType(CHECKLIST_VIEW_TYPE)[0];
	if (existing) {
		void workspace.revealLeaf(existing);
		return;
	}
	const leaf = workspace.getRightLeaf(false);
	if (!leaf) {
		new Notice(t('notice.cannotOpenChecklist'));
		return;
	}
	await leaf.setViewState({ type: CHECKLIST_VIEW_TYPE, active: true });
	void workspace.revealLeaf(leaf);
}

async function openCoach(plugin: HabitudePlugin): Promise<void> {
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType(COACH_VIEW_TYPE)[0];
	if (existing) {
		void workspace.revealLeaf(existing);
		return;
	}
	const leaf = workspace.getRightLeaf(false);
	if (!leaf) {
		new Notice(t('notice.cannotOpenCoach'));
		return;
	}
	await leaf.setViewState({ type: COACH_VIEW_TYPE, active: true });
	void workspace.revealLeaf(leaf);
}

interface HabitChoice {
	id: string;
	title: string;
}

class HabitSuggestModal extends SuggestModal<HabitChoice> {
	constructor(
		app: import('obsidian').App,
		private onChoose: (h: HabitChoice) => void,
		private habits: HabitChoice[],
	) {
		super(app);
		this.setPlaceholder(t('cmd.pickHabitPlaceholder'));
	}

	getSuggestions(query: string): HabitChoice[] {
		const q = query.toLowerCase();
		return this.habits.filter((h) => h.title.toLowerCase().includes(q));
	}

	renderSuggestion(h: HabitChoice, el: HTMLElement): void {
		el.setText(h.title);
	}

	onChooseSuggestion(h: HabitChoice): void {
		this.onChoose(h);
	}
}

export function registerCommands(plugin: HabitudePlugin): void {
	plugin.addCommand({
		id: 'open-checklist',
		name: t('cmd.openChecklist'),
		callback: () => void openChecklist(plugin),
	});

	plugin.addCommand({
		id: 'open-coach',
		name: t('cmd.openCoach'),
		callback: () => void openCoach(plugin),
	});

	plugin.addCommand({
		id: 'open-weekly-review',
		name: t('cmd.openWeeklyReview'),
		callback: () => {
			const store = plugin.getStore();
			const weekStartKey = startOfWeek(todayKey(), plugin.settings.weekStart);
			const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
			new ReviewModal(plugin.app, store, weekKeys).open();
		},
	});

	plugin.addCommand({
		id: 'toggle-today',
		name: t('cmd.toggleToday'),
		callback: () => {
			void (async () => {
				const store = plugin.getStore();
				const habits = await store.loadHabits();
				if (habits.length === 0) {
					new Notice(t('cmd.noHabitsYet'));
					return;
				}
				new HabitSuggestModal(
					plugin.app,
					(h) => {
						void (async () => {
							const checks = await store.loadDayChecks(todayKey());
							const checked = checks.has(h.id);
							await store.setCheck(todayKey(), h.id, h.title, !checked);
							new Notice(
								checked
									? t('cmd.toggledUnchecked', { title: h.title })
									: t('cmd.toggledChecked', { title: h.title }),
							);
							plugin.refreshViews();
						})();
					},
					habits.map((h) => ({ id: h.id, title: h.title })),
				).open();
			})();
		},
	});
}
