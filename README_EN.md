<div align="center">

# persona-roundtable

**A structured roundtable where independent AI personas challenge, refine, and synthesize ideas.**

[中文](README.md) · English

</div>

> Give one question to several different minds. Let them reason independently, respond to each other, and leave you with a readable transcript plus a final synthesis.

[Quick start](#setup) · [Example](#example) · [How it works](#how-it-works) · [Repository structure](#repository-structure)

## What it is

`persona-roundtable` is a TypeScript CLI that runs one independent discussion session across multiple persona-driven minds.

Each run is driven by a JSON config. Edit the topic, context, minds, and providers before running. Richer context gives the minds more to work with, so put concrete background, definitions, assumptions, constraints, values, relevant history, and uncertainty in `context`.

| Bring | Get |
| --- | --- |
| One question and its context | Several independent perspectives |
| A set of persona skills | Structured discussion and cross-commentary |
| One or more model providers | Live progress, a reader-facing transcript, and a final summary |

## Example

```text
User       ❯ Should we build this feature now?

Feynman    ❯ What problem are we actually solving? Let’s test the assumption.
Naval      ❯ Before optimizing the plan, decide whether the expected leverage is real.
Moderator  ❯ The disagreement is about the problem definition. Let’s clarify that first.
```

The point is not to make every persona sound interchangeable. Each mind is given its own skill definition and context, so the discussion can expose different models, assumptions, and decision criteria.
## Setup

```bash
npm install
```

Create local files:

```powershell
Copy-Item config-example.json config.json
Copy-Item .env.example .env
```

Edit `.env` and fill in the API keys for the providers you actually use:

Edit `config.json` for the session you want to run, then start the CLI:

```bash
npm run roundtable
```

The CLI prints progress and live output, then writes two files under `sessions/`:

- `*.md`: reader-facing transcript
- `*.dev.md`: development log with every LLM prompt and response

Use a custom config path when you do not want to use `config.json`:

```bash
npm run roundtable -- --config path/to/config.json
```

For a dry deterministic run that does not call provider APIs, set `testMode: true` in the config or use:

```bash
npm run roundtable -- --test-mode
```

## Config

`config-example.json` is the template. Copy it to `config.json` for local runs.

| Field | Behavior |
| --- | --- |
| `topic` | Required question or topic for the session. Injected into every prompt. |
| `context` | Required free-form background. Strings are passed through directly, except a string ending in `.md`, which is loaded as a UTF-8 Markdown file relative to the session config; its content and line breaks are preserved. Objects/arrays are pretty-printed as JSON. |
| `maxRounds` | Required positive integer. Hard cap in simple mode; in dynamic mode it computes the fallback turn cap. |
| `discussionMode` | Optional `"simple"` or `"dynamic"`, default `"simple"`. Dynamic mode enables invitations and urgency scheduling after round 1. |
| `maxTurns` | Optional positive integer or `null`, used only in dynamic mode. Counts all mind speeches including round-1 openings. Defaults to `maxRounds * active mind count`. |
| `testMode` | Optional boolean, default `false`. When `true`, uses deterministic dummy models and does not require API keys. CLI flag `--test-mode` also forces this on for one run. |
| `outputLanguage` | Optional free-form instruction injected into every prompt. If omitted, the app asks models to use the user's language unless the persona has a stronger reason not to. |
| `globalMindsProvider` | Optional provider name used by active minds that do not set their own `provider`. Omit it, set it to `null`, or set it to `"none"` to require each mind to specify `provider`. |
| `moderatorProvider` | Required provider name for moderator progress reviews and the final summary. Must exist in `providers`. |
| `compressionProvider` | Optional provider name for live compressed CLI monitoring output. Omit it, set it to `null`, or set it to `"none"` to print full live outputs instead. |
| `providers` | Required map of named provider configs. Only providers used by the moderator, active minds, and compression are instantiated. |
| `minds` | Required non-empty list of active personas. Each entry points at a persona `SKILL.md`. |
| `disabledMinds` | Optional list of personas kept in the file but not run. Empty arrays are allowed. |

### Providers

A provider entry names a model backend and the environment variable that contains its API key:

```json
"deepseek-pro": {
  "type": "deepseek",
  "model": "deepseek-v4-pro",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "reasoningEffort": "max"
}
```

Supported `type` values:

- `deepseek`
- `openai` or `codex`
- `anthropic` or `claude`
- `openrouter`

`reasoningEffort` is used by DeepSeek and must be `"high"` or `"max"` when present. If omitted for DeepSeek, it defaults to `"high"`.

### Minds

With `globalMindsProvider` set, an active mind can be just:

```json
{
  "personaPath": "agents/feynman/SKILL.md"
}
```

Set `provider` on a mind only when it should override `globalMindsProvider`:

```json
{
  "personaPath": "agents/naval/SKILL.md",
  "provider": "claude"
}
```

The persona folder must include `persona.json` beside `SKILL.md`:

```json
{
  "id": "feynman",
  "name": "Richard Feynman"
}
```

## Runtime Behavior

### Simple mode

Simple mode is the default and preserves the original behavior. Round 1 asks every active mind for its initial view. Later rounds give each mind the previous rounds and moderator progress notes so they can respond, revise, or clarify.

After each round, the moderator returns a structured JSON progress review. The discussion stops when:

- `maxRounds` is reached, or
- after round 1, the moderator returns `decision: "end_discussion"`.

### Dynamic mode

Set `"discussionMode": "dynamic"` and configure at least three active minds. Round 1 remains a fixed-order opening round with no invitations, urgency checks, or moderator interruption.

After round 1, each selected mind returns its response and may invite one other mind. The moderator makes a short decision after every speech, but generally produces a checkpoint summary only once per active-mind-count of speeches; it may summarize earlier or later as the discussion changes. If the moderator continues, an invitation selects the next speaker. Without an invitation, every other mind reports `no_new_comment`, `minor_update`, or `strong_need_to_respond`; the highest urgency wins, with ties resolved by `minds` order.

Dynamic discussion stops when the moderator ends it, every eligible mind reports no new comment, or the effective turn cap is reached. `maxTurns` counts the opening speeches. If omitted, the cap is `maxRounds * active mind count`. Urgency polling can add one model call per other mind after an uninvited speech, and the moderator receives one short decision call after every post-opening speech.

Both modes always produce a final moderator summary. The final summary is printed as-is, even when `compressionProvider` is enabled.

`compressionProvider` only controls live CLI monitoring output. It compresses generated speaker responses and moderator reviews while the run is in progress. Compressed text is not added to the reader-facing transcript; the full raw calls remain in the dev log.

There is no cross-session memory. Change the JSON for every new session.

## Prompt Templates

The predetermined prompt structures live in `prompts/`:

- `prompts/round1.md`: initial opinion prompt
- `prompts/follow-up-round.md`: cross-commentary and updated opinion prompt for rounds after the first
- `prompts/moderator.md`: structured simple-mode moderator progress review prompt
- `prompts/dynamic-turn.md`: structured dynamic response and optional invitation prompt
- `prompts/urgency.md`: short dynamic speaking-urgency prompt
- `prompts/dynamic-moderator.md`: adaptive moderator decision and checkpoint prompt
- `prompts/final-summary.md`: final moderator synthesis prompt
- `prompts/compression.md`: live CLI monitoring compression prompt

These files are intended for context engineering. Keep placeholders like `{{topic}}`, `{{context}}`, and `{{persona}}` intact unless you also update the renderer.

## How it works

```text
JSON config
    │
    ├── topic + context
    ├── active minds ──> persona prompts ──> independent responses
    └── providers      ──> model calls
                                      │
                                      ▼
                              moderator review
                                      │
                                      ▼
                              final summary
```

The orchestration layer keeps session state, prompt rendering, model adapters, transcript output, and moderator decisions separate so each part can be inspected or changed independently.

## Repository structure

```text
persona-roundtable/
├── README.md              # Chinese landing page and navigation
├── README_EN.md           # this document
├── src/                   # TypeScript runtime code
│   ├── app.ts             # CLI entry point
│   └── models/            # provider adapters
├── config-example.json    # session configuration template
├── agents/                # persona skills and research material
├── prompts/               # discussion and context-engineering templates
├── tests/                 # automated tests
└── sessions/              # generated transcripts (ignored by git)
```

## Development

```bash
npm test
npm run typecheck
npm run check:encoding
```

The project is intentionally configuration-first: most session behavior should be expressible in `config.json` and the prompt templates under `prompts/`.

## Contributing

Issues, persona improvements, prompt experiments, provider adapters, and documentation fixes are welcome. Keep changes focused, preserve UTF-8 encoding, and add or update tests when behavior changes.

## License

Licensed under the [Apache License 2.0](LICENSE).
