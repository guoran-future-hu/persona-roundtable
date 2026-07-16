import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadSessionConfig, parseSessionConfig } from "../src/config";

test("parseSessionConfig loads topic, context, providers, and minds", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    testMode: true,
    outputLanguage: "Use English.",
    moderatorProvider: "openai",
    compressionProvider: "deepseek",
    urgencyProvider: "deepseek",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      deepseek: { type: "deepseek", model: "deepseek-v4-flash", apiKeyEnv: "DEEPSEEK_API_KEY", reasoningEffort: "max" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
    disabledMinds: [
      {
        personaPath: "personas/feynman-perspective/SKILL.md",
        provider: "deepseek",
      },
    ],
  });

  assert.equal(config.topic, "A question");
  assert.equal(config.context, "rich context");
  assert.equal(config.maxRounds, 5);
  assert.equal(config.testMode, true);
  assert.equal(config.outputLanguage, "Use English.");
  assert.equal(config.compressionProvider, "deepseek");
  assert.equal(config.urgencyProvider, "deepseek");
  assert.equal(config.providers.openai.type, "openai");
  assert.equal(config.providers.deepseek.reasoningEffort, "max");
  assert.equal(config.minds[0]?.personaPath, "personas/naval-perspective/SKILL.md");
  assert.equal(config.disabledMinds?.[0]?.personaPath, "personas/feynman-perspective/SKILL.md");
});

test("parseSessionConfig applies globalMindsProvider when a mind omits provider", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    globalMindsProvider: "openai",
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      deepseek: { type: "deepseek", model: "deepseek-v4-flash", apiKeyEnv: "DEEPSEEK_API_KEY" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
      },
      {
        personaPath: "personas/feynman-perspective/SKILL.md",
        provider: "deepseek",
      },
    ],
  });

  assert.equal(config.globalMindsProvider, "openai");
  assert.equal(config.minds[0]?.provider, "openai");
  assert.equal(config.minds[1]?.provider, "deepseek");
});

test("parseSessionConfig accepts provider aliases and openrouter", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    globalMindsProvider: "claude",
    moderatorProvider: "codex",
    compressionProvider: "openrouter",
    providers: {
      codex: { type: "codex", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      claude: { type: "claude", model: "claude-sonnet-4-5", apiKeyEnv: "ANTHROPIC_API_KEY" },
      openrouter: { type: "openrouter", model: "openai/gpt-5.5", apiKeyEnv: "OPENROUTER_API_KEY" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
      },
    ],
  });

  assert.equal(config.providers.codex.type, "codex");
  assert.equal(config.providers.claude.type, "claude");
  assert.equal(config.providers.openrouter.type, "openrouter");
  assert.equal(config.minds[0]?.provider, "claude");
});

test("loadSessionConfig resolves mind identity from persona folder metadata", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "persona-roundtable-config-"));
  const personaDir = join(configDir, "personas", "naval");
  await mkdir(personaDir, { recursive: true });
  await writeFile(join(personaDir, "SKILL.md"), "persona", "utf8");
  await writeFile(join(personaDir, "persona.json"), JSON.stringify({ id: "naval", name: "Naval" }), "utf8");
  await writeFile(
    join(configDir, "config.json"),
    JSON.stringify({
      topic: "A question",
      context: "rich context",
      maxRounds: 5,
      moderatorProvider: "openai",
      providers: {
        openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      },
      minds: [
        {
          personaPath: "personas/naval/SKILL.md",
          provider: "openai",
        },
      ],
    }),
    "utf8",
  );

  const config = await loadSessionConfig(join(configDir, "config.json"));

  assert.equal(config.minds[0]?.id, "naval");
  assert.equal(config.minds[0]?.name, "Naval");
});

test("loadSessionConfig loads Markdown context relative to the session config without changing line breaks", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "persona-roundtable-context-"));
  const personaDir = join(configDir, "personas", "naval");
  await mkdir(personaDir, { recursive: true });
  await writeFile(join(personaDir, "SKILL.md"), "persona", "utf8");
  await writeFile(join(personaDir, "persona.json"), JSON.stringify({ id: "naval", name: "Naval" }), "utf8");
  await writeFile(join(configDir, "context.md"), "# Background\r\n\r\nA precise first paragraph.\r\nSecond line.\r\n", "utf8");
  await writeFile(
    join(configDir, "config.json"),
    JSON.stringify({
      topic: "A question",
      context: "context.md",
      maxRounds: 5,
      moderatorProvider: "openai",
      providers: {
        openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      },
      minds: [{ personaPath: "personas/naval/SKILL.md", provider: "openai" }],
    }),
    "utf8",
  );

  const config = await loadSessionConfig(join(configDir, "config.json"));

  assert.equal(config.context, "# Background\r\n\r\nA precise first paragraph.\r\nSecond line.\r\n");
});
test("parseSessionConfig defaults testMode to false", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
  });

  assert.equal(config.testMode, false);
  assert.equal(config.discussionMode, "simple");
  assert.equal(config.compressionProvider, undefined);
});

test("parseSessionConfig rejects missing maxRounds", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: "rich context",
        moderatorProvider: "openai",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [
          {
            personaPath: "personas/naval-perspective/SKILL.md",
            provider: "openai",
          },
        ],
      }),
    /maxRounds must be a positive integer/,
  );
});

