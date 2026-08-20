# dsh-narrative-voice

**English** · [**中文版**](./README.zh-CN.md)

A **DSH (DeepSeek Harness) bundle plugin** that keeps the `ask_user_question`
tool's generated options free of pronoun drift. At prompt-assembly time it
**rewrites** the tool's `questions.description` so the model composes every
question, header, label, and description in a fixed narrative voice — no more
labels written from the answerer's view while the description drifts to the
AI's view (or leaks the word "用户").

The rewrite is **live-toggled** with the `/voice` command — no restart, no HMR
dependency (the web profile disables HMR anyway).

- **方案B (default, `voice: "user"`)** — the answerer narrates: "我" = the
  person answering, "你" = the AI.
- **方案A (`voice: "ai"`)** — the AI narrates: "我" = the AI, "你" = the person
  answering.

## Features

- Injects the rule **only inside the `ask_user_question` tool** — ordinary
  replies and every other tool are never touched.
- **Replaces** the description (the rule becomes part of one coherent sentence),
  it does not append a detached appendix.
- Applies to **every request** — including conversations already in progress
  (the prompt is assembled per request, not frozen at conversation start).
- **Dependency-free**: no runtime imports, no `node_modules` needed, no install
  friction on any machine.
- Live on/off via `/voice`, and the active voice is chosen at config time.

## How it works

DSH runs `SystemPrompt.assemble()` before every model request. It builds the
model-facing prompt into an `assembly` object and dispatches it through the
`system-prompt/assemble` Cordis **waterfall** — the waterfall's return value is
exactly what gets rendered and sent.

This plugin registers a `global: true` listener on that waterfall. While
enabled, it finds `ask_user_question` in `assembly.tools` and rewrites
`parameters.properties.questions.description` (the real assembled shape is
JSON-Schema form) in place, then `return next()` lets the chain continue. Since
the listener mutates the very object the waterfall passes through, the rewrite
reaches the actual request.

Because `assemble()` runs per request, the `/voice` toggle takes effect from
the next message in any conversation.

## Install

Requires `pnpm` on PATH.

```powershell
# clone the repo (or use your local copy)
git clone https://github.com/TellToday/dsh-narrative-voice.git

# install into a DSH profile as a bundle layer
dsh plugin --profile <profile> add ./dsh-narrative-voice

# restart the profile's process to mount the new bundle layer
```

> The local package is linked into the profile's `node_modules`; because
> `package.json` declares `dsh.bundle.patch`, `dsh plugin add` automatically
> appends it to `dsh.profile.bundles` as a bundle layer. Uninstall:
> `dsh plugin --profile <profile> remove @dsh-user/narrative-voice`.

## Usage

```text
/voice on     enable the rewrite (effective from the next message)
/voice off    disable it (the tool description is restored)
/voice        show the current state
```

The command is handled host-side by the `commands` service (never by the
model), so it works instantly — no HMR, no restart.

## Configuration

Override the row by id in the profile's patch file
(`$DSH_HOME/profiles/<profile>/cordis.patch.yml`). The patch replaces the whole
config, so list every key:

```yaml
- id: narrative-voice
  config:
    voice: user         # user (方案B: the answerer narrates) | ai (方案A: the AI narrates)
    defaultActive: true # on by default after install; false = off until /voice on
```

The config is validated by `Config` (a dependency-free Standard Schema
implementation): an invalid value fails the plugin load with a clear error.

## Project layout

```
dsh-narrative-voice/
├── lib/index.js          # plugin body: Config, assemble listener, /voice command
├── cordis.patch.yml      # bundle patch: inserts the row into the host plane
├── test/
│   ├── functional.mjs    # isolated functional tests (24 assertions)
│   └── run-test.ps1      # runs the tests directly (no install, no junction)
├── package.json          # bundle metadata (dsh.bundle.patch; zero deps)
└── README.md / README.zh-CN.md
```

## Development

```powershell
pwsh ./test/run-test.ps1
```

The plugin has **no bare imports**, so tests run with plain `node` — nothing to
install, nothing to clean up.

## License

MIT — see [LICENSE](./LICENSE).
