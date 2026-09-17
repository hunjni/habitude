// 7-day checklist ItemView: habits × days grid with click-to-toggle cells,
// local progress graphs, and an opt-in share button.

import { ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import type { HabitStore } from '../store';
import type { Habit } from '../types';
import { COACHING_URL } from '../types';
import { recentKeys, streakFor, weekRateFor } from '../stats';
import { historyStripSvg, weeklyBarsSvg, type GraphDay } from '../graphs';
import { shareFromStore } from '../share';
import { ReviewModal } from './review-modal';
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
	getPluginVersion: () => string;
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
		return 'Habitude checklist';
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
		const reviewBtn = header.createEl('button', { text: 'Weekly review', cls: 'habitude-review-btn' });
		reviewBtn.onclick = () => new ReviewModal(this.app, store, weekKeys).open();

		// Add-habit row
		const addRow = container.createDiv({ cls: 'habitude-add-row' });
		const input = addRow.createEl('input', {
			cls: 'habitude-add-input',
			attr: { placeholder: 'New habit… (enter to add)', type: 'text' },
		});
		const addBtn = addRow.createEl('button', { text: 'Add', cls: 'habitude-add-btn' });
		const doAdd = async () => {
			const title = input.value.trim();
			if (!title) return;
			await store.addHabit(title);
			new Notice(`Habit added: ${title}`);
			void this.render();
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
			empty.createEl('p', { text: 'No habits yet.' });
			empty.createEl('p', { text: 'Add your first habit above — e.g. "morning run".' });
		}

		// Grid
		const table = container.createEl('table', { cls: 'habitude-grid' });
		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		headRow.createEl('th', { text: '', cls: 'habitude-col-habit' });
		for (const key of weekKeys) {
			const th = headRow.createEl('th', { cls: 'habitude-col-day' + (key === todayKey() ? ' habitude-today' : '') });
			th.createDiv({ text: dayLabel(key), cls: 'habitude-day-name' });
			th.createDiv({ text: dayNumber(key), cls: 'habitude-day-num' });
		}

		const metaEls = new Map<string, HTMLElement>();
		const tbody = table.createEl('tbody');
		for (const habit of habits) {
			const tr = tbody.createEl('tr');
			const nameCell = tr.createEl('td', { cls: 'habitude-habit-cell' });
			const rate = weekRateFor(habit.id, weekKeys, weekChecks);
			const metaEl = nameCell.createDiv({
				text: `··· ${Math.round(rate * 100)}%`,
				cls: 'habitude-habit-meta',
			});
			metaEls.set(habit.id, metaEl);
			const titleRow = nameCell.createDiv({ cls: 'habitude-title-row' });
			titleRow.createDiv({ text: habit.title, cls: 'habitude-habit-title' });
			const menuBtn = titleRow.createEl('button', {
				text: '\u22EF',
				cls: 'habitude-menu-btn',
				attr: { 'aria-label': 'Habit options' },
			});
			menuBtn.onclick = (e) => {
				const menu = new Menu();
				menu.addItem((item) =>
					item.setTitle('Archive habit').onClick(() => {
						void store.archiveHabit(habit.id).then(() => {
							new Notice('Habit archived: ' + habit.title);
							void this.render();
						});
					}),
				);
				menu.showAtMouseEvent(e);
			};
			for (const key of weekKeys) {
				const td = tr.createEl('td', {
					cls: 'habitude-cell' + (key === todayKey() ? ' habitude-today' : ''),
				});
				const checked = weekChecks.get(key)?.has(habit.id) ?? false;
				const btn = td.createEl('button', {
					text: checked ? '✓' : '',
					cls: 'habitude-toggle' + (checked ? ' habitude-checked' : ''),
					attr: { 'aria-label': `${habit.title} on ${key}` },
				});
				btn.onclick = () => {
					void store
						.setCheck(key, habit.id, habit.title, !checked)
						.then(() => this.render())
						.catch(() => new Notice('Could not save the check.'));
				};
			}
		}

		// Graphs section: populated asynchronously once 60 days of checks load.
		// 100% local SVG rendering — no network involved.
		const graphsSection = container.createDiv({ cls: 'habitude-graphs' });
		graphsSection.createEl('h3', { text: 'Progress', cls: 'habitude-graphs-title' });
		const graphsBody = graphsSection.createDiv({ cls: 'habitude-graphs-body' });

		// Share row: explicit opt-in button. Nothing is sent unless clicked.
		const shareRow = graphsSection.createDiv({ cls: 'habitude-share-row' });
		const shareBtn = shareRow.createEl('button', {
			text: '📤 Share progress',
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
			text: '공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',
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

		// Footer: the only funnel bridge — a plain external link. No API, no token.
		const footer = container.createDiv({ cls: 'habitude-footer' });
		const coachBtn = footer.createEl('button', { text: '✨ Get AI coaching', cls: 'habitude-coach-btn' });
		coachBtn.onclick = () => window.open(COACHING_URL, '_blank', 'noopener');
		footer.createEl('p', {
			text: 'Your data stays in your vault as plain Markdown. Nothing leaves your device unless you explicitly share it.',
			cls: 'habitude-footnote',
		});
	}

	/** Append one habit's local graphs (30-day strip + 8 weekly bars). */
	private renderHabitGraphs(
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
