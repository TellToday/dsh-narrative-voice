# dsh-narrative-voice

[**English**](./README.md) · 中文版

一个 **DSH（DeepSeek Harness）bundle 插件**：让 `ask_user_question` 工具生成的问题和选项**人称始终一致**。它在**提示词组装阶段**把该工具的 `questions.description` 整句改写为带固定叙述人称规则的描述，并可用 `/voice` 命令**随时开关**。

## 为什么会有这个插件

`ask_user_question` 工具负责向人类问一个简洁的问题，并给出几个可点击的选项。**没有固定规则时，模型会在同一个选项内部漂移人称**：

- **选项标签**用回答者口吻（"我自己重启"——"我"=被问的人），**选项描述**却漂移到 AI 口吻（"我会指导你如何重启"——"我"=AI）；
- 还会漏出**"用户"**这个词（"…让你更省心"），把正在读这句话的人用第三人称指代。

同一个选项里出现两个不同的"我"，用户根本分不清：提供动作的是谁？"我"到底是谁的视角？

本插件在**提示词层面**解决：把一条固定的人称规则写进工具自身的描述里，让模型生成的问题（question）、标题（header）、选项标签（label）、选项描述（description）**始终用同一种视角**，并且**永远不称呼回答者为"用户"**。

## 它做什么

规则把工具的字段分成两组：

- **question（问题）和 header（标题）**——**两套方案都一样**，固定从 AI 视角写："我"/"I" = AI，"你"/"You" = 被问的人（用户）。
- **label（选项标签）和 description（选项描述）**——跟着所选方案走：
  - **方案B（默认，`voice: "user"`）**——回答者叙述："我"/"I" = 被问的人，"你"/"You" = AI。
  - **方案A（`voice: "ai"`）**——AI 叙述："我"/"I" = AI，"你"/"You" = 被问的人。

规则文本为**纯英文（零中文字符）**——**绝不会让英文回复里泄漏出汉字**；对任何语言的会话都生效（模型会把代词本地化成会话语言：英文用 I/You，中文用我/你）。规则**只在 ask_user_question 这一个工具内生效**（普通回复、其它工具完全不受影响），并且**只在确实用到人称时才适用**——不强迫本来用不到人称的问题或选项硬塞。

## 原理

DSH 每次发模型请求前执行 `SystemPrompt.assemble()`，把拼好的提示词放进一个 `assembly` 对象，派发到 `system-prompt/assemble` 这个 Cordis **瀑布事件**——**瀑布的返回值才是真正发给模型的提示词**。

本插件在瀑布上注册一个 `global: true` 的监听器：开启时，在 `assembly.tools` 里找到 `ask_user_question`，把 `parameters.properties.questions.description`（组装后的真实形态是 JSON-Schema）**原地替换**，再 `return next()` 放行。只改每请求的克隆——注册表 schema 和参数校验闭包都不受影响。

`assemble()` 每条消息执行一次，所以 `/voice` 开关**下一条消息就生效**，任何对话（包括**已经开始的老对话**）里都一样。

## 安装

一条命令，直接从本 GitHub 仓库安装（**已实测可用**）：

```powershell
dsh plugin --profile <profile> add "github:TellToday/dsh-narrative-voice#main"
```

- `#main` 跟随最新提交；要固定版本用 `#v0.7.0`。
- 装完要**重启该 profile 的进程**（web profile 就是 `dsh web`）。

等效的其它写法：

```powershell
# 完整 git URL
dsh plugin --profile <profile> add "git+https://github.com/TellToday/dsh-narrative-voice.git"
# 或用本地目录（开发用）
dsh plugin --profile <profile> add "E:\path\to\dsh-narrative-voice"
```

包声明了 `dsh.bundle.patch`，`dsh plugin add` 会自动把它追加到 `dsh.profile.bundles` 成为一层 bundle。卸载：`dsh plugin --profile <profile> remove @dsh-user/narrative-voice`。

> 前置：`pnpm` 在 PATH 上。git 托管安装会通过系统 git 克隆仓库（遵循你的 git 代理设置）。

## 用法

| 命令 | 作用 |
|---|---|
| `/voice on` | 开启改写（下一条消息起生效） |
| `/voice off` | 关闭改写（工具描述恢复原样） |
| `/voice user` | 切到方案B（回答者叙述）并开启 |
| `/voice ai` | 切到方案A（AI 叙述）并开启 |
| `/voice` | 查看当前状态（开关 + 当前方案） |

命令由宿主的 `commands` 服务处理（**不经过模型**），即时生效——不依赖 HMR、无需重启。

## 默认配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `voice` | `user`（方案B） | 用哪种叙述方案 |
| `defaultActive` | `true` | 装好后默认开启 |

想改默认值（而不是运行时用 `/voice` 切），在 profile 的 patch 文件里按 id 覆盖（路径 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`）。patch 是整体替换 config，键要写全：

```yaml
- id: narrative-voice
  config:
    voice: user          # user（方案B：回答者叙述）| ai（方案A：AI 叙述）
    defaultActive: true  # false = 默认关闭，直到 /voice on
```

配置由 `Config` 校验（零依赖的 Standard Schema 实现）：非法值会让插件加载失败并报明确错误。

## 目录结构

```
dsh-narrative-voice/
├── lib/index.js          # 插件本体：Config、assemble 监听器、/voice 命令
├── cordis.patch.yml      # bundle patch：把插件行插入 host 平面
├── test/
│   ├── functional.mjs    # 隔离功能测试（39 项断言）
│   └── run-test.ps1      # 直接跑测试（无需安装、无需 junction）
├── package.json          # bundle 元数据（dsh.bundle.patch；零依赖）
├── LICENSE               # MIT
└── README.md / README.zh-CN.md
```

## 开发

```powershell
pwsh ./test/run-test.ps1
```

插件**没有任何裸 import**，测试直接用 `node` 跑——不用装任何东西、不用清理任何东西。

## License

MIT——见 [LICENSE](./LICENSE)。
