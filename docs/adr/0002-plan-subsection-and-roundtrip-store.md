# 执行方案存为 `### Plan` 子章节；store 改为 round-trip 安全

执行方案（Plan）的存储三选一：`Plan:` 单行 JSON、`### Plan` 子章节、独立 `Habitude/Plans/<id>.md` 文件。决定用 **`### Plan` 子章节**（章节内键值行：`- MicroHabit:` 等）：人类可直接手读手改，符合「markdown 像自己写的笔记」原则；解析成本仅几十行。`/^## /m` 切分不会误伤 `###` 行（第三个字符是 `#` 不是空格）。

前置改造（数据兼容的隐性炸弹）：`store.ts` 的 `renderHabits` 是**全量重写** Habits.md，手写的未知字段会在下次 addHabit/archiveHabit 时被抹掉。改造第一步必须把 parse/render 改成 round-trip 安全：章节按 key-value 映射解析，未知字段原样保留、原样写回。

否决「独立文件」方案：需维护双向关联，违背 Habits.md 单文件注册表的现状。
