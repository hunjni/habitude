# Habitude Checklist — Obsidian Plugin

A 7-day habit checklist for Obsidian: add habits, tap days to check them off, track streaks and weekly completion rates, and open a weekly review. Markdown-native — your data lives in your vault as plain markdown.

## Screenshots

![Checklist view](assets/checklist.png)

*The 7-day checklist grid next to your plain-Markdown habit data. Click a cell to toggle — streaks and weekly rates update live:*

![Checklist demo](assets/demo.gif)

![AI coach](assets/coach.png)

*The AI coach greets you with your own stats and chats about your habits — bring your own API key (BYOK): Gemini, OpenAI, Claude, OpenRouter, or a local model via Ollama / LM Studio.*

## Data layout (in your vault)

Under the configured data folder (default `Habitude/`):

```
Habitude/
  Habits.md            # habit registry, one "## <id>" section per habit
                       #   fields: - Title / - Type: good|bad / - Notes: [[wikilinks]]
                       #   and a "### Plan" subsection (AI-generated execution plan)
  Log/
    2026-09-15.md      # daily log: "- [x] morning-run <!-- Morning run -->"
  Knowledge/
    <habitId>-1.md     # AI-generated knowledge cards (frontmatter: habitId, category)
  Urge/
    2026-09-15.md      # urge log for bad habits: "- HH:MM | <id> | situation | 1-10 | coping | resisted|slip"
```

Both files are human-readable and hand-editable. The plugin re-reads them on every render (and on vault `modify` events), so edits you make directly in the notes are picked up automatically — hand-written fields and lines inside a habit section are preserved on every save.

## Features

- **Checklist view** (ribbon icon, or command *Open checklist*): habits × 7-day grid, click a cell to toggle. Week navigation (‹ ›), per-habit streak (🔥) and weekly %.
- **Good vs. bad habits**: pick the type when adding. Good habits and bad habits render in separate sections; for a bad habit a checked day means *successfully resisted* (🛡) — data format is unchanged, so old vaults stay compatible.
- **Urge log** (bad habits, in *Habit details*): record urges with time, situation, intensity (1–10), coping, and outcome (resisted / slip). "Days since last slip" and per-week resist counts derive from it. A 💰 "record a slip" shortcut pre-fills one entry.
- **AI knowledge cards & execution plan**: when adding a habit (or later via *Habit details → Regenerate*), the AI generates 2–4 knowledge cards (written to `Habitude/Knowledge/`) and a structured execution plan (micro-habit, trigger cue, environment design, immediate reward, 3 phases) written into the habit's `### Plan` subsection. Every generation is behind an explicit confirm dialog naming the provider that will receive the data. Cards are plain markdown notes — open, edit, link them like any other note; manually linked notes (`- Notes: [[...]]`) are never touched by regeneration.
- **Stage tracking**: for the first 21 days after a plan is generated, the checklist shows a stage badge (e.g. `D3 适应期`) and the habit's detail view floats the knowledge cards matching the current stage (adaptation → strategy/trigger awareness, consolidation → maintenance/replacement, reinforcement → motivation/coping).
- **AI review & urge analysis**: the weekly review has an *AI review* button (sends aggregate statistics only, after confirmation); bad-habit detail views can ask the AI to analyze urge patterns and suggest replacement behaviors (sends the urge log only after an explicit confirmation that names what will be sent).
- **Add habits** via a dialog (title + good/bad type); **archive** via the ⋯ menu next to the habit name.
- **Progress graphs** (in the checklist view): per-habit 30-day history strip and trailing 8-week completion bars, rendered locally as SVG — no network involved.
- **Share progress** (button in the checklist view, opt-in): posts aggregate statistics to `https://habitude.ai/api/share` and copies a `https://habitude.ai/s/<id>` link. Only runs when you click it.
- **Weekly review** (command *Open weekly review* or the button in the view): per-habit completion bars (bad habits: resist counts + days since last slip), total checks.
- **Command** *Toggle today for a habit*: quick toggle from the command palette.
- **Status bar**: today's progress (`✓ 3/5 today`).
- **AI coach** (ribbon icon, or command *Open AI coach*): chat with a coach that knows your habits — your streaks, weekly rates, and weekday patterns are shared with the model automatically as statistics.
  - See it in action: [coach greeting](#screenshots) · [checklist demo](assets/demo.gif)
- **Multi-provider AI (BYOK)**: Gemini, OpenAI, Anthropic, OpenRouter, Ollama, LM Studio — plus DeepSeek, 通义千问 (Alibaba Bailian), Kimi (Moonshot), 智谱 GLM, SiliconFlow, 豆包 (Volcano Ark), and any custom OpenAI-compatible endpoint. Keys are stored on-device only; requests go directly to the chosen provider.
- **Settings** (`Settings → Habitude checklist`): data folder, week start day (Mon/Sun), AI provider, API key, model, base URL, coach language (English / 한국어 / 中文).
- **Get AI coaching** footer button: opens `https://habitude.ai` in your browser.

## Privacy

- **Checklist: fully local.** Habit tracking never calls any API, opens no connections, and holds no credentials. Your habits live in your vault as plain Markdown.
- **Progress graphs: fully local.** Rendered in the app from your check data as SVG. No network involved.
- **Share progress: explicit opt-in.** Only aggregate statistics (habit titles, streaks, completion rates) are ever transmitted — never your note contents. The payload is `{version, pluginVersion, generatedAt, stats: {habits: [{title, streak, weekRate}]}}` posted to `https://habitude.ai/api/share`; nothing is sent unless you click the button.
- **Clipboard: write-only, on your tap.** The only clipboard access is writing the share link to your clipboard right after you press *Share progress*; the plugin never reads your clipboard.
- **AI coach: opt-in BYOK.** The coach only activates if you pick a provider and — for cloud providers — paste your own API key (free tiers exist for Gemini, OpenAI, Anthropic, and OpenRouter). The key is stored only on this device, and requests go **directly to the provider you selected** — never to Habitude servers. Each message carries your habit *statistics* (streaks, rates, patterns), never your raw note text. Local providers (Ollama, LM Studio) need no key at all.
- **AI generation: explicit, per call.** Knowledge cards, execution plans, AI reviews, and urge analysis never run automatically. Every call first shows a confirm dialog stating what will be sent and to which provider; cancelling sends nothing. Urge-log analysis explicitly flags that the entries may contain sensitive context before you confirm.
- The only other thing that ever leaves Obsidian is you: the *Get AI coaching* button opens `https://habitude.ai` in your browser.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production: tsc + esbuild → main.js
```

Manual test install: copy `main.js`, `manifest.json`, `styles.css` into `<Vault>/.obsidian/plugins/habitude-checklist/`, reload Obsidian, enable under **Settings → Community plugins**.
