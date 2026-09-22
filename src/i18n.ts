// UI localization (en/ko) for plugin chrome: views, commands, settings,
// notices, and user-visible error strings.
//
// Scope: plugin UI only. The AI coach's *reply* language is a separate user
// setting ("Coach language" in settings) and is untouched by this module.
// The locale is detected from Obsidian's own UI language setting; there is
// no per-plugin language switch.

export type UiLocale = 'en' | 'ko' | 'zh';

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
	'settings.checkmarkColor.name': 'Checkmark color',
	'settings.checkmarkColor.desc':
		'Color of the ✓ mark on checked days. Open checklists update immediately.',
	'settings.provider.name': 'AI provider',
	'settings.provider.desc':
		'Which LLM service the AI coach talks to. Your key and chats are sent only to this provider — never to Habitude.',
	'settings.provider.gemini': 'Google Gemini',
	'settings.provider.openai': 'OpenAI',
	'settings.provider.anthropic': 'Anthropic Claude',
	'settings.provider.openrouter': 'OpenRouter',
	'settings.provider.ollama': 'Ollama (local)',
	'settings.provider.lmstudio': 'LM Studio (local)',
	'settings.provider.deepseek': 'DeepSeek',
	'settings.provider.qwen': 'Qwen (Alibaba Cloud)',
	'settings.provider.kimi': 'Kimi (Moonshot)',
	'settings.provider.zhipu': 'Zhipu GLM',
	'settings.provider.siliconflow': 'SiliconFlow',
	'settings.provider.doubao': 'Doubao (Volcengine)',
	'settings.provider.opencodego': 'OpenCode Go',
	'settings.provider.custom': 'Custom (OpenAI-compatible)',
	'settings.llmKey.name': 'API key (AI coach, optional)',
	'settings.llmKey.desc':
		'Your own key for the selected AI provider. Stored only on this device; sent only to that provider, never to Habitude.',
	'settings.llmKey.noKeyDesc':
		'No key needed — the selected provider runs on your own machine. Any key saved here is ignored.',
	'settings.llmKey.savedPlaceholder': '•••••••• (key saved)',
	'settings.llmKey.emptyPlaceholder': 'Paste key to enable the AI coach',
	'settings.llmModel.name': 'Coach model',
	'settings.llmModel.desc': 'Model used by the AI coach. Pick from presets, or press the button to fetch the live model list from the provider.',
	'settings.fetchModels': 'Fetch model list',
	'settings.fetchModels.loading': 'Fetching model list…',
	'settings.fetchModels.done': 'Fetched {count} models.',
	'settings.fetchModels.fail': 'Could not fetch models: {detail}',
	'settings.fetchModels.needKey': 'Paste an API key first.',
	'settings.fetchModels.needUrl': 'No API base URL configured.',
	'settings.fetchModels.empty': 'The provider returned no models.',
	'settings.baseUrl.name': 'API base URL',
	'settings.baseUrl.desc': 'Optional override for the provider endpoint. Empty uses the provider default.',
	'settings.baseUrl.requiredDesc':
		'Required for the custom provider — the base URL of your OpenAI-compatible endpoint.',
	'settings.baseUrl.placeholder': 'Default: {url}',
	'settings.coachLanguage.name': 'Coach language',
	'settings.coachLanguage.desc': 'Reply language for the AI coach.',
	'settings.coachLanguage.auto': 'Auto (match me)',
	'settings.uiLanguage.name': 'Plugin language',
	'settings.uiLanguage.desc':
		'UI language for this plugin. "Auto" follows the Obsidian interface language.',
	'settings.uiLanguage.auto': 'Auto (follow Obsidian)',
	'settings.uiLanguage.english': 'English',
	'settings.uiLanguage.korean': '한국어',
	'settings.uiLanguage.chinese': '简体中文',
	'settings.coachLanguage.english': 'English',
	'settings.coachLanguage.korean': '한국어',
	'settings.coachLanguage.chinese': '中文',
	'settings.sharing.name': 'Sharing',
	'settings.sharing.desc':
		'Sharing runs only when you tap the button. Only aggregate stats — habit titles, streaks, completion rates — are sent; your note contents are never included.',

	// Checklist view
	'checklist.weeklyReview': 'Weekly review',
	'checklist.newHabitPlaceholder': 'New habit… (press Enter to continue)',
	'checklist.add': 'Add',
	'checklist.habitAdded': 'Habit added: {title}',
	'checklist.addHabitTitle': 'Add habit',
	'checklist.habitTitleLabel': 'Habit',
	'checklist.addHabitPlaceholder': 'e.g. morning run',
	'checklist.habitTypeLabel': 'Type',
	'checklist.habitTypeGood': 'Good habit — I want to do it',
	'checklist.habitTypeBad': 'Bad habit — I want to resist it',
	'checklist.emptyTitle': 'No habits yet.',
	'checklist.emptyHint': 'Add your first habit above — e.g. "morning run".',
	'checklist.habitOptions': 'Habit options',
	'checklist.habitDetails': 'Habit details',
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
	'checklist.resistToggleAria': 'Resisted {title} on {date}',
	'checklist.sectionGood': 'Good habits',
	'checklist.sectionBad': 'Bad habits — resisting',
	'checklist.phaseBadgeAria': 'Plan stage {name}, day {day}',

	// Coach view
	'coach.setupTitle': 'AI coach — bring your own key',
	'coach.setupDesc':
		'Pick an AI provider and chat with a coach that knows your habits — your streaks, weekly rates, and weak days are shared with the model automatically as statistics.',
	'coach.setupStep1Prefix': 'Get a free key at ',
	'coach.setupStep1Link': 'Google AI Studio',
	'coach.setupStep1Suffix': '.',
	'coach.setupStep2':
		'Paste it below. It stays on this device — it is only ever sent to Google, never to Habitude.',
	'coach.keyPlaceholder': 'Paste API key',
	'coach.saveKey': 'Save & start',
	'coach.pasteKeyFirst': 'Paste your API key first.',
	'coach.getKeyLink': 'Get a key',
	'coach.noKeyNeeded': 'No key needed — the selected provider runs locally on this device.',
	'coach.headerTitle': 'AI Coach',
	'coach.newChat': 'New chat',
	'coach.inputPlaceholder': 'Ask your coach…',
	'coach.send': 'Send',
	'coach.footnote': 'Your key and chats stay on this device. Requests go directly to {provider}.',
	'coach.removeKey': 'Remove key',
	'coach.addKeyFirst': 'Add your API key first.',
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

	// AI generation & habit detail
	'common.cancel': 'Cancel',
	'addHabit.aiToggle': 'Generate knowledge cards & plan with AI',
	'addHabit.aiUnavailable': 'AI is not configured yet — pick a provider and paste an API key in Settings → Habitude checklist.',
	'ai.noApiKey':
		'No AI provider configured. Add an API key in settings to enable AI generation.',
	'ai.confirmTitle': 'Generate with AI',
	'ai.confirmBody':
		'Knowledge cards and an execution plan will be generated for "{title}". The request goes directly to {provider}; habit information is sent to it. Continue?',
	'ai.confirmOk': 'Generate',
	'ai.generating': 'Generating knowledge cards & plan…',
	'ai.generated': 'Generated {cards} knowledge cards and an execution plan.',
	'ai.generateFailed': 'AI generation failed: {detail}',
	'detail.typeGood': 'Good habit',
	'detail.typeBad': 'Bad habit',
	'detail.planSection': 'Execution plan',
	'detail.planEmpty': 'No plan yet. Generate one with the button below.',
	'detail.planEdit': 'Edit plan',
	'detail.planSave': 'Save plan',
	'detail.planFieldMicroHabit': 'Micro-habit',
	'detail.planFieldTriggerCue': 'Trigger cue',
	'detail.planFieldExecutionTime': 'Execution time',
	'detail.planFieldLocation': 'Location',
	'detail.planFieldEnvironmentDesign': 'Environment design',
	'detail.planFieldImmediateReward': 'Immediate reward',
	'detail.planPhasesLabel': 'Phases (one per line: name | days | focus)',
	'detail.knowledgeSection': 'Knowledge cards',
	'detail.knowledgeEmpty': 'No knowledge cards yet.',
	'detail.regenerate': '🔄 Regenerate with AI',
	'detail.linkLabel': 'Related notes',
	'detail.linkPlaceholder': '[[note name]] (comma-separate multiple)',
	'detail.linkAdd': 'Link',
	'detail.linkRemove': 'Remove link',
	'detail.openCardAria': 'Open {title}',
	'review.perHabitBad': '{checked}/{total} days resisted',
	'review.aiButton': '✨ AI review',
	'review.aiConfirmTitle': 'AI review',
	'review.aiConfirmBody':
		"This week's aggregated habit statistics will be sent to {provider} — statistics only, never note contents. Continue?",
	'review.aiRunning': 'Coach is reviewing…',
	'review.aiResult': 'AI review',
	'review.periodWeek': 'this week',
	'urge.sectionTitle': 'Urge log',
	'urge.recordTitle': 'Record urge',
	'urge.record': 'Record urge',
	'urge.recordSlip': '💔 Record a slip',
	'urge.timeLabel': 'Time',
	'urge.situationLabel': 'Situation / trigger',
	'urge.situationPlaceholder': 'e.g. lying in bed scrolling before sleep',
	'urge.intensityLabel': 'Intensity (1-10)',
	'urge.copingLabel': 'What you did',
	'urge.copingPlaceholder': 'e.g. put the phone away and read instead',
	'urge.outcomeLabel': 'Outcome',
	'urge.outcomeResisted': 'Resisted',
	'urge.outcomeSlip': 'Gave in (slip)',
	'urge.save': 'Save',
	'urge.saved': 'Urge entry saved.',
	'urge.empty': 'No urge entries in the last 7 days.',
	'urge.daysSinceSlip': '{days}d since last slip',
	'urge.noSlipYet': 'never slipped',
	'urge.aiAnalyze': '🧠 Analyze urge patterns',
	'urge.aiConfirmTitle': 'Analyze urge patterns',
	'urge.aiConfirmBody':
		'{count} urge entries (last 30 days) will be sent to {provider}. Entries may contain sensitive personal context. Continue?',
	'urge.aiRunning': 'Analyzing urge patterns…',

	// User-visible coach errors
	'coach.error.rateLimit': 'Rate limit hit (free tier). Wait a minute and try again.',
	'coach.error.rateLimitDetail': 'Provider rejected the request (429): {detail}',
	'coach.error.httpError': '{provider} returned an error (status {status}). Please try again.',
	'coach.error.network': 'Could not reach the AI provider. Check your connection. ({detail})',
	'coach.error.unreadable': 'Got an unreadable response from the model. Please try again.',
	'coach.error.authRejected':
		'That API key was rejected or lacks access. Double-check it in Settings → Habitude checklist.',
	'coach.error.authInvalid':
		'The API key is invalid or lacks access. Check it in Settings → Habitude checklist.',
	'coach.error.modelError': 'Model error: {detail}',
	'coach.error.emptyReply': 'The model returned an empty reply. Please try again.',
	'coach.error.baseUrlRequired':
		'Set a base URL for the custom provider in Settings → Habitude checklist.',
	'coach.error.modelRequired':
		'Set a model ID for the custom provider in Settings → Habitude checklist.',

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
	'settings.checkmarkColor.name': '체크마크 색상',
	'settings.checkmarkColor.desc': '체크된 날짜의 ✓ 표시 색상. 변경하면 열린 체크리스트에 바로 반영됩니다.',
	'settings.provider.name': 'AI 제공자',
	'settings.provider.desc':
		'AI 코치가 대화할 LLM 서비스. 키와 대화 내용은 이 제공자에게만 전송되며 Habitude로는 절대 전송되지 않습니다.',
	'settings.provider.gemini': 'Google Gemini',
	'settings.provider.openai': 'OpenAI',
	'settings.provider.anthropic': 'Anthropic Claude',
	'settings.provider.openrouter': 'OpenRouter',
	'settings.provider.ollama': 'Ollama (로컬)',
	'settings.provider.lmstudio': 'LM Studio (로컬)',
	'settings.provider.deepseek': 'DeepSeek',
	'settings.provider.qwen': '큐웬 (알리바바 클라우드)',
	'settings.provider.kimi': '키미 (문샷 AI)',
	'settings.provider.zhipu': '즈푸 GLM',
	'settings.provider.siliconflow': '실리콘플로우',
	'settings.provider.doubao': '더바오 (볼케이노 엔진)',
	'settings.provider.opencodego': 'OpenCode Go',
	'settings.provider.custom': '사용자 지정 (OpenAI 호환)',
	'settings.llmKey.name': 'API 키 (AI 코치, 선택)',
	'settings.llmKey.desc':
		'선택한 AI 제공자의 본인 키. 이 기기에만 저장되며 해당 제공자에게만 전송되고 Habitude로는 절대 전송되지 않습니다.',
	'settings.llmKey.noKeyDesc': '키 불필요 — 선택한 제공자는 이 기기에서 직접 실행됩니다. 여기에 저장한 키는 무시됩니다.',
	'settings.llmKey.savedPlaceholder': '•••••••• (키 저장됨)',
	'settings.llmKey.emptyPlaceholder': 'AI 코치를 켜려면 키를 붙여넣으세요',
	'settings.llmModel.name': '코치 모델',
	'settings.llmModel.desc': 'AI 코치가 사용하는 모델. 프리셋에서 선택하거나 버튼으로 제공자의 실제 모델 목록을 가져오세요.',
	'settings.fetchModels': '모델 목록 가져오기',
	'settings.fetchModels.loading': '모델 목록 가져오는 중…',
	'settings.fetchModels.done': '{count}개 모델을 가져왔습니다.',
	'settings.fetchModels.fail': '모델 목록을 가져올 수 없습니다: {detail}',
	'settings.fetchModels.needKey': '먼저 API 키를 입력하세요.',
	'settings.fetchModels.needUrl': 'API Base URL이 설정되지 않았습니다.',
	'settings.fetchModels.empty': '제공자가 모델을 반환하지 않았습니다.',
	'settings.baseUrl.name': 'API Base URL',
	'settings.baseUrl.desc': '제공자 엔드포인트 재정의(선택). 비워 두면 제공자 기본값을 사용합니다.',
	'settings.baseUrl.requiredDesc': '사용자 지정 제공자는 필수 — OpenAI 호환 엔드포인트의 Base URL을 입력하세요.',
	'settings.baseUrl.placeholder': '기본값: {url}',
	'settings.coachLanguage.name': '코치 언어',
	'settings.coachLanguage.desc': 'AI 코치의 답변 언어.',
	'settings.coachLanguage.auto': '자동 (나와 맞춤)',
	'settings.uiLanguage.name': '플러그인 언어',
	'settings.uiLanguage.desc': '이 플러그인의 UI 언어. 자동은 Obsidian 인터페이스 언어를 따릅니다.',
	'settings.uiLanguage.auto': '자동 (Obsidian 따르기)',
	'settings.uiLanguage.english': 'English',
	'settings.uiLanguage.korean': '한국어',
	'settings.uiLanguage.chinese': '简体中文',
	'settings.coachLanguage.english': 'English',
	'settings.coachLanguage.korean': '한국어',
	'settings.coachLanguage.chinese': '中文',
	'settings.sharing.name': '공유',
	'settings.sharing.desc':
		'공유하기는 사용자가 직접 누를 때만 동작하며, 전송되는 데이터는 습관 제목·스트릭·완료율 같은 집계 통계뿐이고 노트 내용은 포함되지 않습니다.',

	// Checklist view
	'checklist.weeklyReview': '주간 리뷰',
	'checklist.newHabitPlaceholder': '새 습관… (엔터로 계속)',
	'checklist.add': '추가',
	'checklist.habitAdded': '습관 추가됨: {title}',
	'checklist.addHabitTitle': '습관 추가',
	'checklist.habitTitleLabel': '습관',
	'checklist.addHabitPlaceholder': '예: 아침 러닝',
	'checklist.habitTypeLabel': '유형',
	'checklist.habitTypeGood': '좋은 습관 — 하고 싶은 습관',
	'checklist.habitTypeBad': '나쁜 습관 — 이겨내고 싶은 습관',
	'checklist.emptyTitle': '습관이 아직 없습니다.',
	'checklist.emptyHint': '위에서 첫 습관을 추가하세요. 예: "아침 러닝".',
	'checklist.habitOptions': '습관 옵션',
	'checklist.habitDetails': '습관 상세',
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
	'checklist.resistToggleAria': '{date}에 {title} 이겨냄',
	'checklist.sectionGood': '좋은 습관',
	'checklist.sectionBad': '나쁜 습관 — 이겨내는 중',
	'checklist.phaseBadgeAria': '플랜 단계 {name}, {day}일차',

	// Coach view
	'coach.setupTitle': 'AI 코치 — 본인 키로 사용',
	'coach.setupDesc':
		'AI 제공자를 선택하고 습관을 아는 코치와 대화하세요. 스트릭, 주간 완료율, 약한 요일 같은 통계가 모델에 자동으로 전달됩니다.',
	'coach.setupStep1Prefix': '',
	'coach.setupStep1Link': 'Google AI Studio',
	'coach.setupStep1Suffix': '에서 무료 키를 받으세요.',
	'coach.setupStep2':
		'아래에 붙여넣으세요. 이 기기에만 보관되며, Google에만 전송되고 Habitude로는 절대 전송되지 않습니다.',
	'coach.keyPlaceholder': 'API 키 붙여넣기',
	'coach.saveKey': '저장하고 시작',
	'coach.pasteKeyFirst': '먼저 API 키를 붙여넣으세요.',
	'coach.getKeyLink': '키 발급받기',
	'coach.noKeyNeeded': '키가 필요 없습니다 — 선택한 제공자는 이 기기에서 로컬로 실행됩니다.',
	'coach.headerTitle': 'AI 코치',
	'coach.newChat': '새 대화',
	'coach.inputPlaceholder': '코치에게 물어보세요…',
	'coach.send': '전송',
	'coach.footnote': '키와 대화 내용은 이 기기에만 보관됩니다. 요청은 {provider}(으)로 직접 전송됩니다.',
	'coach.removeKey': '키 삭제',
	'coach.addKeyFirst': '먼저 API 키를 추가하세요.',
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

	// AI generation & habit detail
	'common.cancel': 'Cancel',
	'addHabit.aiToggle': 'AI로 지식 카드 & 실행 계획 생성',
	'addHabit.aiUnavailable': 'AI가 아직 구성되지 않았습니다 — 설정 → Habitude Checklist에서 제공자를 선택하고 API 키를 입력하세요.',
	'ai.noApiKey': 'AI 공급자가 설정되지 않았습니다. 설정에서 API 키를 추가하면 AI 생성을 사용할 수 있습니다.',
	'ai.confirmTitle': 'AI로 생성',
	'ai.confirmBody':
		'"{title}"에 대한 지식 카드와 실행 계획을 생성합니다. 요청은 {provider}(으)로 직접 전송되며 습관 정보가 함께 전달됩니다. 계속할까요?',
	'ai.confirmOk': '생성',
	'ai.generating': '지식 카드 & 실행 계획 생성 중…',
	'ai.generated': '지식 카드 {cards}장과 실행 계획을 생성했습니다.',
	'ai.generateFailed': 'AI 생성 실패: {detail}',
	'detail.typeGood': '좋은 습관',
	'detail.typeBad': '나쁜 습관',
	'detail.planSection': '실행 계획',
	'detail.planEmpty': '아직 계획이 없습니다. 아래 버튼으로 생성하세요.',
	'detail.planEdit': '계획 편집',
	'detail.planSave': '계획 저장',
	'detail.planFieldMicroHabit': '마이크로 습관',
	'detail.planFieldTriggerCue': '트리거 단서',
	'detail.planFieldExecutionTime': '실행 시간',
	'detail.planFieldLocation': '장소',
	'detail.planFieldEnvironmentDesign': '환경 설계',
	'detail.planFieldImmediateReward': '즉시 보상',
	'detail.planPhasesLabel': '단계 (한 줄에 하나: 이름 | 일수 | 초점)',
	'detail.knowledgeSection': '지식 카드',
	'detail.knowledgeEmpty': '아직 지식 카드가 없습니다.',
	'detail.regenerate': '🔄 AI로 다시 생성',
	'detail.linkLabel': '관련 노트',
	'detail.linkPlaceholder': '[[노트 이름]] (여러 개는 쉼표로)',
	'detail.linkAdd': '연결',
	'detail.linkRemove': '연결 제거',
	'detail.openCardAria': '{title} 열기',
	'review.perHabitBad': '{checked}/{total}일 저항',
	'review.aiButton': '✨ AI 리뷰',
	'review.aiConfirmTitle': 'AI 리뷰',
	'review.aiConfirmBody':
		'이번 주 집계된 습관 통계가 {provider}(으)로 전송됩니다 — 통계만 보내며 노트 내용은 포함되지 않습니다. 계속할까요?',
	'review.aiRunning': '코치가 리뷰 중…',
	'review.aiResult': 'AI 리뷰',
	'review.periodWeek': '이번 주',
	'urge.sectionTitle': '충동 로그',
	'urge.recordTitle': '충동 기록',
	'urge.record': '충동 기록',
	'urge.recordSlip': '💔 실수 기록',
	'urge.timeLabel': '시간',
	'urge.situationLabel': '상황 / 트리거',
	'urge.situationPlaceholder': '예: 자기 전에 누워서 휴대폰 보기',
	'urge.intensityLabel': '강도 (1-10)',
	'urge.copingLabel': '한 행동',
	'urge.copingPlaceholder': '예: 휴대폰을 내려놓고 책 읽기',
	'urge.outcomeLabel': '결과',
	'urge.outcomeResisted': '저항함',
	'urge.outcomeSlip': '넘어감 (실수)',
	'urge.save': '저장',
	'urge.saved': '충동 기록이 저장되었습니다.',
	'urge.empty': '최근 7일간 충동 기록이 없습니다.',
	'urge.daysSinceSlip': '마지막 실수 후 {days}일',
	'urge.noSlipYet': '아직 실수 없음',
	'urge.aiAnalyze': '🧠 충동 패턴 분석',
	'urge.aiConfirmTitle': '충동 패턴 분석',
	'urge.aiConfirmBody':
		'최근 30일의 충동 기록 {count}건이 {provider}(으)로 전송됩니다. 기록에는 민감한 개인 맥락이 포함될 수 있습니다. 계속할까요?',
	'urge.aiRunning': '충동 패턴 분석 중…',

	// User-visible coach errors
	'coach.error.rateLimit': '요청 한도에 도달했습니다(무료 등급). 1분 후 다시 시도하세요.',
	'coach.error.rateLimitDetail': '제공자가 요청을 거부했습니다(429): {detail}',
	'coach.error.httpError': '{provider}에서 오류가 발생했습니다(상태 {status}). 다시 시도하세요.',
	'coach.error.network': 'AI 제공자에 연결할 수 없습니다. 연결을 확인하세요. ({detail})',
	'coach.error.unreadable': '모델 응답을 읽을 수 없습니다. 다시 시도하세요.',
	'coach.error.authRejected':
		'이 API 키가 거부되었거나 접근 권한이 없습니다. 설정 → Habitude checklist에서 확인하세요.',
	'coach.error.authInvalid':
		'API 키가 유효하지 않거나 접근 권한이 없습니다. 설정 → Habitude checklist에서 확인하세요.',
	'coach.error.modelError': '모델 오류: {detail}',
	'coach.error.emptyReply': '모델이 빈 응답을 반환했습니다. 다시 시도하세요.',
	'coach.error.baseUrlRequired': '설정 → Habitude checklist에서 사용자 지정 제공자의 Base URL을 입력하세요.',
	'coach.error.modelRequired': '설정 → Habitude checklist에서 사용자 지정 제공자의 모델 ID를 입력하세요.',

	// Date labels
	'dates.weekRange': '{sm} {sd}일 – {em} {ed}일',
};

