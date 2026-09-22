// Weekly review modal: this week's completion summary per habit.
// Good habits show week rate + streak; bad habits use their own metrics
// (resisted days, slips this week, days since last slip — ADR-0003).
// The optional AI review sends the aggregated statistics (never note
// contents) to the configured provider after an explicit confirmation.

import { Modal, Notice, Setting } from 'obsidian';
import { t } from '../i18n';
import type { Habit } from '../types';
import { daysSinceLastSlip, recentKeys, streakFor, weekRateFor } from '../stats';
import type { HabitStore } from '../store';
import { lastDayKeys, listUrgeEntries, slipDateKeys } from '../urge-log';
import { buildReviewDataBlock, generateReview } from '../ai-generator';
import { getProvider } from '../coach/providers';
import type { AiConfigProvider } from './ai-flow';
import { ConfirmModal } from './confirm-modal';

export interface ReviewAiDeps {
	getAiConfig: AiConfigProvider;
	getDataFolder: () => string;
}

export class ReviewModal extends Modal {
	constructor(
		app: import('obsidian').App,
		private store: HabitStore,
		private weekKeys: string[],
		private ai?: ReviewAiDeps,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habitude-review');
		contentEl.createEl('h2', { text: t('review.title') });

		const habits: Habit[] = await this.store.loadHabits();
		if (habits.length === 0) {
			contentEl.createEl('p', { text: t('review.empty') });
			return;
		}

		const checks = await this.store.loadChecksRange([...this.weekKeys, ...recentKeys()]);
		let totalChecks = 0;

		for (const habit of habits) {
			const row = contentEl.createDiv({ cls: 'habitude-review-row' });
			const head = row.createDiv({ cls: 'habitude-review-head' });
			head.createEl('strong', { text: habit.title });

			const checkedDays = this.weekKeys.filter((k) => checks.get(k)?.has(habit.id)).length;
			totalChecks += checkedDays;

			if (habit.type === 'bad') {
				// Bad-habit metrics (no streak): resisted days, slips, days since last slip.
				let meta = t('review.perHabitBad', {
					checked: checkedDays,
					total: this.weekKeys.length,
				});
				if (this.ai) {
					const urgeByDay = await listUrgeEntries(this.app, this.ai.getDataFolder(), lastDayKeys(30));
					const since = daysSinceLastSlip(slipDateKeys(urgeByDay, habit.id));
					meta +=
						' · ' +
						(since === null
							? t('urge.noSlipYet')
							: t('urge.daysSinceSlip', { days: since }));
				}
				head.createSpan({ text: meta });
			} else {
				const rate = weekRateFor(habit.id, this.weekKeys, checks);
				const streak = streakFor(habit.id, checks);
				head.createSpan({
					text: t('review.perHabitMeta', {
						rate: Math.round(rate * 100),
						checked: checkedDays,
						total: this.weekKeys.length,
						streak,
					}),
				});
			}

			const rate = weekRateFor(habit.id, this.weekKeys, checks);
			const bar = row.createDiv({ cls: 'habitude-bar' });
			bar.createDiv({ cls: 'habitude-bar-fill', attr: { style: `width: ${Math.round(rate * 100)}%` } });
		}

		contentEl.createEl('p', {
			text: t('review.totalChecks', { total: totalChecks }),
			cls: 'habitude-review-total',
		});

		if (this.ai) this.renderAiReview(contentEl, habits, checks);
	}

	/** AI review: confirm → send the aggregated stats block → show the reply. */
	private renderAiReview(
		contentEl: HTMLElement,
		habits: Habit[],
		checks: Map<string, Set<string>>,
	): void {
		const resultEl = contentEl.createDiv({ cls: 'habitude-review-ai' });
		new Setting(resultEl).addButton((btn) =>
			btn.setButtonText(t('review.aiButton')).onClick(() => {
				const cfg = this.ai?.getAiConfig();
				if (!cfg) {
					new Notice(t('ai.noApiKey'));
					return;
				}
				const providerName = getProvider(cfg.provider).label;
				new ConfirmModal(
					this.app,
					t('review.aiConfirmTitle'),
					t('review.aiConfirmBody', { provider: providerName }),
					t('ai.confirmOk'),
					() => {
						void (async () => {
							resultEl.empty();
							resultEl.setText(t('review.aiRunning'));
							try {
								const urgeByDay = await listUrgeEntries(
									this.app,
									this.ai!.getDataFolder(),
									lastDayKeys(30),
								);
								const block = buildReviewDataBlock(habits, this.weekKeys, checks, urgeByDay);
								const text = await generateReview(cfg, t('review.periodWeek'), block);
								resultEl.empty();
								resultEl.createEl('h4', { text: t('review.aiResult') });
								resultEl.createEl('p', { text, cls: 'habitude-review-ai-result' });
							} catch (e) {
								resultEl.empty();
								new Notice(
									t('ai.generateFailed', { detail: e instanceof Error ? e.message : String(e) }),
								);
							}
						})();
					},
				).open();
			}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
