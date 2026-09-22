// Tests for the UI i18n layer (src/i18n.ts).
//
// Covers: locale auto-detection (incl. no-getLanguage and throwing
// getLanguage), manual override, en/ko translation, {var} interpolation,
// English fallback when a ko string is missing, and en/ko key parity.
//
// Build & run:
//   esbuild test/i18n/i18n-test.ts --bundle --platform=node \
//     --alias:obsidian=./test/stress/mock-obsidian.ts \
//     --outfile=test/i18n/dist/i18n-test.cjs --format=cjs --log-level=warning \
//   && node test/i18n/dist/i18n-test.cjs

import {
	clearUiLocale,
	getUiLocale,
	setUiLocale,
	t,
	UI_STRINGS,
	type UiLocale,
} from '../../src/i18n';

let failures = 0;

function check(name: string, cond: boolean, extra = ''): void {
	if (cond) {
		console.log(`  PASS ${name}${extra}`);
	} else {
		failures++;
		console.log(`  FAIL ${name}${extra}`);
	}
}

function stubGetLanguage(fn: () => string | null): void {
	(globalThis as Record<string, unknown>).window = { getLanguage: fn };
}

function removeGetLanguage(): void {
	delete (globalThis as Record<string, unknown>).window;
}

function testDetection(): void {
	console.log('detection');
	removeGetLanguage();
	clearUiLocale();
	check('no getLanguage -> en', getUiLocale() === 'en');

	stubGetLanguage(() => 'ko');
	clearUiLocale();
	check('language=ko -> ko', getUiLocale() === 'ko');

	stubGetLanguage(() => 'ko-KR');
	clearUiLocale();
	check('language=ko-KR -> ko', getUiLocale() === 'ko');

	stubGetLanguage(() => 'en-US');
	clearUiLocale();
	check('language=en-US -> en', getUiLocale() === 'en');

	stubGetLanguage(() => 'zh');
	clearUiLocale();
	check('language=zh -> zh', getUiLocale() === 'zh');

	stubGetLanguage(() => 'zh-CN');
	clearUiLocale();
	check('language=zh-CN -> zh', getUiLocale() === 'zh');

	stubGetLanguage(() => null);
	clearUiLocale();
	check('language=null -> en', getUiLocale() === 'en');

	stubGetLanguage(() => {
		throw new Error('denied');
	});
	clearUiLocale();
	check('throwing getLanguage -> en (no throw)', getUiLocale() === 'en');

	removeGetLanguage();
}

function testOverride(): void {
	console.log('override');
	removeGetLanguage();
	setUiLocale('ko');
	check('override ko wins', getUiLocale() === 'ko');
	check('t() uses override', t('checklist.add') === '추가');
	setUiLocale('en');
	check('override en wins', t('checklist.add') === 'Add');
	clearUiLocale();
	check('clear restores auto-detect (en in node)', getUiLocale() === 'en');
}

function testTranslation(): void {
	console.log('translation');
	removeGetLanguage();
	clearUiLocale();

	setUiLocale('en');
	check('en string', t('checklist.weeklyReview') === 'Weekly review');
	check('en interpolation', t('cmd.toggledChecked', { title: 'Run' }) === 'Run: checked for today');
	check(
		'en multi-var interpolation',
		t('review.perHabitMeta', { rate: 50, checked: 3, total: 7, streak: 4 }) ===
			'50% · 3/7 days · 🔥 4',
	);

	setUiLocale('ko');
	check('ko string', t('checklist.weeklyReview') === '주간 리뷰');
	check('ko interpolation', t('cmd.toggledChecked', { title: '러닝' }) === '러닝: 오늘 완료로 표시됨');
	check(
		'ko multi-var interpolation',
		t('review.perHabitMeta', { rate: 50, checked: 3, total: 7, streak: 4 }) ===
			'50% · 3/7일 · 🔥 4',
	);
	check('ko keeps original share notice', t('share.serverNotReady') === '공유 서버 준비 중');

	setUiLocale('zh');
	check('zh string', t('checklist.weeklyReview') === '周回顾');
	check('zh provider label', t('settings.provider.deepseek') === 'DeepSeek');
	check('zh provider label qwen', t('settings.provider.qwen') === '通义千问（阿里云百炼）');
	check(
		'zh multi-var interpolation',
		t('review.perHabitMeta', { rate: 50, checked: 3, total: 7, streak: 4 }) ===
			'50% · 3/7 天 · 🔥 4',
	);
	check('zh habit type bad', t('checklist.habitTypeBad') === '坏习惯——我想要抵抗它');
	clearUiLocale();
}

function testFallback(): void {
	console.log('fallback');
	removeGetLanguage();
	setUiLocale('ko');

	// Temporarily drop a ko string: t() must fall back to English, and the
	// dictionaries must be restored afterwards.
	const koDict = UI_STRINGS.ko as Record<string, string>;
	const saved = koDict['checklist.add'] as string;
	delete koDict['checklist.add'];
	check('missing ko -> english fallback', t('checklist.add') === 'Add');
	koDict['checklist.add'] = saved;
	check('dict restored', t('checklist.add') === '추가');

	check('unknown key -> key itself', t('no.such.key') === 'no.such.key');
	clearUiLocale();
}

function testParity(): void {
	console.log('parity');
	const enKeys = Object.keys(UI_STRINGS.en).sort();
	const koKeys = Object.keys(UI_STRINGS.ko).sort();
	const zhKeys = Object.keys(UI_STRINGS.zh).sort();
	check('en has keys', enKeys.length > 50, ` (${enKeys.length} keys)`);
	check(
		'ko covers every en key',
		enKeys.every((k) => k in UI_STRINGS.ko),
		` (missing: ${enKeys.filter((k) => !(k in UI_STRINGS.ko)).join(', ') || 'none'})`,
	);
	check(
		'no ko-only keys',
		koKeys.every((k) => k in UI_STRINGS.en),
		` (extra: ${koKeys.filter((k) => !(k in UI_STRINGS.en)).join(', ') || 'none'})`,
	);
	check(
		'zh covers every en key',
		enKeys.every((k) => k in UI_STRINGS.zh),
		` (missing: ${enKeys.filter((k) => !(k in UI_STRINGS.zh)).join(', ') || 'none'})`,
	);
	check(
		'no zh-only keys',
		zhKeys.every((k) => k in UI_STRINGS.en),
		` (extra: ${zhKeys.filter((k) => !(k in UI_STRINGS.en)).join(', ') || 'none'})`,
	);
	const locales: UiLocale[] = ['en', 'ko', 'zh'];
	// Keys intentionally empty in a locale (ko puts the link first in the
	// setup step, so the prefix is empty there).
	const emptyOk = new Set(['ko:coach.setupStep1Prefix']);
	for (const locale of locales) {
		const empty = enKeys.filter((k) => !UI_STRINGS[locale][k] && !emptyOk.has(`${locale}:${k}`));
		check(`${locale}: no empty strings`, empty.length === 0, empty.length ? ` (${empty.join(', ')})` : '');
	}
}

async function main(): Promise<void> {
	testDetection();
	testOverride();
	testTranslation();
	testFallback();
	testParity();
	if (failures > 0) {
		console.log(`\n${failures} check(s) FAILED`);
		process.exit(1);
	}
	console.log('\nAll i18n checks passed.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
