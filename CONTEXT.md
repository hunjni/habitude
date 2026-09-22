# Habitude Checklist

Obsidian 习惯追踪插件。领域词汇以 Markdown 文件为唯一数据源：`Habitude/Habits.md`（习惯注册表）+ `Habitude/Log/YYYY-MM-DD.md`（每日打卡）。

## Language

### 习惯与打卡

**Habit（习惯）**:
用户注册到 Habits.md 的一条习惯，`Type` 字段区分 good / bad，默认 good。

**Good habit（好习惯）**:
期望「执行」的习惯。打勾 = 完成执行。

**Bad habit（坏习惯）**:
期望「抵抗」的习惯。打勾 = 成功抵抗（不是完成）。统计口径与好习惯不同：抵抗次数、距上次失守天数，而非连续完成。

**Check（打卡）**:
Log 文件中的一行 `- [x] <id>`。复选框语义随习惯类型翻转：好习惯 = 完成，坏习惯 = 抵抗成功。
_Avoid_: 完成（对坏习惯而言）

**Slip（失守）**:
坏习惯的一次「没忍住」。失守事实只记录在冲动日志里（结果 = 屈服），不做被动推导（没打勾 ≠ 失守）。
_Avoid_: 失败、破戒

### 冲动日志

**Urge log（冲动日志）**:
坏习惯专属的结构化记录：时间、触发情境、强度（1-10）、应对方式、结果（抵抗 / 屈服）。存于 `Habitude/Urge/YYYY-MM-DD.md`。

### AI 生成内容

**Knowledge card（知识卡片）**:
AI 生成的独立 Markdown 文件，存于 `Habitude/Knowledge/`，靠 frontmatter `habitId` 与习惯关联。是用户可自由编辑的笔记，不是数据库记录。

**Plan（执行方案）**:
AI 生成的结构化习惯配方（微习惯、触发线索、环境设计、即时奖励、三阶段），存于 Habits.md 习惯章节的 `### Plan` 子章节。

**Phase（计划阶段）**:
方案的三段时间轴：适应期（1-7 天）、巩固期（8-14 天）、强化期（15-21 天）。阶段按方案生成日期推算，到期后（>21 天）徽章消失、卡片平铺。

**PlanGenerated（方案锚点日期）**:
习惯章节的 `- PlanGenerated: YYYY-MM-DD` 字段，`updatePlan` 写入（AI 生成或手动保存方案时），是阶段推算的唯一时间锚点。手写方案没有该字段 → 不显示徽章。

**Stage badge（阶段徽章）**:
打卡视图习惯行上显示的当前阶段标记。无推送机制，仅在渲染时按日期计算。

### AI 接入

**Provider**:
用户自选的 LLM 服务商（BYOK）。请求用 `requestUrl` 直连服务商，不经过任何中间服务器；Key 仅存本地 data.json。
