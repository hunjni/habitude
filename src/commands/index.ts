// Command registration (stable IDs — do not rename after release).

import { Notice, SuggestModal } from 'obsidian';
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
		new Notice('Could not open the checklist view.');
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
		new Notice('Could not open the AI coach.');
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
		this.setPlaceholder('Pick a habit to toggle for today…');
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
		name: 'Open checklist',
		callback: () => void openChecklist(plugin),
	});

	plugin.addCommand({
		id: 'open-coach',
		name: 'Open AI coach',
		callback: () => void openCoach(plugin),
	});

	plugin.addCommand({
		id: 'open-weekly-review',
		name: 'Open weekly review',
		callback: () => {
			const store = plugin.getStore();
			const weekStartKey = startOfWeek(todayKey(), plugin.settings.weekStart);
			const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));
			new ReviewModal(plugin.app, store, weekKeys).open();
		},
	});

	plugin.addCommand({
		id: 'toggle-today',
		name: 'Toggle today for a habit',
		callback: () => {
			void (async () => {
				const store = plugin.getStore();
				const habits = await store.loadHabits();
				if (habits.length === 0) {
					new Notice('No habits yet. Open the checklist to add one.');
					return;
				}
				new HabitSuggestModal(
					plugin.app,
					(h) => {
						void (async () => {
							const checks = await store.loadDayChecks(todayKey());
							const checked = checks.has(h.id);
							await store.setCheck(todayKey(), h.id, h.title, !checked);
							new Notice(`${h.title}: ${checked ? 'unchecked' : 'checked'} for today`);
							plugin.refreshViews();
						})();
					},
					habits.map((h) => ({ id: h.id, title: h.title })),
				).open();
			})();
		},
	});
}
