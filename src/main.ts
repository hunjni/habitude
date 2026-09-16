// Plugin entry point: lifecycle only. Feature logic lives in commands/, ui/,
// store.ts, stats.ts and settings.ts.

import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, HabitudeSettingTab, type PluginSettings } from './settings';
import { HabitStore } from './store';
import { CHECKLIST_VIEW_TYPE, ChecklistView } from './ui/checklist-view';
import { registerCommands } from './commands';
import { todayKey } from './utils/dates';

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
			}),
		);

		this.addRibbonIcon('check-square', 'Habitude checklist', () => {
			void this.activateView();
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
			new Notice('Could not open the checklist view.');
			return;
		}
		await leaf.setViewState({ type: CHECKLIST_VIEW_TYPE, active: true });
		void workspace.revealLeaf(leaf);
	}

	/** Lazily created store bound to the configured data folder. */
	getStore(): HabitStore {
		if (!this.store) {
			this.store = new HabitStore(this.app, this.settings.dataFolder);
		}
		return this.store;
	}

	/** Re-render every open checklist view (e.g. after data-folder change). */
	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(CHECKLIST_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof ChecklistView) {
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
			this.statusBarEl.setText(`✓ ${done}/${habits.length} today`);
		} catch {
			this.statusBarEl.setText('');
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<PluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Data folder may have changed: drop the cached store and refresh.
		this.store = null;
		this.refreshViews();
		void this.updateStatusBar();
	}
}