test("parseSessionConfig rejects invalid maxRounds values", () => {
  for (const maxRounds of [2.5, 0, -1]) {
    assert.throws(
      () =>
        parseSessionConfig({
          topic: "A question",
          context: "rich context",
          maxRounds,
          moderatorProvider: "openai",
          providers: {
            openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
          },
          minds: [
            {
              personaPath: "personas/naval-perspective/SKILL.md",
              provider: "openai",
            },
          ],
        }),
      /maxRounds must be a positive integer/,
    );
  }
});

test("parseSessionConfig treats none compression provider as disabled", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    moderatorProvider: "openai",
    compressionProvider: "none",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
  });

  assert.equal(config.compressionProvider, undefined);
});

test("parseSessionConfig allows empty disabledMinds", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      {
        personaPath: "personas/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
    disabledMinds: [],
  });

  assert.deepEqual(config.disabledMinds, []);
});

test("parseSessionConfig rejects unsupported reasoning effort values", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        moderatorProvider: "deepseek",
        providers: {
          deepseek: {
            type: "deepseek",
            model: "deepseek-v4-flash",
            apiKeyEnv: "DEEPSEEK_API_KEY",
            reasoningEffort: "turbo",
          },
        },
        minds: [{ personaPath: "x.md", provider: "deepseek" }],
      }),
    /reasoningEffort must be one of/,
  );
});

test("parseSessionConfig rejects unknown mind provider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        moderatorProvider: "openai",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ personaPath: "x.md", provider: "missing" }],
      }),
    /unknown provider/,
  );
});

test("parseSessionConfig rejects missing mind provider without globalMindsProvider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        moderatorProvider: "openai",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ personaPath: "x.md" }],
      }),
    /minds\[0\]\.provider must be a non-empty string when globalMindsProvider is not set/,
  );
});

test("parseSessionConfig rejects unknown globalMindsProvider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        globalMindsProvider: "missing",
        moderatorProvider: "openai",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ personaPath: "x.md" }],
      }),
    /globalMindsProvider 'missing' is not defined in providers/,
  );
});

test("parseSessionConfig rejects unknown compression provider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        moderatorProvider: "openai",
        compressionProvider: "missing",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ personaPath: "x.md", provider: "openai" }],
      }),
    /compressionProvider 'missing' is not defined in providers/,
  );
});

test("parseSessionConfig rejects unknown urgency provider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        maxRounds: 5,
        moderatorProvider: "openai",
        urgencyProvider: "missing",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ personaPath: "x.md", provider: "openai" }],
      }),
    /urgencyProvider 'missing' is not defined in providers/,
  );
});

test("parseSessionConfig accepts dynamic mode and maxTurns with at least three minds", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    discussionMode: "dynamic",
    maxTurns: 6,
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      { personaPath: "personas/a/SKILL.md", provider: "openai" },
      { personaPath: "personas/b/SKILL.md", provider: "openai" },
      { personaPath: "personas/c/SKILL.md", provider: "openai" },
    ],
  });

  assert.equal(config.discussionMode, "dynamic");
  assert.equal(config.maxTurns, 6);
});

test("parseSessionConfig treats null maxTurns as the dynamic fallback", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    discussionMode: "dynamic",
    maxTurns: null,
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      { personaPath: "personas/a/SKILL.md", provider: "openai" },
      { personaPath: "personas/b/SKILL.md", provider: "openai" },
      { personaPath: "personas/c/SKILL.md", provider: "openai" },
    ],
  });

  assert.equal(config.maxTurns, undefined);
});

test("parseSessionConfig rejects invalid dynamic mode settings", () => {
  const base = {
    topic: "A question",
    context: "rich context",
    maxRounds: 5,
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
  };

  assert.throws(
    () =>
      parseSessionConfig({
        ...base,
        discussionMode: "dynamic",
        minds: [
          { personaPath: "personas/a/SKILL.md", provider: "openai" },
          { personaPath: "personas/b/SKILL.md", provider: "openai" },
        ],
      }),
    /requires at least three active minds/,
  );

  assert.throws(
    () =>
      parseSessionConfig({
        ...base,
        discussionMode: "dynamic",
        maxTurns: 2,
        minds: [
          { personaPath: "personas/a/SKILL.md", provider: "openai" },
          { personaPath: "personas/b/SKILL.md", provider: "openai" },
          { personaPath: "personas/c/SKILL.md", provider: "openai" },
        ],
      }),
    /must be at least the active mind count/,
  );

  assert.throws(
    () =>
      parseSessionConfig({
        ...base,
        discussionMode: "dynamic",
        maxTurns: 1.5,
        minds: [
          { personaPath: "personas/a/SKILL.md", provider: "openai" },
          { personaPath: "personas/b/SKILL.md", provider: "openai" },
          { personaPath: "personas/c/SKILL.md", provider: "openai" },
        ],
      }),
    /maxTurns must be a positive integer/,
  );

  assert.throws(
    () =>
      parseSessionConfig({
        ...base,
        discussionMode: "automatic",
        minds: [{ personaPath: "personas/a/SKILL.md", provider: "openai" }],
      }),
    /discussionMode must be 'simple' or 'dynamic'/,
  );
});