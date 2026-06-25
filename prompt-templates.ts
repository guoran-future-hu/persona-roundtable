import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChatMessage } from "./models/types";

export interface PromptTemplate {
  system: string;
  user: string;
}

export interface PromptTemplateSet {
  roundOne: PromptTemplate;
  roundTwo: PromptTemplate;
  moderator: PromptTemplate;
}

export const defaultPromptTemplates: PromptTemplateSet = {
  roundOne: loadPromptTemplate("prompts/round1.md"),
  roundTwo: loadPromptTemplate("prompts/round2.md"),
  moderator: loadPromptTemplate("prompts/moderator.md"),
};

export function renderTemplate(template: PromptTemplate, variables: Record<string, string>): ChatMessage[] {
  return [
    { role: "system", content: renderString(template.system, variables) },
    { role: "user", content: renderString(template.user, variables) },
  ];
}

export function parsePromptTemplate(source: string): PromptTemplate {
  const withoutFrontmatter = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const system = extractTag(withoutFrontmatter, "system");
  const user = extractTag(withoutFrontmatter, "user");

  return { system, user };
}

function loadPromptTemplate(path: string): PromptTemplate {
  return parsePromptTemplate(readFileSync(resolve(path), "utf8"));
}

function renderString(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) => {
    const value = variables[key];

    if (value === undefined) {
      throw new Error(`Missing prompt template variable: ${key}`);
    }

    return value;
  });
}

function extractTag(source: string, tag: "system" | "user"): string {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`);
  const match = source.match(pattern);

  if (!match?.[1]) {
    throw new Error(`Prompt template is missing <${tag}> block`);
  }

  return match[1].trim();
}
