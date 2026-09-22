# requestUrl 直连，不引入 openai SDK

国内 Provider（DeepSeek/Qwen/Kimi/GLM/SiliconFlow/豆包）全部兼容 OpenAI Chat Completions 格式，现有 `coach/providers.ts` 已用 `requestUrl` 直连 + 可注入 `requestFn` 实现了同一抽象（7 个 Provider、错误分类、单测 mock 模式）。引入 `openai` npm SDK 只会增大 bundle、破坏 8 个测试套件的注入式 mock 模式，且无功能收益。决定：继续 `requestUrl` 直连，国内 Provider 以纯数据预设行的形式扩展 `ProviderDef` 表。

注意一个实现细节：`buildOpenAiStyleRequest` 硬拼 `/v1/chat/completions`，对豆包（`/api/v3/chat/completions`）路径不适用——豆包预设需自带 `buildRequest` 覆盖，其余可复用。
