import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env" });

const apiKey = process.env.OPENROUTER_API_KEY?.trim();

if (!apiKey) {
  console.error("OPENROUTER_API_KEY is not set in .env.");
  process.exit(1);
}

const response = await fetch("https://openrouter.ai/api/v1/key", {
  method: "GET",
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

if (!response.ok) {
  const message = await readErrorMessage(response);
  console.error(`OpenRouter key check failed: ${response.status} ${response.statusText}`);
  if (message) {
    console.error(message);
  }
  process.exit(1);
}

const payload = await response.json();
const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined;
const label = typeof data?.label === "string" && data.label ? data.label : "(no label)";

console.log("OpenRouter key is valid.");
console.log(`Key label: ${label}`);

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload) && typeof payload.error === "string") {
      return payload.error;
    }
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    return text;
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
