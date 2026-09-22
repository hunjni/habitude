// Date helpers. All dates are local-time YYYY-MM-DD keys.

import { getUiLocale, t, type UiLocale } from '../i18n';

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

const DAY_NAMES: Record<UiLocale, string[]> = {
	en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
	ko: ['일', '월', '화', '수', '목', '금', '토'],
	zh: ['日', '一', '二', '三', '四', '五', '六'],
};
const MONTH_NAMES: Record<UiLocale, string[]> = {
	en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
	ko: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
	zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};

export function dayLabel(key: string): string {
	return DAY_NAMES[getUiLocale()][parseDateKey(key).getDay()] ?? '';
}

export function dayNumber(key: string): string {
	return String(parseDateKey(key).getDate());
}

export function weekRangeLabel(weekStartKey: string): string {
	const locale = getUiLocale();
	const s = parseDateKey(weekStartKey);
	const e = parseDateKey(addDays(weekStartKey, 6));
	return t('dates.weekRange', {
		sm: MONTH_NAMES[locale][s.getMonth()] ?? '',
		sd: s.getDate(),
		em: MONTH_NAMES[locale][e.getMonth()] ?? '',
		ed: e.getDate(),
	});
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
