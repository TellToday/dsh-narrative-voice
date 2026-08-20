# dsh-narrative-voice

[**English**](./README.md) · 中文版

一个 **DSH（DeepSeek Harness）bundle 插件**：在**提示词组装阶段**把
`ask_user_question` 工具的 `questions.description` **整句改写**成带固定叙述人称规则的描述，让模型生成的问题（question）、标题（header）、选项标签（label）和选项描述（description）**始终使用一致的人称视角**——不再出现"选项标签用回答者口吻、描述却漂移到 AI 口吻"（或漏出"用户"这个词）的指代漂移。

改写用 `/voice` 命令**随时开关**——无需重启、不依赖 HMR（web profile 本来就把 HMR 关了）。

- **方案B（默认，`voice: "user"`）**——回答者叙述："我" = 被问的人，"你" = AI。
- **方案A（`voice: "ai"`）**——AI 叙述："我" = AI，"你" = 被问的人。

## 特性

- 规则**只注入到 `ask_user_question` 这一个工具里**——普通回复、其它工具完全不受影响。
- **整句替换**描述（规则融进一句完整的话），而不是在结尾贴一段脱节的附注。
- 对**每一个请求**生效——包括**已经开始的老对话**（提示词是逐请求组装的，不是在对话开始时冻结一次）。
- **零依赖**：没有任何运行时 import，不需要 `node_modules`，任何机器、任何安装方式都能启动。
- `/voice` 实时开关；方案（A/B）在配置时选定。

## 原理

DSH 每次发模型请求前执行 `SystemPrompt.assemble()`，把拼好的提示词放进一个 `assembly` 对象，派发到 `system-prompt/assemble` 这个 Cordis **瀑布事件**——**瀑布的返回值才是真正发给模型的提示词**。

本插件在瀑布上注册一个 `global: true` 的监听器：开启时，在 `assembly.tools` 里找到 `ask_user_question`，把 `parameters.properties.questions.description`（组装后的真实形态是 JSON-Schema）**原地替换**，再 `return next()` 放行。因为改写的是瀑布里传递的那个对象本身，所以一定会到达真实请求。

`assemble()` 每条消息执行一次，所以 `/voice` 开关**下一条消息就生效**，任何对话里都一样。

## 安装

前置：`pnpm` 在 PATH 上。

```powershell
# 克隆仓库（或用你的本地副本）
git clone https://github.com/TellToday/dsh-narrative-voice.git

# 装进某个 DSH profile，成为一层 bundle
dsh plugin --profile <profile> add ./dsh-narrative-voice

# 重启该 profile 的进程，让新 bundle 层挂载
```

> 本地包会以 `link:` 依赖被 pnpm 链进 profile 的 `node_modules`；因为 `package.json` 声明了 `dsh.bundle.patch`，`dsh plugin add` 会自动把它追加到 `dsh.profile.bundles` 成为一层 bundle。卸载：`dsh plugin --profile <profile> remove @dsh-user/narrative-voice`。

## 用法

```text
/voice on    开启改写（下一条消息起生效）
/voice off   关闭改写（工具描述恢复原样）
/voice       查看当前状态
```

命令由宿主的 `commands` 服务处理（**不经过模型**），即时生效——不依赖 HMR、无需重启。

## 配置

在 profile 的 patch 文件里按 id 覆盖（路径 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`）。patch 是整体替换 config，键要写全：

```yaml
- id: narrative-voice
  config:
    voice: user         # user（方案B：回答者叙述）| ai（方案A：AI 叙述）
    defaultActive: true # 装好后默认开启；false 则默认关闭，需手动 /voice on
```

配置由 `Config` 校验（零依赖的 Standard Schema 实现）：非法值会让插件加载失败并报明确错误。

## 目录结构

```
dsh-narrative-voice/
├── lib/index.js          # 插件本体：Config、assemble 监听器、/voice 命令
├── cordis.patch.yml      # bundle patch：把插件行插入 host 平面
├── test/
│   ├── functional.mjs    # 隔离功能测试（24 项断言）
│   └── run-test.ps1      # 直接跑测试（无需安装、无需 junction）
├── package.json          # bundle 元数据（dsh.bundle.patch；零依赖）
└── README.md / README.zh-CN.md
```

## 开发

```powershell
pwsh ./test/run-test.ps1
```

插件**没有任何裸 import**，测试直接用 `node` 跑——不用装任何东西、不用清理任何东西。

## License

MIT——见 [LICENSE](./LICENSE)。
