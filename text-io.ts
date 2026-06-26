import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export async function readUtf8Text(path: string): Promise<string> {
  return decodeUtf8(await readFile(path), path);
}

export function readUtf8TextSync(path: string): string {
  return decodeUtf8(readFileSync(path), path);
}

export async function writeUtf8Text(path: string, text: string): Promise<void> {
  await writeFile(path, text, "utf8");
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  let text: string;

  try {
    text = utf8Decoder.decode(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid UTF-8. Save it as UTF-8 and retry. Decoder error: ${message}`);
  }

  if (text.includes("\u0000")) {
    throw new Error(`${path} contains NUL bytes. It may be UTF-16 or binary; save text files as UTF-8.`);
  }

  if (text.includes("\uFFFD")) {
    throw new Error(`${path} contains replacement characters. Reopen the source and save a clean UTF-8 copy.`);
  }

  return text;
}
