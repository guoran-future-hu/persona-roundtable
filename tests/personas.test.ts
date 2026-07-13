import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LoadedSessionConfig } from "../src/config";
import { DummyModel } from "../src/models/dummy";
import { loadMinds } from "../src/personas";

function makeConfig(configDir: string, testMode: boolean): LoadedSessionConfig {
  return {
    configPath: join(configDir, "session.json"),
    configDir,
    topic: "A question",
    context: {},
    maxRounds: 2,
    testMode,
    moderatorProvider: "fake",
    providers: {
      fake: { type: "openai", model: "fake", apiKeyEnv: "FAKE_KEY" },
    },
    minds: [
      {
        id: "andrej-karpathy",
        name: "Andrej Karpathy",
        personaPath: "karpathy.md",
        provider: "fake",
      },
    ],
  };
}

test("loadMinds replaces persona text with a marker in test mode", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "project-prisms-personas-"));
  await writeFile(join(configDir, "karpathy.md"), "real persona text", "utf8");

  const minds = await loadMinds(makeConfig(configDir, true), {
    fake: new DummyModel(["unused"]),
  });

  assert.equal(minds[0]?.persona, "[andrej-karpathy, persona]");
});

test("loadMinds keeps persona file text outside test mode", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "project-prisms-personas-"));
  await writeFile(join(configDir, "karpathy.md"), "real persona text", "utf8");

  const minds = await loadMinds(makeConfig(configDir, false), {
    fake: new DummyModel(["unused"]),
  });

  assert.equal(minds[0]?.persona, "real persona text");
});