const zh: Dict = {
	// Views & ribbon
	'view.checklist.title': 'Habitude 习惯清单',
	'view.coach.title': 'Habitude AI 教练',
	'ribbon.checklist': 'Habitude 习惯清单',
	'ribbon.coach': 'Habitude AI 教练',
	'notice.cannotOpenChecklist': '无法打开习惯清单视图。',
	'notice.cannotOpenCoach': '无法打开 AI 教练。',
	'statusbar.today': '今日 ✓ {done}/{total}',

	// Commands
	'cmd.openChecklist': '打开习惯清单',
	'cmd.openCoach': '打开 AI 教练',
	'cmd.openWeeklyReview': '打开周回顾',
	'cmd.toggleToday': '切换某习惯的今日打卡',
	'cmd.pickHabitPlaceholder': '选择今天要打卡的习惯…',
	'cmd.noHabitsYet': '还没有习惯。打开习惯清单添加一个。',
	'cmd.toggledChecked': '{title}：已标记今日完成',
	'cmd.toggledUnchecked': '{title}：已取消今日完成',

	// Settings
	'settings.dataFolder.name': '数据文件夹',
	'settings.dataFolder.desc': '存放 Habits.md 和每日 Log 笔记的 Vault 文件夹。',
	'settings.dataFolder.placeholder': 'Habitude',
	'settings.weekStart.name': '每周开始于',
	'settings.weekStart.desc': '习惯清单网格中一周的第一天。',
	'settings.weekStart.monday': '周一',
	'settings.weekStart.sunday': '周日',
	'settings.checkmarkColor.name': '打卡标记颜色',
	'settings.checkmarkColor.desc': '已打卡日期的 ✓ 颜色。更改立即作用于已打开的清单。',
	'settings.provider.name': 'AI 服务商',
	'settings.provider.desc':
		'AI 教练使用的 LLM 服务。你的密钥和对话只发送给该服务商——绝不会发送给 Habitude。',
	'settings.provider.gemini': 'Google Gemini',
	'settings.provider.openai': 'OpenAI',
	'settings.provider.anthropic': 'Anthropic Claude',
	'settings.provider.openrouter': 'OpenRouter',
	'settings.provider.ollama': 'Ollama（本地）',
	'settings.provider.lmstudio': 'LM Studio（本地）',
	'settings.provider.deepseek': 'DeepSeek',
	'settings.provider.qwen': '通义千问（阿里云百炼）',
	'settings.provider.kimi': 'Kimi（月之暗面）',
	'settings.provider.zhipu': '智谱 GLM',
	'settings.provider.siliconflow': '硅基流动 SiliconFlow',
	'settings.provider.doubao': '豆包（火山方舟）',
	'settings.provider.opencodego': 'OpenCode Go',
	'settings.provider.custom': '自定义（OpenAI 兼容）',
	'settings.llmKey.name': 'API 密钥（AI 教练，可选）',
	'settings.llmKey.desc':
		'所选 AI 服务商的自有密钥。仅存储在本设备；只发送给该服务商，绝不发送给 Habitude。',
	'settings.llmKey.noKeyDesc': '无需密钥——所选服务商在本机运行。此处填写的密钥会被忽略。',
	'settings.llmKey.savedPlaceholder': '••••••••（密钥已保存）',
	'settings.llmKey.emptyPlaceholder': '粘贴密钥以启用 AI 教练',
	'settings.llmModel.name': '教练模型',
	'settings.llmModel.desc': 'AI 教练使用的模型。可从预置中选择，或点右侧按钮从服务商拉取真实可用模型列表。',
	'settings.fetchModels': '拉取模型列表',
	'settings.fetchModels.loading': '正在拉取模型列表…',
	'settings.fetchModels.done': '已获取 {count} 个模型。',
	'settings.fetchModels.fail': '拉取模型列表失败：{detail}',
	'settings.fetchModels.needKey': '请先填写 API 密钥。',
	'settings.fetchModels.needUrl': '尚未配置 API 地址。',
	'settings.fetchModels.empty': '服务商未返回任何模型。',
	'settings.baseUrl.name': 'API Base URL',
	'settings.baseUrl.desc': '可选的服务商端点覆盖。留空使用服务商默认值。',
	'settings.baseUrl.requiredDesc': '自定义服务商必填——你的 OpenAI 兼容端点 Base URL。',
	'settings.baseUrl.placeholder': '默认：{url}',
	'settings.coachLanguage.name': '教练语言',
	'settings.coachLanguage.desc': 'AI 教练的回复语言。',
	'settings.coachLanguage.auto': '自动（跟随我）',
	'settings.uiLanguage.name': '插件界面语言',
	'settings.uiLanguage.desc': '本插件的界面语言。「自动」跟随 Obsidian 界面语言。命令与提示需要重载插件后更新。',
	'settings.uiLanguage.auto': '自动（跟随 Obsidian）',
	'settings.uiLanguage.english': 'English',
	'settings.uiLanguage.korean': '한국어',
	'settings.uiLanguage.chinese': '简体中文',
	'settings.coachLanguage.english': 'English',
	'settings.coachLanguage.korean': '한국어',
	'settings.coachLanguage.chinese': '中文',
	'settings.sharing.name': '分享',
	'settings.sharing.desc':
		'仅在你点击按钮时才会分享。只发送习惯标题、连续天数、完成率等聚合统计；绝不包含笔记内容。',

	// Checklist view
	'checklist.weeklyReview': '周回顾',
	'checklist.newHabitPlaceholder': '新习惯…（回车继续）',
	'checklist.add': '添加',
	'checklist.habitAdded': '习惯已添加：{title}',
	'checklist.addHabitTitle': '添加习惯',
	'checklist.habitTitleLabel': '习惯',
	'checklist.addHabitPlaceholder': '例如：晨跑',
	'checklist.habitTypeLabel': '类型',
	'checklist.habitTypeGood': '好习惯——我想要做到',
	'checklist.habitTypeBad': '坏习惯——我想要抵抗它',
	'checklist.emptyTitle': '还没有习惯。',
	'checklist.emptyHint': '在上面添加你的第一个习惯——例如"晨跑"。',
	'checklist.habitOptions': '习惯选项',
	'checklist.habitDetails': '习惯详情',
	'checklist.archiveHabit': '归档习惯',
	'checklist.habitArchived': '习惯已归档：{title}',
	'checklist.saveCheckFailed': '打卡保存失败。',
	'checklist.progress': '进度',
	'checklist.shareProgress': '📤 分享进度',
	'checklist.shareNote':
		'仅在你点击按钮时才会分享。只发送习惯标题、连续天数、完成率等聚合统计；绝不包含笔记内容。',
	'checklist.getCoaching': '✨ 获取 AI 教练',
	'checklist.footnote':
		'数据以纯 Markdown 形式保存在你的 Vault 中。除非你主动分享，否则不会离开你的设备。',
	'checklist.toggleAria': '{date} 的 {title}',
	'checklist.resistToggleAria': '{date} 抵抗了 {title}',
	'checklist.sectionGood': '好习惯',
	'checklist.sectionBad': '坏习惯 · 抵抗中',
	'checklist.phaseBadgeAria': '方案阶段 {name}，第 {day} 天',

	// Coach view
	'coach.setupTitle': 'AI 教练——自带密钥',
	'coach.setupDesc':
		'选择 AI 服务商，与了解你习惯数据的教练对话——连续天数、周完成率、薄弱日等统计会自动作为数据传给模型。',
	'coach.setupStep1Prefix': '在 ',
	'coach.setupStep1Link': 'Google AI Studio',
	'coach.setupStep1Suffix': ' 免费获取密钥。',
	'coach.setupStep2': '粘贴到下方。它只保存在本设备——只发送给 Google，绝不发送给 Habitude。',
	'coach.keyPlaceholder': '粘贴 API 密钥',
	'coach.saveKey': '保存并开始',
	'coach.pasteKeyFirst': '请先粘贴 API 密钥。',
	'coach.getKeyLink': '获取密钥',
	'coach.noKeyNeeded': '无需密钥——所选服务商在本机本地运行。',
	'coach.headerTitle': 'AI 教练',
	'coach.newChat': '新对话',
	'coach.inputPlaceholder': '问问你的教练…',
	'coach.send': '发送',
	'coach.footnote': '密钥和对话只保存在本设备。请求直接发送给 {provider}。',
	'coach.removeKey': '删除密钥',
	'coach.addKeyFirst': '请先添加 API 密钥。',
	'coach.thinking': '教练思考中…',
	'coach.genericError': '出错了。请重试。',
	'coach.fallbackGreeting': '你好，我是 Habitude 教练。想聊点什么？',

	// Weekly review modal
	'review.title': '周回顾',
	'review.empty': '还没有习惯。请在习惯清单视图中添加第一个习惯。',
	'review.totalChecks': '本周总打卡：{total}',
	'review.perHabitMeta': '{rate}% · {checked}/{total} 天 · 🔥 {streak}',

	// Share
	'share.serverNotReady': '分享服务尚未就绪。',
	'share.linkCopied': '分享链接已复制到剪贴板。',
	'share.linkFallback': '分享链接：{url}',

	// AI generation & habit detail
	'common.cancel': '取消',
	'addHabit.aiToggle': '用 AI 生成知识卡片与执行方案',
	'addHabit.aiUnavailable': 'AI 尚未配置——请先在 设置 → Habitude Checklist 中选择服务商并填写 API 密钥。',
	'ai.noApiKey': '尚未配置 AI 服务商。请在设置中填入 API Key 以启用 AI 生成。',
	'ai.confirmTitle': '用 AI 生成',
	'ai.confirmBody':
		'将为「{title}」生成知识卡片与执行方案。请求直接发送到 {provider}，习惯信息会一并送达。是否继续？',
	'ai.confirmOk': '生成',
	'ai.generating': '正在生成知识卡片与执行方案…',
	'ai.generated': '已生成 {cards} 张知识卡片和执行方案。',
	'ai.generateFailed': 'AI 生成失败：{detail}',
	'detail.typeGood': '好习惯',
	'detail.typeBad': '坏习惯',
	'detail.planSection': '执行方案',
	'detail.planEmpty': '还没有执行方案。用下方按钮生成。',
	'detail.planEdit': '编辑方案',
	'detail.planSave': '保存方案',
	'detail.planFieldMicroHabit': '微习惯',
	'detail.planFieldTriggerCue': '触发线索',
	'detail.planFieldExecutionTime': '执行时间',
	'detail.planFieldLocation': '地点',
	'detail.planFieldEnvironmentDesign': '环境设计',
	'detail.planFieldImmediateReward': '即时奖励',
	'detail.planPhasesLabel': '计划阶段（每行一条：名称 | 天数 | 重点）',
	'detail.knowledgeSection': '知识卡片',
	'detail.knowledgeEmpty': '还没有知识卡片。',
	'detail.regenerate': '🔄 用 AI 重新生成',
	'detail.linkLabel': '关联笔记',
	'detail.linkPlaceholder': '[[笔记名]]（多个用逗号分隔）',
	'detail.linkAdd': '关联',
	'detail.linkRemove': '移除关联',
	'detail.openCardAria': '打开 {title}',
	'review.perHabitBad': '抵抗 {checked}/{total} 天',
	'review.aiButton': '✨ AI 复盘',
	'review.aiConfirmTitle': 'AI 复盘',
	'review.aiConfirmBody':
		'本周的习惯汇总统计将发送到 {provider}——只发送统计数据，绝不包含笔记内容。是否继续？',
	'review.aiRunning': '教练正在复盘…',
	'review.aiResult': 'AI 复盘',
	'review.periodWeek': '本周',
	'urge.sectionTitle': '冲动日志',
	'urge.recordTitle': '记录冲动',
	'urge.record': '记录冲动',
	'urge.recordSlip': '💔 记录一次失守',
	'urge.timeLabel': '时间',
	'urge.situationLabel': '情境 / 触发',
	'urge.situationPlaceholder': '例如：睡前躺在床上刷手机',
	'urge.intensityLabel': '冲动强度（1-10）',
	'urge.copingLabel': '应对方式',
	'urge.copingPlaceholder': '例如：把手机放远，改看书',
	'urge.outcomeLabel': '结果',
	'urge.outcomeResisted': '抵抗住了',
	'urge.outcomeSlip': '没忍住（失守）',
	'urge.save': '保存',
	'urge.saved': '冲动记录已保存。',
	'urge.empty': '最近 7 天没有冲动记录。',
	'urge.daysSinceSlip': '距上次失守 {days} 天',
	'urge.noSlipYet': '从未失守',
	'urge.aiAnalyze': '🧠 分析冲动模式',
	'urge.aiConfirmTitle': '分析冲动模式',
	'urge.aiConfirmBody':
		'最近 30 天的 {count} 条冲动记录将发送到 {provider}。记录可能包含敏感的个人情境。是否继续？',
	'urge.aiRunning': '正在分析冲动模式…',

	// User-visible coach errors
	'coach.error.rateLimit': '触发频率限制（免费额度）。请稍等一分钟再试。',
	'coach.error.rateLimitDetail': '服务商拒绝了请求（429）：{detail}',
	'coach.error.httpError': '{provider} 返回错误（状态码 {status}）。请重试。',
	'coach.error.network': '无法连接 AI 服务商。请检查网络。({detail})',
	'coach.error.unreadable': '模型响应无法解析。请重试。',
	'coach.error.authRejected':
		'该 API 密钥被拒绝或没有访问权限。请在 设置 → Habitude Checklist 中检查。',
	'coach.error.authInvalid':
		'API 密钥无效或没有访问权限。请在 设置 → Habitude Checklist 中检查。',
	'coach.error.modelError': '模型错误：{detail}',
	'coach.error.emptyReply': '模型返回了空回复。请重试。',
	'coach.error.baseUrlRequired': '请在 设置 → Habitude Checklist 中为自定义服务商填写 Base URL。',
	'coach.error.modelRequired': '请在 设置 → Habitude Checklist 中为自定义服务商填写模型 ID。',

	// Date labels
	'dates.weekRange': '{sm}{sd}日 – {em}{ed}日',
};

