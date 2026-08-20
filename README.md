# dsh-narrative-voice

**English** · [Chinese](./README.zh-CN.md)

A **DSH (DeepSeek Harness) bundle plugin** that keeps the `ask_user_question`
tool's generated questions and options **pronoun-consistent**. At
prompt-assembly time it rewrites the tool's `questions.description` with a
fixed narrative-voice rule, and you toggle it live with `/voice`.

## Why this plugin exists

The `ask_user_question` tool asks the human a concise question with a few
clickable options. Without a fixed rule, the model drifts pronouns *inside a
single option*:

- a **label** written from the answerer's view ("I'll restart it myself" —
  "I" = the answerer) paired with a **description** written from the AI's view
  ("I'll walk you through the restart" — "I" = the AI);
- the phrase **"the user"** leaking in ("...so the user doesn't have to think"),
  third-personing the very person who reads it.

One option, two different "I"s. The result is ambiguous and confusing: whose
action is on offer? whose perspective is "I"?

This plugin fixes it at the **prompt level**: it embeds a fixed narrative-voice
rule into the tool's own description, so the model composes every field in one
consistent voice, and never calls the answerer "the user".

## What it does

The rule splits the tool's fields into two groups:

- **Question and header** — always written from the **AI's** point of view, in
  **both** schemes: "I" = the AI, "You" = the person answering (the user).
- **Options (label and description)** — follow the selected scheme:
  - **Scheme B (default, `voice: "user"`)** — the answerer narrates: "I" = the
    person answering, "You" = the AI.
  - **Scheme A (`voice: "ai"`)** — the AI narrates: "I" = the AI, "You" = the
    person answering.

The rule text is **English-only (zero CJK characters)** — it can never leak
Chinese characters into an English reply. It works in any conversation
language (the model localizes the pronouns into the conversation's language),
applies **only inside this tool** (ordinary replies and other tools are never
touched), and only where such pronouns actually appear — it never forces I/You
into a question or option that does not naturally need them.

## How it works

DSH runs `SystemPrompt.assemble()` before every model request. It builds the
model-facing prompt into an `assembly` object and dispatches it through the
`system-prompt/assemble` Cordis **waterfall** — the waterfall's return value is
exactly what gets rendered and sent.

This plugin registers a `global: true` listener on that waterfall. While
enabled, it finds `ask_user_question` in `assembly.tools` and **rewrites**
`parameters.properties.questions.description` (the real assembled shape is
JSON-Schema form) in place, then `return next()` lets the chain continue. Only
the per-request clone is touched — the registry schema and parameter validation
are never polluted.

Because `assemble()` runs per request, the `/voice` toggle takes effect from
the next message in any conversation — including ones already in progress.

## Install

One command, straight from this GitHub repo (**verified**):

```powershell
dsh plugin --profile <profile> add "github:TellToday/dsh-narrative-voice#main"
```

- `#main` tracks the latest commit; pin a stable release with `#v0.7.0`.
- Then **restart** the profile's process (for the web profile: `dsh web`).

Alternatives, same effect:

```powershell
# full git URL
dsh plugin --profile <profile> add "git+https://github.com/TellToday/dsh-narrative-voice.git"
# or a local checkout (dev)
dsh plugin --profile <profile> add "E:\path\to\dsh-narrative-voice"
```

The package declares `dsh.bundle.patch`, so `dsh plugin add` automatically
appends it to `dsh.profile.bundles` as a bundle layer. Uninstall:
`dsh plugin --profile <profile> remove @dsh-user/narrative-voice`.

> Requires `pnpm` on PATH. Git-hosted installs clone the repo via your system
> git (honoring your git proxy settings).

## Usage

| Command | Effect |
|---|---|
| `/voice on` | enable the rewrite (effective from the next message) |
| `/voice off` | disable it (the tool description is restored) |
| `/voice user` | switch to Scheme B (answerer-narrated options) and enable |
| `/voice ai` | switch to Scheme A (AI-narrated options) and enable |
| `/voice` | show current state (on/off + active voice) |

The command is handled host-side by the `commands` service (never by the
model), so it works instantly — no HMR, no restart.

## Default configuration

| Key | Default | Meaning |
|---|---|---|
| `voice` | `user` (Scheme B) | which narrative scheme the options follow |
| `defaultActive` | `true` | enabled right after install |

To change the defaults (instead of using `/voice` at runtime), override the row
by id in the profile's patch file `$DSH_HOME/profiles/<profile>/cordis.patch.yml`.
The patch replaces the whole config, so list every key:

```yaml
- id: narrative-voice
  config:
    voice: user          # user (Scheme B) | ai (Scheme A)
    defaultActive: true  # false = start disabled, until /voice on
```

The config is validated by `Config` (a dependency-free Standard Schema
implementation): an invalid value fails the plugin load with a clear error.

## Project layout

```
dsh-narrative-voice/
├── lib/index.js          # plugin body: Config, assemble listener, /voice command
├── cordis.patch.yml      # bundle patch: inserts the plugin row into the host plane
├── test/
│   ├── functional.mjs    # isolated functional tests (39 assertions)
│   └── run-test.ps1      # runs the tests directly (no install, no junction)
├── package.json          # bundle metadata (dsh.bundle.patch; zero deps)
├── LICENSE               # MIT
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
