import assert from "node:assert/strict";
import { test } from "node:test";
import type { LoadedSessionConfig } from "../src/config";
import { AnthropicModel } from "../src/models/anthropic";
import { DeepSeekModel, extractDeepSeekText } from "../src/models/deepseek";
import { createDummyModels } from "../src/models/dummy";
import { createModels } from "../src/models/factory";
import { OpenAIModel } from "../src/models/openai";
import { OpenRouterModel } from "../src/models/openrouter";
import type { HttpFetch } from "../src/models/types";

test("OpenAIModel creates a Responses API request shape", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { output_text: "openai text" };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new OpenAIModel({ apiKey: "key", model: "gpt-5.5", fetch: fakeFetch });
  const output = await model.generate([
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);

  assert.equal(output, "openai text");
  assert.deepEqual(capturedBody, {
    model: "gpt-5.5",
    input: [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ],
    max_output_tokens: 1400,
  });
});

test("OpenAIModel can disable reasoning for short outputs", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { output_text: "short text" };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new OpenAIModel({ apiKey: "key", model: "gpt-5.5", fetch: fakeFetch });

  await model.generate([{ role: "user", content: "compress this" }], {
    maxOutputTokens: 400,
    thinkingEnabled: false,
  });

  assert.deepEqual(capturedBody, {
    model: "gpt-5.5",
    input: [{ role: "user", content: "compress this" }],
    reasoning: { effort: "none" },
    max_output_tokens: 400,
  });
});

test("AnthropicModel creates a Messages API request shape", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { content: [{ type: "text", text: "claude text" }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new AnthropicModel({ apiKey: "key", model: "claude-sonnet-4-5", fetch: fakeFetch });
  const output = await model.generate([
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" },
  ]);

  assert.equal(output, "claude text");
  assert.deepEqual(capturedBody, {
    model: "claude-sonnet-4-5",
    max_tokens: 1400,
    system: "system prompt",
    messages: [{ role: "user", content: "user prompt" }],
  });
});

test("AnthropicModel can disable thinking for short outputs", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { content: [{ type: "text", text: "short text" }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new AnthropicModel({ apiKey: "key", model: "claude-sonnet-4-5", fetch: fakeFetch });

  await model.generate([{ role: "user", content: "compress this" }], {
    maxOutputTokens: 400,
    thinkingEnabled: false,
  });

  assert.deepEqual(capturedBody, {
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: "",
    messages: [{ role: "user", content: "compress this" }],
    thinking: { type: "disabled" },
  });
});

test("OpenRouterModel creates a chat completions request shape and can disable reasoning", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { choices: [{ message: { content: "openrouter text" } }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new OpenRouterModel({ apiKey: "key", model: "openai/gpt-5.5", fetch: fakeFetch });
  const output = await model.generate(
    [
      { role: "developer", content: "developer prompt" },
      { role: "user", content: "compress this" },
    ],
    {
      maxOutputTokens: 400,
      thinkingEnabled: false,
    },
  );

  assert.equal(output, "openrouter text");
  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(capturedBody, {
    model: "openai/gpt-5.5",
    messages: [
      { role: "system", content: "developer prompt" },
      { role: "user", content: "compress this" },
    ],
    reasoning: { effort: "none" },
    max_tokens: 400,
    stream: false,
  });
});

test("DeepSeekModel creates a high-effort thinking chat completions request shape", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { choices: [{ message: { content: "deepseek text" } }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new DeepSeekModel({ apiKey: "key", model: "deepseek-v4-flash", fetch: fakeFetch });
  const output = await model.generate([
    { role: "developer", content: "developer prompt" },
    { role: "assistant", content: "previous assistant answer" },
    { role: "user", content: "user prompt" },
  ]);

  assert.equal(output, "deepseek text");
  assert.equal(capturedUrl, "https://api.deepseek.com/chat/completions");
  assert.deepEqual(capturedBody, {
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: "developer prompt" },
      { role: "assistant", content: "previous assistant answer" },
      { role: "user", content: "user prompt" },
    ],
    thinking: { type: "enabled" },
    reasoning_effort: "high",
    max_tokens: 1400,
    stream: false,
  });
});

test("DeepSeekModel supports max reasoning effort", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { choices: [{ message: { content: "deepseek text" } }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new DeepSeekModel({
    apiKey: "key",
    model: "deepseek-v4-flash",
    fetch: fakeFetch,
    reasoningEffort: "max",
  });

  await model.generate([{ role: "user", content: "user prompt" }]);

  assert.equal((capturedBody as { reasoning_effort: string }).reasoning_effort, "max");
});

test("DeepSeekModel can disable thinking for short outputs", async () => {
  let capturedBody: unknown;
  const fakeFetch: HttpFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body) as unknown;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { choices: [{ message: { content: "short text" } }] };
      },
      async text() {
        return "";
      },
    };
  };

  const model = new DeepSeekModel({ apiKey: "key", model: "deepseek-v4-flash", fetch: fakeFetch });

  await model.generate([{ role: "user", content: "compress this" }], {
    maxOutputTokens: 400,
    thinkingEnabled: false,
  });

  assert.deepEqual(capturedBody, {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "compress this" }],
    thinking: { type: "disabled" },
    max_tokens: 400,
    stream: false,
  });
});