/** Raw dictionaries, exported for tests and tooling (parity checks, etc.). */
export const UI_STRINGS: Record<UiLocale, Dict> = { en, ko, zh };

/** Test/dev override. Takes precedence over auto-detection until cleared. */
let override: UiLocale | null = null;

export function setUiLocale(locale: UiLocale): void {
	override = locale;
}

export function clearUiLocale(): void {
	override = null;
}

/** Map a raw language tag ('zh-CN', 'en-US', 'ko-KR'…) to a supported locale, or null. */
function pickLocale(lang: string | undefined | null): UiLocale | null {
	const l = (lang ?? '').toLowerCase();
	if (l.startsWith('zh')) return 'zh';
	if (l.startsWith('ko')) return 'ko';
	if (l.startsWith('en')) return 'en';
	return null;
}

/**
 * Detect the UI locale from Obsidian's own language setting. Three probes,
 * most authoritative first:
 *   1. localStorage['language'] — where Obsidian persists the chosen UI
 *      language (the single most reliable source).
 *   2. window.getLanguage() — exposed by some Obsidian builds.
 *   3. window.moment.locale() — Obsidian sets moment's locale to the app
 *      language.
 * Never throws: any probe may be absent (node tests) or access-restricted.
 * Uses window for popout window compatibility per the community guidelines.
 */
export function getUiLocale(): UiLocale {
	if (override) return override;
	try {
		if (typeof localStorage !== 'undefined' && localStorage.getItem) {
			const picked = pickLocale(localStorage.getItem('language'));
			if (picked) return picked;
		}
	} catch {
		// localStorage unavailable — fall through.
	}
	try {
		const w =
			typeof window === 'undefined'
				? undefined
				: (window as unknown as { getLanguage?: unknown; moment?: { locale?: () => string } });
		const getLang = w?.getLanguage;
		if (typeof getLang === 'function') {
			const picked = pickLocale((getLang as () => string)());
			if (picked) return picked;
		}
		const momentLocale = w?.moment?.locale;
		if (typeof momentLocale === 'function') {
			const picked = pickLocale(momentLocale());
			if (picked) return picked;
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
