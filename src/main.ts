// Plugin entry point: lifecycle only. Feature logic lives in commands/, ui/,
// store.ts, stats.ts and settings.ts.

import { Notice, Plugin } from 'obsidian';
import { clearUiLocale, setUiLocale, t } from './i18n';
import { DEFAULT_SETTINGS, HabitudeSettingTab, type PluginSettings } from './settings';
import { normalizeCheckmarkColor } from './types';
import { DEFAULT_COACH_MODEL, getProvider } from './coach/providers';
import type { GenerationConfig } from './ai-generator';
import { HabitStore } from './store';
import { CHECKLIST_VIEW_TYPE, ChecklistView } from './ui/checklist-view';
import { COACH_VIEW_TYPE, CoachView } from './ui/coach-view';
import { registerCommands } from './commands';
import { todayKey } from './utils/dates';

/** Pre-0.4.2 stored keys. Read once for migration, then purged from data.json. */
interface LegacySettings {
	geminiApiKey?: string;
	coachModel?: string;
}

export default class HabitudePlugin extends Plugin {
	settings!: PluginSettings;
	private store: HabitStore | null = null;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(CHECKLIST_VIEW_TYPE, (leaf) =>
			new ChecklistView(leaf, {
				getStore: () => this.getStore(),
				getWeekStart: () => this.settings.weekStart,
				getCheckmarkColor: () => this.settings.checkmarkColor,
				getPluginVersion: () => this.manifest.version,
				getAiConfig: () => this.getAiConfig(),
				getDataFolder: () => this.settings.dataFolder,
				openCoach: () => void this.activateCoachView(),
			}),
		);

		this.registerView(COACH_VIEW_TYPE, (leaf) => new CoachView(leaf, this));

		this.addRibbonIcon('check-square', t('ribbon.checklist'), () => {
			void this.activateView();
		});

		this.addRibbonIcon('sparkles', t('ribbon.coach'), () => {
			void this.activateCoachView();
		});

		this.statusBarEl = this.addStatusBarItem();
		void this.updateStatusBar();

		registerCommands(this);
		this.addSettingTab(new HabitudeSettingTab(this.app, this));

		// Re-render open views + status bar when markdown data changes on disk
		// (including edits the user makes by hand in Habits.md / Log notes).
		// Debounced to avoid render storms during sync.
		let timer: number | undefined;
		this.registerEvent(
			this.app.vault.on('modify', () => {
				if (timer !== undefined) window.clearTimeout(timer);
				timer = window.setTimeout(() => {
					this.refreshViews();
					void this.updateStatusBar();
				}, 400);
			}),
		);
	}

	onunload(): void {
		// Views and listeners are cleaned up by Obsidian via registerView/registerEvent.
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
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

	async activateCoachView(): Promise<void> {
		const { workspace } = this.app;
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

	/** Lazily created store bound to the configured data folder. */
	getStore(): HabitStore {
		if (!this.store) {
			this.store = new HabitStore(this.app, this.settings.dataFolder);
		}
		return this.store;
	}

	/**
	 * AI generation config from the coach settings, or null when unusable
	 * (keyed provider without a key, custom provider without a base URL).
	 * Generation reuses the coach's BYOK configuration — one key, one provider.
	 */
	private getAiConfig(): GenerationConfig | null {
		const s = this.settings;
		const def = getProvider(s.llmProvider);
		if (def.needsKey && !s.llmApiKey.trim()) return null;
		if (def.id === 'custom' && !s.llmBaseUrl.trim()) return null;
		return {
			provider: s.llmProvider,
			apiKey: s.llmApiKey.trim(),
			baseUrl: s.llmBaseUrl.trim(),
			model: s.llmModel.trim(),
			language: s.coachLanguage,
		};
	}

	/** Re-render every open checklist and coach view (e.g. after a settings change). */
	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(CHECKLIST_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof ChecklistView) {
				void view.render();
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(COACH_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof CoachView) {
				void view.render();
			}
		}
	}

	private async updateStatusBar(): Promise<void> {
		if (!this.statusBarEl) return;
		try {
			const store = this.getStore();
			const habits = await store.loadHabits();
			if (habits.length === 0) {
				this.statusBarEl.setText('');
				return;
			}
			const checks = await store.loadDayChecks(todayKey());
			const done = habits.filter((h) => checks.has(h.id)).length;
			this.statusBarEl.setText(t('statusbar.today', { done, total: habits.length }));
		} catch {
			this.statusBarEl.setText('');
		}
	}

	async loadSettings(): Promise<void> {
		// Legacy keys (pre-0.4.2) may still sit in stored data; they are read
		// here, migrated once, and purged below. They no longer exist in
		// PluginSettings/DEFAULT_SETTINGS.
		// loadData() returns null when no data.json exists yet (fresh install).
		const raw = ((await this.loadData()) ?? {}) as Partial<PluginSettings> & LegacySettings;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
		// Plugin UI language: 'auto' follows Obsidian's own language (see
		// i18n.getUiLocale); an explicit choice overrides detection. Must be
		// applied here, BEFORE registerCommands — command names are captured
		// at registration time.
		if (this.settings.uiLanguage !== 'auto' && this.settings.uiLanguage !== 'en' && this.settings.uiLanguage !== 'ko' && this.settings.uiLanguage !== 'zh') {
			this.settings.uiLanguage = 'auto';
		}
		if (this.settings.uiLanguage === 'auto') {
			clearUiLocale();
		} else {
			setUiLocale(this.settings.uiLanguage);
		}
		// New setting: users without it (pre-checkmark-color versions) inherit
		// the white default via Object.assign; invalid values are normalized
		// so the check mark can never render with a broken color.
		this.settings.checkmarkColor = normalizeCheckmarkColor(this.settings.checkmarkColor);
		// One-time migration: legacy geminiApiKey/coachModel → provider-neutral
		// llm* settings. Only runs when the new key is empty and a legacy key
		// exists, so existing users keep their coach working after the update.
		let migrated = false;
		if (!this.settings.llmApiKey && raw.geminiApiKey) {
			this.settings.llmProvider = 'gemini';
			this.settings.llmApiKey = raw.geminiApiKey;
			this.settings.llmModel = raw.coachModel || DEFAULT_COACH_MODEL;
			migrated = true;
		}
		// Purge legacy keys from stored data: this.settings was rebuilt from
		// DEFAULT_SETTINGS (which has no legacy fields), so saving it drops
		// them from data.json permanently.
		delete (this.settings as unknown as Record<string, unknown>).geminiApiKey;
		delete (this.settings as unknown as Record<string, unknown>).coachModel;
		if (migrated || raw.geminiApiKey !== undefined || raw.coachModel !== undefined) {
			await this.saveData(this.settings);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Data folder may have changed: drop the cached store and refresh.
		this.store = null;
		this.refreshViews();
		void this.updateStatusBar();
	}
}
