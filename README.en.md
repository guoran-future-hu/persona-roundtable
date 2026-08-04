<div align="center">

# Persona Roundtable

### Let independent AI minds debate, challenge, and synthesize around one question.

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Runtime: TypeScript](https://img.shields.io/badge/runtime-TypeScript-3178C6.svg)](#usage)
![Supported Providers](https://img.shields.io/badge/providers-OpenAI%20%7C%20Claude%20%7C%20DeepSeek%20%7C%20OpenRouter-5B5BD6)

<img src="./hero-image.png" alt="Persona Roundtable" width="100%">

### [CN 中文版 →](README.md)

</div>

We often think we are thinking when we are really repeating familiar opinions.

Our experience, position, and knowledge boundaries shape what we can see. Whether it is a career choice, a technology judgment, a relationship, or a social question, a single perspective can easily mistake one part for the whole.

**Persona Roundtable** lets you invite (the SKILL.md distillation of) great minds—Feynman's decomposition, Jobs's insistence, Naval's leverage—to argue about your question.

Each mind brings a distinct cognitive bias and framework. They challenge one another, helping you escape a single information bubble and make clearer decisions.

**One perspective gives you a story, several give you insight.** Bring the minds to the table and let them argue for you.

Or just watch them fight. It is fun anyway.

---

<div align="center">

<a href="#overview">📖 Overview</a>　·　<a href="#how-it-works">🧭 How it works</a>　·　<a href="#usage">🚀 Usage</a>　·　<a href="#examples">✨ Examples</a>

</div>

## Overview

`persona-roundtable` is a TypeScript CLI that:

- configures a question and context for a roundtable;
- invites multiple AI minds and routes them to your chosen providers;
- let the minds carry out a spicy and heated argument;
- have a moderator to summarize throughout the discussion and produce a cross-perspective conclusion.

**Richer context and stronger models generally lead to higher-quality discussions.**

It supports two discussion modes:

**`simple`**

- Minds speak in a fixed order.
- The moderator summarizes after each round.
- The order and total number of rounds are fixed.
- A polite, well-behaved discussion—though the minds still end up arguing.

**`dynamic`**

- Minds can invite the next speaker.
- After each turn, minds express how urgently they want to respond; the system chooses the next speaker dynamically.
- The moderator summarizes progress or ends the roundtable early.
- A dynamic and heated discussion.

### I asked the Steve Jobs persona to generate this introduction

> Most people think they're thinking when really they're just rehearsing their one perspective. That's not thinking. That's being trapped in dogma—living with the results of other people's thinking™.
>
> The Persona Roundtable forces you to do what Picasso, Einstein, and da Vinci did naturally: connect dots from wildly different points of view. Feynman doesn't think like me. I don't think like Naval. And that's the point. You don't get wisdom from one smart person agreeing with you. You get it when your assumptions get punched in the face by someone who sees what you're too close to see.
>
> "One perspective gives you a story, several give you insight." Exactly. The author got this one right.
>
> When we created the Mac, the iPod, the iPhone—nobody in that room agreed on everything. That was the magic. We built products that made our hearts sing precisely because we fought about every pixel, every interaction, every "good enough" that wasn't.
>
> This tool is a bicycle for your mind. Use it when you're stuck. Use it when you're too comfortable. Use it when your gut says you're missing something but you don't know what.
>
> And for God's sake—don't just read the transcript. Let the disagreement change your mind. That's the whole widget.
>
> *— Steve Jobs, called in for a roundtable by an anonymous nobody who probably dropped out of college too*

I haven't dropped out yet, though.


## Examples

*Examples are compressed and simplified.*

### Example 1: AI and consciousness

**Question: Are current AI systems close to being conscious?**

```text
Round 1
Feynman   ❯ Do not confuse acting conscious with having subjective experience. Current AI has no body, pain, or continuous inner life.
Karpathy  ❯ An LLM is a summoned ghost: it can simulate reflection without an internal state.
Moderator ❯ Both views reject present-day consciousness. Next, define consciousness and make the criteria testable.

Round 2
Feynman   ❯ Check whether a system maintains continuity after interruption or forms goals without a prompt.
Karpathy  ❯ Behavior can be simulated. Look for online learning, non-resettable goals, and autonomous behavior.
Moderator ❯ The discussion has moved from abstraction to engineering tests, but the standards still differ.

Round 3
Feynman   ❯ Behavioral tests cannot prove subjective experience; the ability to suffer may matter more.
Karpathy  ❯ Instead of a binary label, observe online objectives and self-preservation.
Moderator ❯ Current AI is not conscious. Watch autonomy, online learning, and self-maintenance while avoiding projection.
```

### Example 2: Open-source independence and institutional support (dynamic mode)

**Question: An open-source local AI roundtable already has hundreds of developers and a volunteer community. Should it accept support from a large company that wants influence over its roadmap and governance?**

```text
Round 1
Paul Graham ❯ Do not treat the community and the institution as mutually exclusive. Before accepting resources, test whether users will support the project; once dependent on a sponsor, the roadmap will gradually bend toward its needs.
Elon Musk   ❯ Accept the resources, but never surrender control: create an independent foundation, give the community a board majority, let the foundation assign engineers, and put an exit mechanism in the contract.
Steve Jobs  ❯ The real question is who decides what the product is. If “professional user features” damage the experience, the sponsorship is a prelude to an acquisition. Better to refuse than lose the product's soul.
Moderator   ❯ All three treat control as a red line, but they fundamentally disagree on whether governance can resist sponsor influence.

Urgency vote
Paul Graham: minor update · Elon Musk: strong need to respond
→ Next speaker: Elon Musk (selected by response urgency)

Elon Musk   ❯ Organic growth alone is too idealistic. Without stable infrastructure, growth stops; set boundaries now and accept resources. Paul, can pure enthusiasm pay the server bills?
Invitation: Paul Graham

Paul Graham ❯ When resources are extremely asymmetric, money changes daily priorities like gravity. The foundation may be decoration. First run a user-payment experiment; if the company truly wants to help, it should accept no special status and no control over the roadmap.
Invitation: Steve Jobs

Steve Jobs  ❯ You cannot please volunteers and sponsors while keeping your soul. Contract terms cannot stop daily compromises; focus on making something users willingly support and reject the money.

Urgency vote
Paul Graham: minor update · Elon Musk: strong need to respond
→ Next speaker: Elon Musk (selected by response urgency)

Elon Musk   ❯ Refusing support does not guarantee independence; it may just mean waiting to die. Accept resources and lock control into the foundation. If the sponsor rejects those boundaries, refuse the deal. Do not hover in the middle.
Moderator   ❯ The discussion has converged on three executable paths: refuse and rely on users, accept under strict foundation conditions, or first test user payments and sponsor intent. The core positions have been fully challenged.
```

## Usage

**Short version: let your AI agent help you run it.**

1. **Install**

   This project requires a **standalone API key**. Subscription access to ChatGPT, Claude, Cursor, and similar products cannot run it directly.

   ```bash
   git clone https://github.com/guoran-future-hu/persona-roundtable.git
   cd persona-roundtable
   npm install
   ```

2. **Set your API key**

   Add the key for your provider to `.env`.

3. **Use a built-in or custom persona**

   The repository includes 15 built-in personas, but does not have the distillation feature. Each persona directory currently uses a single `SKILL.md` file as its persona definition. You can add your own persona to `./personas` and reference it from `minds` in the selected config.

4. **Prepare a config**

   Use `config-cn.json` for Chinese discussions and `config-en.json` for English discussions. Edit the selected file's topic, context, minds, providers, and discussion mode as needed.

5. **Run a discussion**

   Choose a config explicitly:

   ```bash
   npm run roundtable -- --config config-cn.json
   # English discussion
   npm run roundtable -- --config config-en.json
   ```

6. **Run without an API for testing (optional)**

   Add `--test-mode`:

   ```bash
   npm run roundtable -- --config config-en.json --test-mode
   ```

7. **Enable debug output (optional)**

   By default, only the full transcript is saved. Add `--debug` (or `--debug-mode`) to save the development log and speaker-count report:

   ```bash
   npm run roundtable -- --config config-en.json --debug
   ```

8. **Find the result**

   Sessions are saved under `sessions/`. The `test-configs/` directory contains ready-to-reference topics and invited minds.

## How it works

All four parts below make model calls:

- **Minds**: each persona in `minds` thinks and speaks from its own cognitive framework. They are routed through `globalMindsProvider` by default, or through an individual provider when configured.

- **Moderator**: the `moderatorProvider` summarizes the discussion. In `simple` mode it reviews each round; in `dynamic` mode it checks the state, summarizes when useful, or ends the discussion early. It produces the final cross-perspective summary at the end.

- **Compressor**: `compressionProvider` selects the model that turns persona and moderator outputs into short live summaries. This makes it easier to monitor a running CLI session; it only affects the live display and never replaces the full transcript. `compressionEnabled` defaults to `true`.

- **Urgency vote**: in `dynamic` mode, after each turn, minds report `no_new_comment`, `minor_update`, or `strong_need_to_respond`. The system normally selects the highest urgency; a direct invitation from the previous speaker takes priority.

### Configuration

`config-cn.json` and `config-en.json` are the repository's discussion configurations. Choose one explicitly based on the discussion language:

- `topic`: the question to discuss
- `context`: background and constraints; use inline text or a `.md` path relative to the config. The whole file is provided as context.
- `minds`: persona paths
- `outputLanguage`: the main display language, such as `chinese` or `english`; it is read directly by the model rather than hard-coded.
- `globalMindsProvider`, `moderatorProvider`: use capable reasoning models
- `compressionEnabled`: whether to enable live CLI compression; defaults to `true`, and `false` shows raw outputs
- `compressionProvider`, `urgencyProvider`: use lightweight models
- `discussionMode`: `simple` or `dynamic`; dynamic requires at least three minds
- `maxRounds`: maximum rounds in `simple` mode. Avoid setting it too high: long histories can reduce the model's attention to the current discussion.
- `maxTurns`: maximum speaker turns in `dynamic` mode; if omitted, defaults to `maxRounds × active minds`, and it cannot be lower than the number of active minds. Avoid setting it too high for the same reason.

Provider profiles contain the model and environment variable name:

```json
"providers": {
  "primary": {
    "type": "openai",
    "model": "gpt-5.6-terra",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

## Roadmap

- [x] Improve prompting and cache utilization
- [ ] Compress earlier discussion to improve late-round quality
- [ ] Support more context sources (multiple files, working directories)
- [ ] Add web search and other tool-calling features
- [ ] Add a GUI

## The idea behind the project

Success stories often describe only a few factors from a few angles. Context is lost in communication—or the storyteller never saw it at all. A strategy that works in one background, environment, or era may fail in another.

But this limitation is not unique to success stories. We fall into it whenever we try to understand anything.

The world is a huge complex system. Any single perspective is incomplete.

By looking closer, we can trace the patterns behind events, notice perspectives we would normally miss, and build a better understanding of the whole.

This project is less of a thinking tool than a concrete form of my philosophy and narrative.

Interested in the idea? Visit:

[RedNote](https://www.xiaohongshu.com/discovery/item/69bb803f000000001b003325?source=webshare&xhsshare=pc_web&xsec_token=ABnnzZBmsBf8S3h2zg98OgpF1H2PSVfpGVKpVGGAMgJmo=&xsec_source=pc_share) ｜ [WeChat](https://mp.weixin.qq.com/s/5T4K93nJtKRXFmMIgu92ig) ｜ [English blog](https://guoran-future-hu.github.io/blogs/Causality/)

I often discuss abstract ideas with AI. I found myself bringing more questions to this roundtable recently.

## Acknowledgement

This project builds heavily on the work of [Huashu](https://github.com/alchaincyf). Most persona cards come from or are based on his [Nuwa Skill](https://github.com/alchaincyf/nuwa-skill/tree/main).

- The `buffett` card comes from [Panmax/buffett-skill](https://github.com/Panmax/buffett-skill), and the `dalio` card comes from [Panmax/dalio-skill](https://github.com/Panmax/dalio-skill); both use the Nuwa ecosystem.
- The `mao` card comes from [leezythu/maoxuan-skill](https://github.com/leezythu/maoxuan-skill), with its acknowledgements to [MaoZeDongAnthology](https://github.com/weiyinfu/MaoZeDongAnthology) and [tong-jincheng-skill](https://github.com/hotcoffeeshake/tong-jincheng-skill) preserved.
- The `justin-sun` card comes from [0xquqi/sun-skill](https://github.com/0xquqi/sun-skill) and uses public materials.

## License

[MIT License](LICENSE)
