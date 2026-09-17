// UI localization (en/ko) for plugin chrome: views, commands, settings,
// notices, and user-visible error strings.
//
// Scope: plugin UI only. The AI coach's *reply* language is a separate user
// setting ("Coach language" in settings) and is untouched by this module.
// The locale is detected from Obsidian's own UI language setting; there is
// no per-plugin language switch.

export type UiLocale = 'en' | 'ko';

type Dict = Record<string, string>;

const en: Dict = {
	// Views & ribbon
	'view.checklist.title': 'Habitude checklist',
	'view.coach.title': 'Habitude AI coach',
	'ribbon.checklist': 'Habitude checklist',
	'ribbon.coach': 'Habitude AI coach',
	'notice.cannotOpenChecklist': 'Could not open the checklist view.',
	'notice.cannotOpenCoach': 'Could not open the AI coach.',
	'statusbar.today': '✓ {done}/{total} today',

	// Commands
	'cmd.openChecklist': 'Open checklist',
	'cmd.openCoach': 'Open AI coach',
	'cmd.openWeeklyReview': 'Open weekly review',
	'cmd.toggleToday': 'Toggle today for a habit',
	'cmd.pickHabitPlaceholder': 'Pick a habit to toggle for today…',
	'cmd.noHabitsYet': 'No habits yet. Open the checklist to add one.',
	'cmd.toggledChecked': '{title}: checked for today',
	'cmd.toggledUnchecked': '{title}: unchecked for today',

	// Settings
	'settings.dataFolder.name': 'Data folder',
	'settings.dataFolder.desc': 'Vault folder for Habits.md and daily Log notes.',
	'settings.dataFolder.placeholder': 'Habitude',
	'settings.weekStart.name': 'Week starts on',
	'settings.weekStart.desc': 'First day of the week in the checklist grid.',
	'settings.weekStart.monday': 'Monday',
	'settings.weekStart.sunday': 'Sunday',
	'settings.apiKey.name': 'Gemini API key (AI coach, optional)',
	'settings.apiKey.desc':
		'Your own free Gemini key (Google AI Studio). Stored only on this device; sent only to Google AI, never to Habitude.',
	'settings.apiKey.savedPlaceholder': '•••••••• (key saved)',
	'settings.apiKey.emptyPlaceholder': 'Paste key to enable the AI coach',
	'settings.coachModel.name': 'Coach model',
	'settings.coachModel.desc': 'Model ID used by the AI coach.',
	'settings.coachLanguage.name': 'Coach language',
	'settings.coachLanguage.desc': 'Reply language for the AI coach.',
	'settings.coachLanguage.auto': 'Auto (match me)',
	'settings.coachLanguage.english': 'English',
	'settings.coachLanguage.korean': '한국어',
	'settings.sharing.name': 'Sharing',
	'settings.sharing.desc':
		'Sharing runs only when you tap the button. Only aggregate stats — habit titles, streaks, completion rates — are sent; your note contents are never included.',

	// Checklist view
	'checklist.weeklyReview': 'Weekly review',
	'checklist.newHabitPlaceholder': 'New habit… (enter to add)',
	'checklist.add': 'Add',
	'checklist.habitAdded': 'Habit added: {title}',
	'checklist.emptyTitle': 'No habits yet.',
	'checklist.emptyHint': 'Add your first habit above — e.g. "morning run".',
	'checklist.habitOptions': 'Habit options',
	'checklist.archiveHabit': 'Archive habit',
	'checklist.habitArchived': 'Habit archived: {title}',
	'checklist.saveCheckFailed': 'Could not save the check.',
	'checklist.progress': 'Progress',
	'checklist.shareProgress': '📤 Share progress',
	'checklist.shareNote':
		'Sharing runs only when you tap the button. Only aggregate stats — habit titles, streaks, completion rates — are sent; your note contents are never included.',
	'checklist.getCoaching': '✨ Get AI coaching',
	'checklist.footnote':
		'Your data stays in your vault as plain Markdown. Nothing leaves your device unless you explicitly share it.',
	'checklist.toggleAria': '{title} on {date}',

	// Coach view
	'coach.setupTitle': 'AI coach — free with your own key',
	'coach.setupDesc':
		'Bring a free Gemini API key and chat with a coach that knows your habits — your streaks, weekly rates, and weak days are shared with the model automatically as statistics.',
	'coach.setupStep1Prefix': 'Get a free key at ',
	'coach.setupStep1Link': 'Google AI Studio',
	'coach.setupStep1Suffix': '.',
	'coach.setupStep2':
		'Paste it below. It stays on this device — it is only ever sent to Google, never to Habitude.',
	'coach.keyPlaceholder': 'Paste Gemini API key',
	'coach.saveKey': 'Save key & start',
	'coach.pasteKeyFirst': 'Paste your Gemini API key first.',
	'coach.headerTitle': 'AI Coach',
	'coach.newChat': 'New chat',
	'coach.inputPlaceholder': 'Ask your coach…',
	'coach.send': 'Send',
	'coach.footnote': 'Your key and chats stay on this device. Requests go directly to Google AI.',
	'coach.removeKey': 'Remove key',
	'coach.addKeyFirst': 'Add your Gemini API key first.',
	'coach.thinking': 'Coach is thinking…',
	'coach.genericError': 'Something went wrong. Please try again.',
	'coach.fallbackGreeting': "Hi, I'm your Habitude Coach. What's on your mind?",

	// Weekly review modal
	'review.title': 'Weekly review',
	'review.empty': 'No habits yet. Add your first habit from the checklist view.',
	'review.totalChecks': 'Total checks this week: {total}',
	'review.perHabitMeta': '{rate}% · {checked}/{total} days · 🔥 {streak}',

	// Share
	'share.serverNotReady': 'Share server is not ready yet.',
	'share.linkCopied': 'Share link copied to clipboard.',
	'share.linkFallback': 'Share link: {url}',

	// User-visible coach (Gemini) errors
	'coach.error.rateLimit': 'Rate limit hit (free tier). Wait a minute and try again.',
	'coach.error.httpError': 'Google AI returned an error (status {status}). Please try again.',
	'coach.error.network': 'Could not reach Google AI. Check your connection. ({detail})',
	'coach.error.unreadable': 'Got an unreadable response from the model. Please try again.',
	'coach.error.authRejected':
		'That API key was rejected or lacks access. Double-check it in Settings → Habitude checklist.',
	'coach.error.authInvalid':
		'The API key is invalid or lacks access. Check it in Settings → Habitude checklist.',
	'coach.error.modelError': 'Model error: {detail}',
	'coach.error.emptyReply': 'The model returned an empty reply. Please try again.',

	// Date labels
	'dates.weekRange': '{sm} {sd} – {em} {ed}',
};

