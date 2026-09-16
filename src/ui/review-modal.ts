// Weekly review modal: this week's completion summary per habit.

import { Modal } from 'obsidian';
import type { Habit } from '../types';
import { recentKeys, streakFor, weekRateFor } from '../stats';
import type { HabitStore } from '../store';

export class ReviewModal extends Modal {
	constructor(
		app: import('obsidian').App,
		private store: HabitStore,
		private weekKeys: string[],
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habitude-review');
		contentEl.createEl('h2', { text: 'Weekly review' });

		const habits: Habit[] = await this.store.loadHabits();
		if (habits.length === 0) {
			contentEl.createEl('p', { text: 'No habits yet. Add your first habit from the checklist view.' });
			return;
		}

		const checks = await this.store.loadChecksRange([...this.weekKeys, ...recentKeys()]);
		let totalChecks = 0;

		for (const habit of habits) {
			const rate = weekRateFor(habit.id, this.weekKeys, checks);
			const streak = streakFor(habit.id, checks);
			const checkedDays = this.weekKeys.filter((k) => checks.get(k)?.has(habit.id)).length;
			totalChecks += checkedDays;

			const row = contentEl.createDiv({ cls: 'habitude-review-row' });
			const head = row.createDiv({ cls: 'habitude-review-head' });
			head.createEl('strong', { text: habit.title });
			head.createSpan({ text: `${Math.round(rate * 100)}% · ${checkedDays}/${this.weekKeys.length} days · 🔥 ${streak}` });
			const bar = row.createDiv({ cls: 'habitude-bar' });
			bar.createDiv({ cls: 'habitude-bar-fill', attr: { style: `width: ${Math.round(rate * 100)}%` } });
		}

		contentEl.createEl('p', {
			text: `Total checks this week: ${totalChecks}`,
			cls: 'habitude-review-total',
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
