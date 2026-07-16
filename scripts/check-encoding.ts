import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { TextDecoder } from "node:util";

const decoder = new TextDecoder("utf-8", { fatal: true });
const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules"]);
const textExtensions = new Set([
  ".cjs",
  ".cmd",
  ".cts",
  ".env",
  ".example",
  ".local",
  ".gitignore",
  ".json",
  ".js",
  ".md",
  ".mts",
  ".ps1",
  ".sh",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const textNames = new Set(["LICENSE", "README"]);
const failures: string[] = [];

for await (const path of walk(root)) {
  if (!isTextFile(path)) {
    continue;
  }

  try {
    const text = decoder.decode(await readFile(path));

    if (text.includes("\u0000")) {
      failures.push(`${relative(root, path)}: contains NUL bytes; possible UTF-16 or binary file`);
    }

    if (text.includes("\uFFFD")) {
      failures.push(`${relative(root, path)}: contains replacement characters`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${relative(root, path)}: invalid UTF-8 (${message})`);
  }
}

if (failures.length > 0) {
  console.error("Encoding check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Encoding check passed: all project text files are valid UTF-8.");
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
      continue;
    }

    if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function isTextFile(path: string): boolean {
  const name = path.split(/[\\/]/).at(-1) ?? "";
  const dotIndex = name.lastIndexOf(".");
  const extension = dotIndex === -1 ? "" : name.slice(dotIndex);

  return textNames.has(name) || textExtensions.has(extension);
}
