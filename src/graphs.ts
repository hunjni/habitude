// Local progress graphs, rendered as inline SVG. 100% offline: these are
// pure functions over check data — no network, no external assets. Colors
// use Obsidian CSS variables so the graphs follow the user's theme.

export interface GraphDay {
	/** YYYY-MM-DD */
	key: string;
	checked: boolean;
}

/** Escape text for safe embedding inside SVG markup. */
export function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const CHECKED_FILL = 'var(--interactive-accent)';
const EMPTY_FILL = 'var(--background-modifier-border-hover, var(--background-modifier-border))';
const TEXT_FILL = 'var(--text-muted)';

/**
 * 30-day history strip: one rounded cell per day, filled when the habit was
 * checked. Oldest day on the left.
 */
export function historyStripSvg(days: GraphDay[], label: string): string {
	const cell = 14;
	const gap = 4;
	const w = days.length * (cell + gap) - gap;
	const h = 22;
	const rects = days
		.map((d, i) => {
			const x = i * (cell + gap);
			const fill = d.checked ? CHECKED_FILL : EMPTY_FILL;
			return `<rect x="${x}" y="4" width="${cell}" height="${cell}" rx="4" fill="${fill}"><title>${escapeXml(d.key)}${d.checked ? ' ✓' : ''}</title></rect>`;
		})
		.join('');
	return (
		`<svg class="habitude-graph-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" ` +
		`role="img" aria-label="${escapeXml(label)}"><title>${escapeXml(label)}</title>${rects}</svg>`
	);
}

/**
 * Weekly completion bars for the trailing `weekRates` (oldest week left,
 * 0..1 each), with a % label under each bar.
 */
export function weeklyBarsSvg(weekRates: number[], label: string): string {
	const n = weekRates.length;
	const barW = 26;
	const gap = 10;
	const h = 64;
	const labelH = 16;
	const w = n * (barW + gap) - gap;
	const maxBarH = h - labelH - 6;
	const bars = weekRates
		.map((r, i) => {
			const rate = Math.min(1, Math.max(0, r));
			const bh = Math.max(3, Math.round(rate * maxBarH));
			const x = i * (barW + gap);
			const y = h - labelH - bh;
			const pct = Math.round(rate * 100);
			return (
				`<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${CHECKED_FILL}">` +
				`<title>Week ${i + 1}: ${pct}%</title></rect>` +
				`<text x="${x + barW / 2}" y="${h - 3}" text-anchor="middle" font-size="10" fill="${TEXT_FILL}">${pct}%</text>`
			);
		})
		.join('');
	return (
		`<svg class="habitude-graph-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" ` +
		`role="img" aria-label="${escapeXml(label)}"><title>${escapeXml(label)}</title>${bars}</svg>`
	);
}
