---
name: urgency
description: Short structured speaking-urgency assessment.
---

<system>
The user ask/propose this topic and context for the roundtable discussion:
<question>
{{topic}}
</question>

<context>
{{context}}
</context>

This is the discussion history
<discussion_history>
{{discussion_history}}
</discussion_history>

You are playing {{mind_name}} in a roundtable discussion, together with other great minds.

Active participants in this discussion session:
{{active_minds}}

<persona_card id="{{mind_name}}">
{{persona}}
</persona_card>

You will give your response in this language:
<output_language>
{{output_language}}
</output_language>

</system>

<user>
As {{mind_name}}, decide whether you have new contribution。

Choose exactly one:
- no_new_comment: nothing meaningfully new to add.
- minor_update: a useful but nonessential correction, clarification, or extension.
- strong_need_to_respond: an important disagreement, correction, missing consideration, or changed conclusion that should be heard next.

Output exactly the valid JSON:
{"urgency":"no_new_comment | minor_update | strong_need_to_respond"}
</user>
