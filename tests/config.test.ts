import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSessionConfig } from "../config";

test("parseSessionConfig loads topic, context, providers, and minds", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    testMode: true,
    workingLanguage: "Use English.",
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
      deepseek: { type: "deepseek", model: "deepseek-v4-flash", apiKeyEnv: "DEEPSEEK_API_KEY", reasoningEffort: "max" },
    },
    minds: [
      {
        id: "naval",
        name: "Naval",
        personaPath: "agents/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
    disabledMinds: [
      {
        id: "feynman",
        name: "Richard Feynman",
        personaPath: "agents/feynman-perspective/SKILL.md",
        provider: "deepseek",
      },
    ],
  });

  assert.equal(config.topic, "A question");
  assert.equal(config.context, "rich context");
  assert.equal(config.testMode, true);
  assert.equal(config.workingLanguage, "Use English.");
  assert.equal(config.providers.openai.type, "openai");
  assert.equal(config.providers.deepseek.reasoningEffort, "max");
  assert.equal(config.minds[0]?.name, "Naval");
  assert.equal(config.disabledMinds?.[0]?.name, "Richard Feynman");
});

test("parseSessionConfig defaults testMode to false", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      {
        id: "naval",
        name: "Naval",
        personaPath: "agents/naval-perspective/SKILL.md",
        provider: "openai",
      },
    ],
  });

  assert.equal(config.testMode, false);
});

test("parseSessionConfig allows empty disabledMinds", () => {
  const config = parseSessionConfig({
    topic: "A question",
    context: "rich context",
    moderatorProvider: "openai",
    providers: {
      openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
    },
    minds: [
      {
        id: "naval",
        name: "Naval",
        personaPath: "agents/naval-perspective/SKILL.md",
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
        moderatorProvider: "deepseek",
        providers: {
          deepseek: {
            type: "deepseek",
            model: "deepseek-v4-flash",
            apiKeyEnv: "DEEPSEEK_API_KEY",
            reasoningEffort: "medium",
          },
        },
        minds: [{ id: "x", name: "X", personaPath: "x.md", provider: "deepseek" }],
      }),
    /reasoningEffort must be 'high' or 'max'/,
  );
});

test("parseSessionConfig rejects unknown mind provider", () => {
  assert.throws(
    () =>
      parseSessionConfig({
        topic: "A question",
        context: {},
        moderatorProvider: "openai",
        providers: {
          openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        },
        minds: [{ id: "x", name: "X", personaPath: "x.md", provider: "missing" }],
      }),
    /unknown provider/,
  );
});
