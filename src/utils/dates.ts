// Date helpers. All dates are local-time YYYY-MM-DD keys.

export function toDateKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function todayKey(): string {
	return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
	const parts = key.split('-').map(Number);
	const y = parts[0] ?? 1970;
	const m = parts[1] ?? 1;
	const d = parts[2] ?? 1;
	return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
	const d = parseDateKey(key);
	d.setDate(d.getDate() + n);
	return toDateKey(d);
}

/** Monday-first (1) or Sunday-first (0) week containing the given date key. */
export function startOfWeek(dateKey: string, weekStart: 0 | 1): string {
	const d = parseDateKey(dateKey);
	const dow = d.getDay(); // 0 = Sunday
	const diff = (dow - weekStart + 7) % 7;
	d.setDate(d.getDate() - diff);
	return toDateKey(d);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function dayLabel(key: string): string {
	return DAY_NAMES[parseDateKey(key).getDay()] ?? '';
}

export function dayNumber(key: string): string {
	return String(parseDateKey(key).getDate());
}

export function weekRangeLabel(weekStartKey: string): string {
	const s = parseDateKey(weekStartKey);
	const e = parseDateKey(addDays(weekStartKey, 6));
	return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}`;
}

/** URL-safe id from a habit title. */
export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9가-힣]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || `habit-${Date.now().toString(36)}`;
}
