// Urge-log section for the habit detail modal: recent entries, record
// buttons, the "record a slip" quick action, and the AI pattern analysis
// (explicit confirmation — entries may contain sensitive context).

import { Notice, Setting } from 'obsidian';
import { t } from '../i18n';
import type { Habit } from '../types';
import type { HabitStore } from '../store';
import { appendUrgeEntry, entriesForHabit, lastDayKeys, listUrgeEntries } from '../urge-log';
import { buildUrgeDataBlock, generateUrgeAnalysis } from '../ai-generator';
import { getProvider } from '../coach/providers';
import type { AiConfigProvider } from './ai-flow';
import { UrgeModal } from './urge-modal';
import { ConfirmModal } from './confirm-modal';

export interface UrgeSectionCtx {
	store: HabitStore;
	dataFolder: string;
	habit: Habit;
	getAiConfig: AiConfigProvider;
	onChanged: () => void;
}

/** Days of urge history shown in the section. */
const VISIBLE_DAYS = 7;

export function renderUrgeSection(app: import('obsidian').App, host: HTMLElement, ctx: UrgeSectionCtx): void {
	const section = host.createDiv({ cls: 'habitude-detail-urge' });
	section.createEl('h4', { text: t('urge.sectionTitle') });

	void (async () => {
		const byDay = await listUrgeEntries(app, ctx.dataFolder, lastDayKeys(VISIBLE_DAYS));
		const entries = entriesForHabit(byDay, ctx.habit.id);

		if (entries.length === 0) {
			section.createEl('p', { text: t('urge.empty') });
		} else {
			const list = section.createEl('ul', { cls: 'habitude-urge-list' });
			for (const e of entries.slice(-8).reverse()) {
				const glyph = e.outcome === 'slip' ? '💔' : '🛡';
				list.createEl('li', {
					text: `${glyph} ${e.date.slice(5)} ${e.time} · ${e.intensity}/10 · ${e.situation}${e.coping ? ` → ${e.coping}` : ''}`,
				});
			}
		}

		const aiOut = section.createDiv({ cls: 'habitude-urge-ai' });
		new Setting(section)
			.addButton((btn) =>
				btn.setButtonText(t('urge.record')).onClick(() => openRecord(app, ctx, false)),
			)
			.addButton((btn) =>
				btn.setButtonText(t('urge.recordSlip')).onClick(() => openRecord(app, ctx, true)),
			)
			.addButton((btn) =>
				btn.setButtonText(t('urge.aiAnalyze')).onClick(() => {
					void analyze(app, ctx, aiOut);
				}),
			);
	})();
}

function openRecord(app: import('obsidian').App, ctx: UrgeSectionCtx, preSlip: boolean): void {
	new UrgeModal(app, preSlip, (entry) => {
		void appendUrgeEntry(app, ctx.dataFolder, { ...entry, habitId: ctx.habit.id }).then(() => {
			new Notice(t('urge.saved'));
			ctx.onChanged();
		});
	}).open();
}

async function analyze(app: import('obsidian').App, ctx: UrgeSectionCtx, out: HTMLElement): Promise<void> {
	const cfg = ctx.getAiConfig();
	if (!cfg) {
		new Notice(t('ai.noApiKey'));
		return;
	}
	const entries = entriesForHabit(
		await listUrgeEntries(app, ctx.dataFolder, lastDayKeys(30)),
		ctx.habit.id,
	);
	const providerName = getProvider(cfg.provider).label;
	// Urge entries are sensitive: the confirm dialog states exactly what is sent.
	new ConfirmModal(
		app,
		t('urge.aiConfirmTitle'),
		t('urge.aiConfirmBody', { count: entries.length, provider: providerName }),
		t('ai.confirmOk'),
		() => {
			void (async () => {
				out.empty();
				out.setText(t('urge.aiRunning'));
				try {
					const text = await generateUrgeAnalysis(cfg, ctx.habit.title, buildUrgeDataBlock(entries));
					out.empty();
					out.createEl('p', { text, cls: 'habitude-urge-ai-result' });
				} catch (e) {
					out.empty();
					new Notice(t('ai.generateFailed', { detail: e instanceof Error ? e.message : String(e) }));
				}
			})();
		},
	).open();
}
