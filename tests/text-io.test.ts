import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readUtf8Text } from "../text-io";

test("readUtf8Text reads Chinese UTF-8 text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "persona-roundtable-encoding-"));
  const path = join(dir, "persona.md");
  await writeFile(path, "费曼：不要自欺。", "utf8");

  assert.equal(await readUtf8Text(path), "费曼：不要自欺。");
});

test("readUtf8Text rejects invalid UTF-8 bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "persona-roundtable-encoding-"));
  const path = join(dir, "persona.md");
  await writeFile(path, Buffer.from([0xff, 0xfe, 0x41]));

  await assert.rejects(() => readUtf8Text(path), /not valid UTF-8|contains NUL bytes/);
});