const ko: Dict = {
	// Views & ribbon
	'view.checklist.title': 'Habitude 체크리스트',
	'view.coach.title': 'Habitude AI 코치',
	'ribbon.checklist': 'Habitude 체크리스트',
	'ribbon.coach': 'Habitude AI 코치',
	'notice.cannotOpenChecklist': '체크리스트 보기를 열 수 없습니다.',
	'notice.cannotOpenCoach': 'AI 코치를 열 수 없습니다.',
	'statusbar.today': '✓ 오늘 {done}/{total}',

	// Commands
	'cmd.openChecklist': '체크리스트 열기',
	'cmd.openCoach': 'AI 코치 열기',
	'cmd.openWeeklyReview': '주간 리뷰 열기',
	'cmd.toggleToday': '오늘 체크 토글',
	'cmd.pickHabitPlaceholder': '오늘 체크할 습관 선택…',
	'cmd.noHabitsYet': '습관이 아직 없습니다. 체크리스트에서 추가하세요.',
	'cmd.toggledChecked': '{title}: 오늘 완료로 표시됨',
	'cmd.toggledUnchecked': '{title}: 오늘 미완료로 표시됨',

	// Settings
	'settings.dataFolder.name': '데이터 폴더',
	'settings.dataFolder.desc': 'Habits.md와 일별 Log 노트가 저장되는 볼트 폴더.',
	'settings.dataFolder.placeholder': 'Habitude',
	'settings.weekStart.name': '주 시작 요일',
	'settings.weekStart.desc': '체크리스트 그리드에서 한 주의 시작 요일.',
	'settings.weekStart.monday': '월요일',
	'settings.weekStart.sunday': '일요일',
	'settings.apiKey.name': 'Gemini API 키 (AI 코치, 선택)',
	'settings.apiKey.desc':
		'본인의 무료 Gemini 키(Google AI Studio). 이 기기에만 저장되며 Google AI에만 전송되고, Habitude로는 절대 전송되지 않습니다.',
	'settings.apiKey.savedPlaceholder': '•••••••• (키 저장됨)',
	'settings.apiKey.emptyPlaceholder': 'AI 코치를 켜려면 키를 붙여넣으세요',
	'settings.coachModel.name': '코치 모델',
	'settings.coachModel.desc': 'AI 코치가 사용하는 모델 ID.',
	'settings.coachLanguage.name': '코치 언어',
	'settings.coachLanguage.desc': 'AI 코치의 답변 언어.',
	'settings.coachLanguage.auto': '자동 (나와 맞춤)',
	'settings.coachLanguage.english': 'English',
	'settings.coachLanguage.korean': '한국어',
	'settings.sharing.name': '공유',
	'settings.sharing.desc':
		'공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',

	// Checklist view
	'checklist.weeklyReview': '주간 리뷰',
	'checklist.newHabitPlaceholder': '새 습관… (엔터로 추가)',
	'checklist.add': '추가',
	'checklist.habitAdded': '습관 추가됨: {title}',
	'checklist.emptyTitle': '습관이 아직 없습니다.',
	'checklist.emptyHint': '위에서 첫 습관을 추가하세요. 예: "아침 러닝".',
	'checklist.habitOptions': '습관 옵션',
	'checklist.archiveHabit': '습관 보관',
	'checklist.habitArchived': '습관 보관됨: {title}',
	'checklist.saveCheckFailed': '체크를 저장할 수 없습니다.',
	'checklist.progress': '진행 상황',
	'checklist.shareProgress': '📤 진행 상황 공유',
	'checklist.shareNote':
		'공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',
	'checklist.getCoaching': '✨ AI 코칭 받기',
	'checklist.footnote':
		'데이터는 볼트 안에 일반 Markdown으로 보관됩니다. 직접 공유하지 않는 한 기기 밖으로 나가지 않습니다.',
	'checklist.toggleAria': '{date}의 {title}',

	// Coach view
	'coach.setupTitle': 'AI 코치 — 본인 키로 무료 사용',
	'coach.setupDesc':
		'무료 Gemini API 키를 가져와 습관을 아는 코치와 대화하세요. 스트릭, 주간 완료율, 약한 요일 같은 통계가 모델에 자동으로 전달됩니다.',
	'coach.setupStep1Prefix': '',
	'coach.setupStep1Link': 'Google AI Studio',
	'coach.setupStep1Suffix': '에서 무료 키를 받으세요.',
	'coach.setupStep2':
		'아래에 붙여넣으세요. 이 기기에만 보관되며, Google에만 전송되고 Habitude로는 절대 전송되지 않습니다.',
	'coach.keyPlaceholder': 'Gemini API 키 붙여넣기',
	'coach.saveKey': '키 저장하고 시작',
	'coach.pasteKeyFirst': '먼저 Gemini API 키를 붙여넣으세요.',
	'coach.headerTitle': 'AI 코치',
	'coach.newChat': '새 대화',
	'coach.inputPlaceholder': '코치에게 물어보세요…',
	'coach.send': '전송',
	'coach.footnote': '키와 대화 내용은 이 기기에만 보관됩니다. 요청은 Google AI로 직접 전송됩니다.',
	'coach.removeKey': '키 삭제',
	'coach.addKeyFirst': '먼저 Gemini API 키를 추가하세요.',
	'coach.thinking': '코치가 생각 중…',
	'coach.genericError': '문제가 발생했습니다. 다시 시도하세요.',
	'coach.fallbackGreeting': '안녕하세요, Habitude 코치입니다. 무슨 고민이 있으세요?',

	// Weekly review modal
	'review.title': '주간 리뷰',
	'review.empty': '습관이 아직 없습니다. 체크리스트 보기에서 첫 습관을 추가하세요.',
	'review.totalChecks': '이번 주 총 체크: {total}',
	'review.perHabitMeta': '{rate}% · {checked}/{total}일 · 🔥 {streak}',

	// Share
	'share.serverNotReady': '공유 서버 준비 중',
	'share.linkCopied': '공유 링크가 클립보드에 복사되었습니다.',
	'share.linkFallback': '공유 링크: {url}',

	// User-visible coach (Gemini) errors
	'coach.error.rateLimit': '요청 한도에 도달했습니다(무료 등급). 1분 후 다시 시도하세요.',
	'coach.error.httpError': 'Google AI에서 오류가 발생했습니다(상태 {status}). 다시 시도하세요.',
	'coach.error.network': 'Google AI에 연결할 수 없습니다. 연결을 확인하세요. ({detail})',
	'coach.error.unreadable': '모델 응답을 읽을 수 없습니다. 다시 시도하세요.',
	'coach.error.authRejected':
		'이 API 키가 거부되었거나 접근 권한이 없습니다. 설정 → Habitude checklist에서 확인하세요.',
	'coach.error.authInvalid':
		'API 키가 유효하지 않거나 접근 권한이 없습니다. 설정 → Habitude checklist에서 확인하세요.',
	'coach.error.modelError': '모델 오류: {detail}',
	'coach.error.emptyReply': '모델이 빈 응답을 반환했습니다. 다시 시도하세요.',

	// Date labels
	'dates.weekRange': '{sm} {sd}일 – {em} {ed}일',
};