test("extractDeepSeekText rejects empty message content", () => {
  assert.throws(
    () =>
      extractDeepSeekText({
        choices: [{ finish_reason: "length", message: { content: "" } }],
      }),
    /empty message text output.*finish_reason=length/,
  );
});

test("createDummyModels queues compression responses in runtime call order", async () => {
  const config: LoadedSessionConfig = {
    configPath: "config.json",
    configDir: ".",
    topic: "A question",
    context: {},
    maxRounds: 2,
    testMode: true,
    moderatorProvider: "deepseek",
    compressionProvider: "deepseek",
    providers: {
      deepseek: {
        type: "deepseek",
        model: "deepseek-v4-flash",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        reasoningEffort: "high",
      },
    },
    minds: [
      { id: "andrej-karpathy", name: "Andrej Karpathy", personaPath: "karpathy.md", provider: "deepseek" },
      { id: "trump", name: "Donald Trump", personaPath: "trump.md", provider: "deepseek" },
    ],
  };

  const models = createDummyModels(config);
  const model = models.deepseek;

  assert.ok(model);
  assert.equal(await model.generate([{ role: "user", content: "round 1 karpathy" }]), "[andrej-karpathy, round 1]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 1 karpathy" }]), "[andrej-karpathy, round 1 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "round 1 trump" }]), "[trump, round 1]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 1 trump" }]), "[trump, round 1 compressed]");
  assert.equal(
    (JSON.parse(await model.generate([{ role: "user", content: "moderator round 1" }])) as { roundSummary: string }).roundSummary,
    "[moderator, round 1 summary]",
  );
  assert.equal(await model.generate([{ role: "user", content: "compress moderator round 1" }]), "[moderator, round 1 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "round 2 karpathy" }]), "[andrej-karpathy, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 2 karpathy" }]), "[andrej-karpathy, round 2 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "round 2 trump" }]), "[trump, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 2 trump" }]), "[trump, round 2 compressed]");
  assert.equal(
    (JSON.parse(await model.generate([{ role: "user", content: "moderator round 2" }])) as { roundSummary: string }).roundSummary,
    "[moderator, round 2 summary]",
  );
  assert.equal(await model.generate([{ role: "user", content: "compress moderator round 2" }]), "[moderator, round 2 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "<stop_reason>" }]), "[moderator, final summary]");
});

