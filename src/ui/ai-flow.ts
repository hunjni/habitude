// Shared AI-generation flow: explicit confirm → generate → write to vault.
//
// Used by both the add-habit dialog and the habit detail modal's regenerate
// button. The privacy rule lives here: nothing is requested until the user
// confirms a dialog that names the provider the data goes to.

import { Notice } from 'obsidian';
import { t } from '../i18n';
import { getProvider } from '../coach/providers';
import { generateKnowledgeCards, generatePlan, type GenerationConfig } from '../ai-generator';
import { writeGeneratedKnowledgeNote } from '../knowledge';
import type { Habit } from '../types';
import type { HabitStore } from '../store';
import { ConfirmModal } from './confirm-modal';

/** Null when no usable provider config exists (missing key / base URL). */
export type AiConfigProvider = () => GenerationConfig | null;

/**
 * Confirm, then generate knowledge cards + plan for the habit and persist
 * them (Knowledge/ folder + "### Plan" subsection). `onDone` runs on success
 * so callers can refresh their views.
 */
export function confirmAndGenerate(
	app: import('obsidian').App,
	cfg: GenerationConfig | null,
	store: HabitStore,
	dataFolder: string,
	habit: Habit,
	onDone: () => void,
): void {
	if (!cfg) {
		new Notice(t('ai.noApiKey'));
		return;
	}
	const providerName = getProvider(cfg.provider).label;
	new ConfirmModal(
		app,
		t('ai.confirmTitle'),
		t('ai.confirmBody', { title: habit.title, provider: providerName }),
		t('ai.confirmOk'),
		() => {
			void runGeneration(app, cfg, store, dataFolder, habit, onDone);
		},
	).open();
}

async function runGeneration(
	app: import('obsidian').App,
	cfg: GenerationConfig,
	store: HabitStore,
	dataFolder: string,
	habit: Habit,
	onDone: () => void,
): Promise<void> {
	const progress = new Notice(t('ai.generating'), 0);
	try {
		const plan = await generatePlan(cfg, habit);
		const cards = await generateKnowledgeCards(cfg, habit);
		await writeGeneratedKnowledgeNote(app, dataFolder, habit, cards);
		await store.updatePlan(habit.id, plan);
		new Notice(t('ai.generated', { cards: cards.length }));
		onDone();
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		new Notice(t('ai.generateFailed', { detail }));
	} finally {
		progress.hide();
	}
}
