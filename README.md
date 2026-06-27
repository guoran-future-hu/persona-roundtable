# persona-roundtable

persona-roundtable runs a discussion across multiple persona-driven minds.

The MVP is a CLI. Each run is one independent session driven by `config.json`. Edit the config before each run.

Richer context gives the minds more to work with. Put concrete background, definitions, assumptions, constraints, values, relevant history, and uncertainty into the free-form `context` field.

## Quick Install

```bash
npm install
```

Create a local config and env file:

```powershell
Copy-Item config-example.json config.json
Copy-Item .env.example .env
```

Edit `config.json` with your topic, context, minds, and provider choices. Then edit `.env` and fill in at least one provider key.

Run a session:

```bash
npm run roundtable
```

The CLI prints progress and writes a markdown transcript under `sessions/`.

## Setup

```bash
npm install
```

Create a local env file:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and fill in at least one provider key. The default example uses DeepSeek:

```env
DEEPSEEK_API_KEY=your_key_here
```

Do not commit `.env`. It is ignored by git.

The example session uses DeepSeek `deepseek-v4-flash` with thinking enabled and `reasoningEffort: "high"`. DeepSeek supports `high` and `max`; set `reasoningEffort` in the JSON config. OpenAI and Claude/Anthropic remain available by changing provider fields in the JSON.

## Run

```bash
Copy-Item config-example.json config.json
npm run roundtable
```

You can also pass a custom config path:

```bash
npm run roundtable -- --config path/to/config.json
```

## Session Config

`config-example.json` is the config template. Copy it to `config.json` for local runs. It contains:

- `topic`: the question for the roundtable
- `context`: free-form rich background for the session
- `workingLanguage`: free-form language instruction injected into every prompt
- `globalMindsProvider`: default provider for minds that do not specify one
- `moderatorProvider`: provider for the final moderator summary
- `compressionProvider`: optional provider for live compressed CLI monitoring output
- `providers`: OpenAI and Claude/Anthropic provider definitions
- `minds`: the personas participating in this session
- `disabledMinds`: optional parking lot for personas you want to keep in the JSON but not run

With `globalMindsProvider` set, each mind entry only needs:

```json
{
  "personaPath": "agents/feynman/SKILL.md"
}
```

Set `provider` on a mind only when it should override `globalMindsProvider`.

The persona folder must include `persona.json` beside `SKILL.md`:

```json
{
  "id": "feynman",
  "name": "Richard Feynman"
}
```

Set `compressionProvider` to any configured provider name to print a compressed version of every generated speaker response while the run is in progress. These compressed summaries are for CLI monitoring and are not added to the reader-facing transcript.

Change the JSON for every new session. There is no cross-session memory in the MVP.

Each run writes two files under `sessions/`:

- `*.md`: reader-facing transcript
- `*.dev.md`: development log with every LLM prompt and response

## Prompt Templates

The predetermined prompt structures live in `prompts/`:

- `prompts/round1.md`: initial opinion prompt
- `prompts/round2.md`: cross-commentary and updated opinion prompt
- `prompts/moderator.md`: final moderator summary prompt
- `prompts/compression.md`: live CLI monitoring compression prompt

These files are intended for context engineering. Keep placeholders like `{{topic}}`, `{{context}}`, and `{{persona}}` intact unless you also update the renderer.