/** Raw dictionaries, exported for tests and tooling (parity checks, etc.). */
export const UI_STRINGS: Record<UiLocale, Dict> = { en, ko };

/** Test/dev override. Takes precedence over auto-detection until cleared. */
let override: UiLocale | null = null;

export function setUiLocale(locale: UiLocale): void {
	override = locale;
}

export function clearUiLocale(): void {
	override = null;
}

/**
 * Detect the UI locale from Obsidian's own language setting via the
 * getLanguage() API. Never throws: the API may be absent (node tests)
 * or access-restricted.
 */
export function getUiLocale(): UiLocale {
	if (override) return override;
	try {
		// getLanguage() is exposed globally by the Obsidian runtime.
		const getLang = (globalThis as { getLanguage?: unknown }).getLanguage;
		if (typeof getLang === 'function') {
			const lang = (getLang as () => string)();
			if (lang && lang.toLowerCase().startsWith('ko')) return 'ko';
		}
	} catch {
		// Absent or unreadable — fall through to English.
	}
	return 'en';
}

/**
 * Translate a key for the current UI locale. Falls back to English, then to
 * the key itself. Supports {name} interpolation via `vars`.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	const locale = getUiLocale();
	let s = UI_STRINGS[locale][key] ?? UI_STRINGS.en[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			s = s.split(`{${k}}`).join(String(v));
		}
	}
	return s;
}
