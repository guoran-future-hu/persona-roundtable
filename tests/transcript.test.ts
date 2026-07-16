import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SessionConfig } from "../src/config";
import type { SessionResult } from "../src/session-types";
import { saveTranscript } from "../src/transcript";

const config: SessionConfig = {
  topic: "A transcript test",
  context: "context",
  maxRounds: 1,
  testMode: true,
  moderatorProvider: "fake",
  providers: {},
  minds: [],
};

const result: SessionResult = {
  topic: config.topic,
  context: config.context,
  discussionMode: "simple",
  modelCalls: [],
  rounds: [],
  moderatorReviews: [],
  dynamicTurns: [],
  urgencyPolls: [],
  dynamicModeratorChecks: [],
};

test("saveTranscript keeps debug artifacts disabled by default", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "persona-roundtable-transcript-"));
  const paths = await saveTranscript(config, result, outputDir);

  assert.equal(paths.devLogPath, undefined);
  assert.equal(paths.speakerCountLogPath, undefined);
  const files = await readdir(outputDir);
  assert.equal(files.length, 1);
  assert.ok(files[0]?.endsWith("-a-transcript-test.md"));
});
test("saveTranscript writes debug artifacts when requested", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "persona-roundtable-transcript-debug-"));
  const paths = await saveTranscript(config, result, outputDir, undefined, { debug: true });

  assert.ok(paths.devLogPath?.endsWith(".dev.md"));
  assert.ok(paths.speakerCountLogPath?.endsWith(".speaker-counts.tmp.json"));
  const files = await readdir(outputDir);
  assert.equal(files.length, 3);
});
