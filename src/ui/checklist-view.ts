// 7-day checklist ItemView: habits × days grid with click-to-toggle cells,
// local progress graphs, and an opt-in share button.

import { ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import { t } from '../i18n';
import type { HabitStore } from '../store';
import type { Habit } from '../types';
import { recentKeys, streakFor, weekRateFor, currentPhase } from '../stats';
import { historyStripSvg, weeklyBarsSvg, type GraphDay } from '../graphs';
import { shareFromStore } from '../share';
import { ReviewModal } from './review-modal';
import { AddHabitModal } from './add-habit-modal';
import { HabitDetailModal } from './habit-detail';
import { confirmAndGenerate, type AiConfigProvider } from './ai-flow';
import {
	addDays,
	dayLabel,
	dayNumber,
	startOfWeek,
	todayKey,
	weekRangeLabel,
} from '../utils/dates';

export const CHECKLIST_VIEW_TYPE = 'habitude-checklist-view';

interface ViewDeps {
	getStore: () => HabitStore;
	getWeekStart: () => 0 | 1;
	/** '#rrggbb' color for the ✓ check mark glyph */
	getCheckmarkColor: () => string;
	getPluginVersion: () => string;
	/** AI generation config (provider/key/model); null when not configured. */
	getAiConfig: AiConfigProvider;
	/** Vault-relative data folder (Knowledge/ lives under it). */
	getDataFolder: () => string;
	/** Open the built-in BYOK AI coach view (the former funnel link). */
	openCoach: () => void;
}

export class ChecklistView extends ItemView {
	private weekOffset = 0;
	private deps: ViewDeps;
	/** Incremented on every render; async fills bail out when stale. */
	private renderSeq = 0;

	constructor(leaf: WorkspaceLeaf, deps: ViewDeps) {
		super(leaf);
		this.deps = deps;
	}

	getViewType(): string {
		return CHECKLIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('view.checklist.title');
	}

	getIcon(): string {
		return 'check-square';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const seq = ++this.renderSeq;
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('habitude-checklist');
		// User-configurable checkmark color; falls back to the CSS default
		// (white) if unset. saveSettings() re-renders views, so a settings
		// change applies to open checklists immediately.
		container.style.setProperty('--habitude-checkmark-color', this.deps.getCheckmarkColor());

		const store = this.deps.getStore();
		const weekStart = this.deps.getWeekStart();
		const weekStartKey = addDays(startOfWeek(todayKey(), weekStart), this.weekOffset * 7);
		const weekKeys = Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i));

		// Header: week navigation + review button
		const header = container.createDiv({ cls: 'habitude-header' });
		const prev = header.createEl('button', { text: '‹', cls: 'habitude-nav-btn' });
		prev.onclick = () => {
			this.weekOffset--;
			void this.render();
		};
		header.createSpan({ text: weekRangeLabel(weekStartKey), cls: 'habitude-week-label' });
		const next = header.createEl('button', { text: '›', cls: 'habitude-nav-btn' });
		next.onclick = () => {
			this.weekOffset++;
			void this.render();
		};
		header.createDiv({ cls: 'habitude-spacer' });
		const reviewBtn = header.createEl('button', { text: t('checklist.weeklyReview'), cls: 'habitude-review-btn' });
		reviewBtn.onclick = () =>
			new ReviewModal(this.app, store, weekKeys, {
				getAiConfig: this.deps.getAiConfig,
				getDataFolder: this.deps.getDataFolder,
			}).open();

		// Add-habit row
		const addRow = container.createDiv({ cls: 'habitude-add-row' });
		const input = addRow.createEl('input', {
			cls: 'habitude-add-input',
			attr: { placeholder: t('checklist.newHabitPlaceholder'), type: 'text' },
		});
		const addBtn = addRow.createEl('button', { text: t('checklist.add'), cls: 'habitude-add-btn' });
		const doAdd = () => {
			// The type (good/bad) must be chosen at creation: it flips the
			// check semantics. The modal pre-fills the title typed so far.
			new AddHabitModal(
				this.app,
				input.value.trim(),
				(title, type, wantAi) => {
					input.value = '';
				void store
					.addHabit(title, type)
					.then((habit) => {
						new Notice(t('checklist.habitAdded', { title: habit.title }));
						if (wantAi) {
							// Explicit user confirm happens inside (names the provider).
							confirmAndGenerate(
								this.app,
								this.deps.getAiConfig(),
								store,
								this.deps.getDataFolder(),
								habit,
								() => void this.render(),
							);
						}
					})
					.then(() => this.render())
					.catch(() => new Notice(t('checklist.saveCheckFailed')));
				},
				// Disable + explain the AI toggle up front when no usable
				// provider config exists (missing key / base URL), instead of
				// failing later with a transient notice.
				this.deps.getAiConfig() !== null,
			).open();
		};
		addBtn.onclick = () => void doAdd();
		input.onkeydown = (e) => {
			if (e.key === 'Enter') void doAdd();
		};

		// Load the visible week first so the grid paints fast; streaks need
		// 60 days of history and fill in asynchronously afterwards.
		const weekSet = new Set(weekKeys);
		const [habits, weekChecks] = await Promise.all([
			store.loadHabits(),
			store.loadChecksRange(weekKeys),
		]);
		if (seq !== this.renderSeq) return; // superseded while loading
		if (habits.length === 0) {
			const empty = container.createDiv({ cls: 'habitude-empty' });
			empty.createEl('p', { text: t('checklist.emptyTitle') });
			empty.createEl('p', { text: t('checklist.emptyHint') });
		}

		// Grid: good and bad habits in separate sections (bad section only
		// appears when there are bad habits). With a single group the layout
		// is identical to the pre-partition view — no header, no change.
		const good = habits.filter((h) => h.type !== 'bad');
		const bad = habits.filter((h) => h.type === 'bad');
		const showSections = good.length > 0 && bad.length > 0;
		const metaEls = new Map<string, HTMLElement>();
		if (good.length > 0) {
			if (showSections) container.createEl('h3', { text: t('checklist.sectionGood'), cls: 'habitude-section-title' });
			this.renderGrid(container, good, weekKeys, weekChecks, metaEls);
		}
		if (bad.length > 0) {
			if (showSections) container.createEl('h3', { text: t('checklist.sectionBad'), cls: 'habitude-section-title' });
			this.renderGrid(container, bad, weekKeys, weekChecks, metaEls);
		}

		// Graphs section: populated asynchronously once 60 days of checks load.
		// 100% local SVG rendering — no network involved.
		const graphsSection = container.createDiv({ cls: 'habitude-graphs' });
		graphsSection.createEl('h3', { text: t('checklist.progress'), cls: 'habitude-graphs-title' });
		const graphsBody = graphsSection.createDiv({ cls: 'habitude-graphs-body' });

		// Share row: explicit opt-in button. Nothing is sent unless clicked.
		const shareRow = graphsSection.createDiv({ cls: 'habitude-share-row' });
		const shareBtn = shareRow.createEl('button', {
			text: t('checklist.shareProgress'),
			cls: 'habitude-share-btn',
		});
		shareBtn.onclick = () => {
			shareBtn.disabled = true;
			void shareFromStore(
				() => store.loadHabits(),
				(keys) => store.loadChecksRange(keys),
				this.deps.getPluginVersion(),
			).finally(() => {
				shareBtn.disabled = false;
			});
		};
		shareRow.createEl('p', {
			text: t('checklist.shareNote'),
			cls: 'habitude-share-note',
		});

		// Streaks need 60 days of history: fill them in after the grid is on
		// screen. Guarded by the render sequence so a re-render (e.g. from a
		// toggle) never writes into detached DOM.
		void (async () => {
			const recent = await store.loadChecksRange(recentKeys().filter((k) => !weekSet.has(k)));
			if (seq !== this.renderSeq) return;
			for (const [k, v] of recent) weekChecks.set(k, v);
			for (const habit of habits) {
				const el = metaEls.get(habit.id);
				if (el) {
					const streak = streakFor(habit.id, weekChecks);
					const rate = weekRateFor(habit.id, weekKeys, weekChecks);
					el.setText(`🔥 ${streak} · ${Math.round(rate * 100)}%`);
				}
			}
			// Local progress graphs, rendered from the same 60-day check map.
			for (const habit of habits) {
				this.renderHabitGraphs(graphsBody, habit, weekChecks);
			}
		})();

		// Footer: opens the built-in AI coach (BYOK — the user's own
		// provider/key/model). The upstream funnel link to habitude.ai was
		// replaced: it advertised a commercial service this fork doesn't use.
		const footer = container.createDiv({ cls: 'habitude-footer' });
		const coachBtn = footer.createEl('button', { text: t('checklist.getCoaching'), cls: 'habitude-coach-btn' });
		coachBtn.onclick = () => this.deps.openCoach();
		footer.createEl('p', {
			text: t('checklist.footnote'),
			cls: 'habitude-footnote',
		});
	}

	/**
	 * One section's grid (header + habit rows). Bad habits show 🛡 for a
	 * resisted day (data format identical to a good-habit check, ADR-0003)
	 * and a stage badge when a plan with a generation date exists (Q6).
	 */
	private renderGrid(
		container: HTMLElement,
		groupHabits: Habit[],
		weekKeys: string[],
		weekChecks: Map<string, Set<string>>,
		metaEls: Map<string, HTMLElement>,
	): void {
		const store = this.deps.getStore();
		const table = container.createEl('table', { cls: 'habitude-grid' });
		const headRow = table.createEl('thead').createEl('tr');
		headRow.createEl('th', { text: '', cls: 'habitude-col-habit' });
		for (const key of weekKeys) {
			const th = headRow.createEl('th', { cls: 'habitude-col-day' + (key === todayKey() ? ' habitude-today' : '') });
			th.createDiv({ text: dayLabel(key), cls: 'habitude-day-name' });
			th.createDiv({ text: dayNumber(key), cls: 'habitude-day-num' });
		}

		const tbody = table.createEl('tbody');
		for (const habit of groupHabits) {
			const tr = tbody.createEl('tr');
			const nameCell = tr.createEl('td', { cls: 'habitude-habit-cell' });
			const rate = weekRateFor(habit.id, weekKeys, weekChecks);
			const metaEl = nameCell.createDiv({
				text: `··· ${Math.round(rate * 100)}%`,
				cls: 'habitude-habit-meta',
			});
			metaEls.set(habit.id, metaEl);
			const titleRow = nameCell.createDiv({ cls: 'habitude-title-row' });
			const openDetails = () => {
				new HabitDetailModal(
					this.app,
					store,
					this.deps.getDataFolder(),
					habit,
					this.deps.getAiConfig,
					() => void this.render(),
				).open();
			};
			// The habit title itself opens the details modal — the ⋯ menu stays
			// as the discoverable alternative (details + archive).
			titleRow.createDiv({
				text: habit.title,
				cls: 'habitude-habit-title habitude-habit-title-clickable',
				attr: { 'aria-label': t('checklist.habitDetails') },
			}).onclick = openDetails;
			const stage = habit.plan ? currentPhase(habit.plan, habit.planGenerated) : null;
			if (stage) {
				titleRow.createSpan({
					text: `D${stage.day} ${stage.phase.name}`,
					cls: 'habitude-phase-badge',
					attr: { 'aria-label': t('checklist.phaseBadgeAria', { name: stage.phase.name, day: String(stage.day) }) },
				});
			}
			const menuBtn = titleRow.createEl('button', {
				text: '\u22EF',
				cls: 'habitude-menu-btn',
				attr: { 'aria-label': t('checklist.habitOptions') },
			});
			menuBtn.onclick = (e) => {
				const menu = new Menu();
				menu.addItem((item) =>
					item.setTitle(t('checklist.habitDetails')).onClick(() => {
						openDetails();
					}),
				);
				menu.addItem((item) =>
					item.setTitle(t('checklist.archiveHabit')).onClick(() => {
						void store.archiveHabit(habit.id).then(() => {
							new Notice(t('checklist.habitArchived', { title: habit.title }));
							void this.render();
						});
					}),
				);
				menu.showAtMouseEvent(e);
			};
			const isBad = habit.type === 'bad';
			for (const key of weekKeys) {
				const td = tr.createEl('td', {
					cls: 'habitude-cell' + (key === todayKey() ? ' habitude-today' : ''),
				});
				const checked = weekChecks.get(key)?.has(habit.id) ?? false;
				const btn = td.createEl('button', {
					text: checked ? (isBad ? '🛡' : '✓') : '',
					cls: 'habitude-toggle' + (checked ? ' habitude-checked' : ''),
					attr: {
						'aria-label': isBad
							? t('checklist.resistToggleAria', { title: habit.title, date: key })
							: t('checklist.toggleAria', { title: habit.title, date: key }),
					},
				});
				btn.onclick = () => {
					void store
						.setCheck(key, habit.id, habit.title, !checked)
						.then(() => this.render())
						.catch(() => new Notice(t('checklist.saveCheckFailed')));
				};
			}
		}
	}

	/** Append one habit's local graphs (30-day strip + 8 weekly bars). */	private renderHabitGraphs(
		host: HTMLElement,
		habit: Habit,
		checksByDay: Map<string, Set<string>>,
	): void {
		const card = host.createDiv({ cls: 'habitude-graph-card' });
		const head = card.createDiv({ cls: 'habitude-graph-head' });
		head.createSpan({ text: habit.title, cls: 'habitude-graph-name' });
		head.createSpan({
			text: `🔥 ${streakFor(habit.id, checksByDay)}`,
			cls: 'habitude-graph-streak',
		});

		const today = todayKey();
		const stripDays: GraphDay[] = Array.from({ length: 30 }, (_, i) => {
			const key = addDays(today, -(29 - i));
			return { key, checked: checksByDay.get(key)?.has(habit.id) ?? false };
		});
		mountSvg(card, historyStripSvg(stripDays, `${habit.title}: last 30 days`));

		const weekRates: number[] = [];
		for (let w = 7; w >= 0; w--) {
			const wk = Array.from({ length: 7 }, (_, i) => addDays(today, -(w * 7 + (6 - i))));
			weekRates.push(weekRateFor(habit.id, wk, checksByDay));
		}
		mountSvg(card, weeklyBarsSvg(weekRates, `${habit.title}: weekly completion`));
	}

	async onClose(): Promise<void> {
		// nothing to clean up
	}
}

/**
 * Mount an SVG markup string into a host element without innerHTML: the
 * string is generated by our own graph builders (user text is XML-escaped
 * there), parsed as SVG, and imported as a DOM node.
 */
function mountSvg(host: HTMLElement, svg: string): void {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	const node = document.importNode(doc.documentElement, true);
	host.appendChild(node);
}
