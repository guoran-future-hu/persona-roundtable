# persona-roundtable

persona-roundtable is a CLI that runs one independent discussion session across multiple persona-driven minds.

Each run is driven by a JSON config. Edit the topic, context, minds, and providers before running. Richer context gives the minds more to work with, so put concrete background, definitions, assumptions, constraints, values, relevant history, and uncertainty in `context`.

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
| `context` | Required free-form background. Strings are passed through directly; objects/arrays are pretty-printed as JSON. |
| `maxRounds` | Required positive integer. Hard cap on discussion rounds. |
| `testMode` | Optional boolean, default `false`. When `true`, uses deterministic dummy models and does not require API keys. CLI flag `--test-mode` also forces this on for one run. |
| `workingLanguage` | Optional free-form instruction injected into every prompt. If omitted, the app asks models to use the user's language unless the persona has a stronger reason not to. |
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

Round 1 asks every active mind for its initial view. Later rounds give each mind the previous rounds and moderator progress notes so they can respond, revise, or clarify.

After each round, the moderator returns a structured JSON progress review. The discussion stops when:

- `maxRounds` is reached, or
- after round 1, the moderator returns `decision: "end_discussion"`.

The moderator always produces a final summary after the discussion stops. The final summary is printed as-is, even when `compressionProvider` is enabled.

`compressionProvider` only controls live CLI monitoring output. It compresses generated speaker responses and moderator reviews while the run is in progress. Compressed text is not added to the reader-facing transcript; the full raw calls remain in the dev log.

There is no cross-session memory. Change the JSON for every new session.

## Prompt Templates

The predetermined prompt structures live in `prompts/`:

- `prompts/round1.md`: initial opinion prompt
- `prompts/follow-up-round.md`: cross-commentary and updated opinion prompt for rounds after the first
- `prompts/moderator.md`: structured moderator progress review prompt
- `prompts/final-summary.md`: final moderator synthesis prompt
- `prompts/compression.md`: live CLI monitoring compression prompt

These files are intended for context engineering. Keep placeholders like `{{topic}}`, `{{context}}`, and `{{persona}}` intact unless you also update the renderer.