test("createModels only requires keys for providers used by the session", () => {
  const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

  process.env.DEEPSEEK_API_KEY = "deepseek-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const config: LoadedSessionConfig = {
      configPath: "config.json",
      configDir: ".",
      topic: "A question",
      context: {},
      maxRounds: 2,
      testMode: false,
      moderatorProvider: "deepseek",
      providers: {
        openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        claude: { type: "anthropic", model: "claude-sonnet-4-5", apiKeyEnv: "ANTHROPIC_API_KEY" },
        deepseek: {
          type: "deepseek",
          model: "deepseek-v4-flash",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          reasoningEffort: "high",
        },
      },
      minds: [{ id: "naval", name: "Naval", personaPath: "naval.md", provider: "deepseek" }],
    };

    const models = createModels(config);
    assert.deepEqual(Object.keys(models), ["deepseek"]);
  } finally {
    if (previousDeepSeekKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
    }

    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }

    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  }
});

test("createModels includes the compression provider when configured", () => {
  const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;

  process.env.DEEPSEEK_API_KEY = "deepseek-key";
  process.env.OPENAI_API_KEY = "openai-key";

  try {
    const config: LoadedSessionConfig = {
      configPath: "config.json",
      configDir: ".",
      topic: "A question",
      context: {},
      maxRounds: 2,
      testMode: false,
      moderatorProvider: "deepseek",
      compressionProvider: "openai",
      providers: {
        openai: { type: "openai", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        deepseek: {
          type: "deepseek",
          model: "deepseek-v4-flash",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          reasoningEffort: "high",
        },
      },
      minds: [{ id: "naval", name: "Naval", personaPath: "naval.md", provider: "deepseek" }],
    };

    const models = createModels(config);
    assert.deepEqual(Object.keys(models), ["deepseek", "openai"]);
  } finally {
    if (previousDeepSeekKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
    }

    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }
  }
});

test("createModels supports codex, claude, and openrouter provider types", () => {
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;

  process.env.OPENAI_API_KEY = "openai-key";
  process.env.ANTHROPIC_API_KEY = "anthropic-key";
  process.env.OPENROUTER_API_KEY = "openrouter-key";

  try {
    const config: LoadedSessionConfig = {
      configPath: "config.json",
      configDir: ".",
      topic: "A question",
      context: {},
      maxRounds: 2,
      testMode: false,
      moderatorProvider: "codex",
      compressionProvider: "openrouter",
      providers: {
        codex: { type: "codex", model: "gpt-5.5", apiKeyEnv: "OPENAI_API_KEY" },
        claude: { type: "claude", model: "claude-sonnet-4-5", apiKeyEnv: "ANTHROPIC_API_KEY" },
        openrouter: { type: "openrouter", model: "openai/gpt-5.5", apiKeyEnv: "OPENROUTER_API_KEY" },
      },
      minds: [{ id: "naval", name: "Naval", personaPath: "naval.md", provider: "claude" }],
    };

    const models = createModels(config);

    assert.ok(models.codex instanceof OpenAIModel);
    assert.ok(models.claude instanceof AnthropicModel);
    assert.ok(models.openrouter instanceof OpenRouterModel);
  } finally {
    if (previousOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAIKey;
    }

    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }

    if (previousOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    }
  }
});

