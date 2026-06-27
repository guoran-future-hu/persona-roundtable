import assert from "node:assert/strict";
import { test } from "node:test";
import type { LoadedSessionConfig } from "../config";
import { AnthropicModel } from "../models/anthropic";
import { DeepSeekModel, extractDeepSeekText } from "../models/deepseek";
import { createDummyModels, DummyModel } from "../models/dummy";
import { createModels } from "../models/factory";
import { OpenAIModel } from "../models/openai";
import type { HttpFetch } from "../models/types";

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

test("extractDeepSeekText rejects empty message content", () => {
  assert.throws(
    () =>
      extractDeepSeekText({
        choices: [{ finish_reason: "length", message: { content: "" } }],
      }),
    /empty message text output.*finish_reason=length/,
  );
});

test("DummyModel returns queued responses in order", async () => {
  const model = new DummyModel(["first", "second"]);

  assert.equal(await model.generate([{ role: "user", content: "prompt 1" }]), "first");
  assert.equal(await model.generate([{ role: "user", content: "prompt 2" }]), "second");
  assert.equal(model.calls.length, 2);
  assert.equal(model.calls[0]?.[0]?.content, "prompt 1");
});

test("createDummyModels queues responses in roundtable call order", async () => {
  const config: LoadedSessionConfig = {
    configPath: "config.json",
    configDir: ".",
    topic: "A question",
    context: {},
    testMode: true,
    moderatorProvider: "deepseek",
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
  assert.equal(await model.generate([{ role: "user", content: "round 1 trump" }]), "[trump, round 1]");
  assert.equal(await model.generate([{ role: "user", content: "round 2 karpathy" }]), "[andrej-karpathy, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "round 2 trump" }]), "[trump, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "moderator" }]), "[moderator, summary]");
});

test("createDummyModels queues compression responses in runtime call order", async () => {
  const config: LoadedSessionConfig = {
    configPath: "config.json",
    configDir: ".",
    topic: "A question",
    context: {},
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
  assert.equal(await model.generate([{ role: "user", content: "round 2 karpathy" }]), "[andrej-karpathy, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 2 karpathy" }]), "[andrej-karpathy, round 2 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "round 2 trump" }]), "[trump, round 2]");
  assert.equal(await model.generate([{ role: "user", content: "compress round 2 trump" }]), "[trump, round 2 compressed]");
  assert.equal(await model.generate([{ role: "user", content: "moderator" }]), "[moderator, summary]");
  assert.equal(await model.generate([{ role: "user", content: "compress moderator" }]), "[moderator, summary compressed]");
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
