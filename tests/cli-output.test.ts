import assert from "node:assert/strict";
import test from "node:test";
import { formatLiveOutput, formatLiveProgress } from "../src/cli-output";

test("formats live speaker output consistently", () => {
  assert.equal(
    formatLiveOutput({ phase: "round-1", phaseLabel: "Round 1", speaker: "Naval", content: "first line\nsecond line" }),
    "Round 1 · Naval\n  first line\n  second line",
  );
  assert.equal(
    formatLiveOutput({ phase: "dynamic-turn-5", phaseLabel: "Turn 5", speaker: "Naval", content: "dynamic response" }),
    "Turn 5 · Naval\n  dynamic response",
  );
  assert.equal(
    formatLiveOutput({ phase: "final-summary", phaseLabel: "Moderator Final Summary", speaker: "Moderator", content: "final summary" }),
    "Final summary · Moderator\n  final summary",
  );
});

test("only exposes compact urgency progress to the live CLI", () => {
  const urgency = "Urgency after turn 4 · Naval=none · Paul Graham=strong → next: Paul Graham";
  assert.equal(formatLiveProgress(urgency), urgency);
  assert.equal(formatLiveProgress("[Naval] invites [Paul Graham] as follow-up speaker"), "[Naval] invites [Paul Graham] as follow-up speaker");
  assert.equal(formatLiveProgress("Round 1: Naval"), undefined);
  assert.equal(formatLiveProgress("Moderator check: Turn 5"), undefined);
});