test("createDummyModels produces randomized prompt-aware dynamic-mode responses", async () => {
  const config: LoadedSessionConfig = {
    configPath: "config.json",
    configDir: ".",
    topic: "A question",
    context: {},
    maxRounds: 2,
    discussionMode: "dynamic",
    maxTurns: 5,
    testMode: true,
    moderatorProvider: "moderator",
    providers: {
      alpha: { type: "openai", model: "fake", apiKeyEnv: "ALPHA_KEY" },
      beta: { type: "openai", model: "fake", apiKeyEnv: "BETA_KEY" },
      gamma: { type: "openai", model: "fake", apiKeyEnv: "GAMMA_KEY" },
      moderator: { type: "openai", model: "fake", apiKeyEnv: "MODERATOR_KEY" },
    },
    minds: [
      { id: "alpha", name: "Alpha", personaPath: "alpha.md", provider: "alpha" },
      { id: "beta", name: "Beta", personaPath: "beta.md", provider: "beta" },
      { id: "gamma", name: "Gamma", personaPath: "gamma.md", provider: "gamma" },
    ],
  };

  const models = createDummyModels(config);
  assert.equal(await models.alpha!.generate([{ role: "user", content: "You are playing Alpha" }]), "[alpha, opening]");
  assert.equal(await models.beta!.generate([{ role: "user", content: "You are playing Beta" }]), "[beta, opening]");
  assert.equal(await models.gamma!.generate([{ role: "user", content: "You are playing Gamma" }]), "[gamma, opening]");

  const openingReview = JSON.parse(
    await models.moderator!.generate([{ role: "user", content: "You are the moderator of a roundtable discussion.\n<discussion_history>" }]),
  ) as { decision: string };
  assert.equal(openingReview.decision, "continue");

  const alphaUrgency = JSON.parse(
    await models.alpha!.generate([{ role: "user", content: '{"urgency":"no_new_comment | minor_update | strong_need_to_respond"}' }]),
  ) as { urgency: string };
  const betaUrgency = JSON.parse(
    await models.beta!.generate([{ role: "user", content: '{"urgency":"no_new_comment | minor_update | strong_need_to_respond"}' }]),
  ) as { urgency: string };
  assert.ok(["no_new_comment", "minor_update", "strong_need_to_respond"].includes(alphaUrgency.urgency));
  assert.ok(["no_new_comment", "minor_update", "strong_need_to_respond"].includes(betaUrgency.urgency));

  const dynamicTurn = JSON.parse(
    await models.alpha!.generate([{ role: "user", content: '<persona_card id="Alpha">\n"inviteMindId": null' }]),
  ) as { content: string; inviteMindId: string | null };
  assert.match(dynamicTurn.content, /^\[alpha, test-mode dynamic response/);
  assert.ok(dynamicTurn.inviteMindId === null || ["beta", "gamma"].includes(dynamicTurn.inviteMindId));

  const moderatorCheck = JSON.parse(
    await models.moderator!.generate([{ role: "user", content: "You are the moderator of a dynamic roundtable discussion." }]),
  ) as { action: string };
  assert.ok(["continue", "summarize", "end_discussion"].includes(moderatorCheck.action));
  assert.equal(
    await models.moderator!.generate([{ role: "user", content: "<stop_reason>" }]),
    "[moderator, test-mode final summary]",
  );
});
test("model adapters request native structured output", async () => {
  const structuredOutput = {
    name: "decision",
    schema: {
      type: "object",
      properties: { decision: { type: "string" } },
      required: ["decision"],
      additionalProperties: false,
    },
  };
  const bodies: unknown[] = [];
  const fetchFor = (payload: unknown): HttpFetch => async (_url, init) => {
    bodies.push(JSON.parse(init.body) as unknown);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() { return payload; },
      async text() { return ""; },
    };
  };

  await new OpenAIModel({ apiKey: "key", model: "gpt", fetch: fetchFor({ output_text: "{}" }) }).generate([], { structuredOutput });
  await new AnthropicModel({ apiKey: "key", model: "claude", fetch: fetchFor({ content: [{ type: "text", text: "{}" }] }) }).generate([], { structuredOutput });
  await new OpenRouterModel({ apiKey: "key", model: "model", fetch: fetchFor({ choices: [{ message: { content: "{}" } }] }) }).generate([], { structuredOutput });
  await new DeepSeekModel({ apiKey: "key", model: "deepseek", fetch: fetchFor({ choices: [{ message: { content: "{}" } }] }) }).generate([], { structuredOutput });

  assert.equal((bodies[0] as { text: { format: { type: string; strict: boolean } } }).text.format.type, "json_schema");
  assert.equal((bodies[0] as { text: { format: { strict: boolean } } }).text.format.strict, true);
  assert.equal((bodies[1] as { output_config: { format: { type: string } } }).output_config.format.type, "json_schema");
  assert.equal((bodies[2] as { response_format: { type: string; json_schema: { strict: boolean } } }).response_format.type, "json_schema");
  assert.equal((bodies[2] as { response_format: { json_schema: { strict: boolean } } }).response_format.json_schema.strict, true);
  assert.deepEqual((bodies[3] as { response_format: unknown }).response_format, { type: "json_object" });
});