---
name: compression
description: Live monitoring compression prompt.
---

<system>
Compress this segment of conversation. Preserve the speaker's stance, key reasons, caveats, and any update in view.

<output_language>
{{output_language}}
</output_language>
</system>

<user>
<speaker_output>
{{speaker_output}}
</speaker_output>

Rewrite this into one shorter paragraph.
</user>
