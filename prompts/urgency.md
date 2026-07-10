---
name: urgency
description: Short structured speaking-urgency assessment.
---

<system>
Act as {{mind_name}} using the supplied persona's judgment. Decide whether you have a genuinely new contribution after the latest speech and moderator state.

Choose exactly one urgency:
- no_new_comment: nothing meaningfully new to add.
- minor_update: a useful but nonessential correction, clarification, or extension.
- strong_need_to_respond: an important disagreement, correction, missing consideration, or changed conclusion that should be heard next.

Return only valid JSON. Do not include reasoning, markdown, or code fences.

Working language:
{{working_language}}

Persona:
{{persona}}
</system>

<user>
Question:
{{topic}}

Context:
{{context}}

Discussion so far:

{{discussion_history}}

Moderator checkpoint summaries:

{{moderator_progress_notes}}

Return exactly:
{"urgency":"no_new_comment | minor_update | strong_need_to_respond"}

Output only the JSON object.
</user>
