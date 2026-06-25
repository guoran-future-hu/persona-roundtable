import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePromptTemplate, renderTemplate } from "../prompt-templates";

test("parsePromptTemplate extracts system and user blocks", () => {
  const template = parsePromptTemplate(`---
name: test
---

<system>
System {{value}}
</system>

<user>
User {{value}}
</user>
`);

  assert.equal(template.system, "System {{value}}");
  assert.equal(template.user, "User {{value}}");
});

test("renderTemplate replaces placeholders in both messages", () => {
  const messages = renderTemplate(
    {
      system: "System {{value}}",
      user: "User {{value}}",
    },
    { value: "content" },
  );

  assert.deepEqual(messages, [
    { role: "system", content: "System content" },
    { role: "user", content: "User content" },
  ]);
});

test("renderTemplate rejects missing placeholders", () => {
  assert.throws(
    () =>
      renderTemplate(
        {
          system: "System {{missing}}",
          user: "User",
        },
        {},
      ),
    /Missing prompt template variable: missing/,
  );
});
