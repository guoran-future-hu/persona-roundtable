<div align="center">

# 思想家圆桌 · Persona Roundtable

### 让多个独立的 AI 思维人格，围绕同一个问题辩论、质疑与综合。

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Runtime: TypeScript](https://img.shields.io/badge/runtime-TypeScript-3178C6.svg)](#如何使用)
![Supported Providers](https://img.shields.io/badge/providers-OpenAI%20%7C%20Claude%20%7C%20DeepSeek%20%7C%20OpenRouter-5B5BD6)

<img src="./hero-image.png" alt="思想家圆桌 Persona Roundtable" width="70%">

### [EN English version →](README.en.md)

</div>

我们以为自己在思考，很多时候只是在重复熟悉的观点。

一个人的经验、立场和知识边界，决定了他能看见什么。无论是职业选择、技术判断、关系问题，还是社会议题，单一视角都很容易变成盲人摸象。

**思想家圆桌（Persona Roundtable）** 让你邀请历史上最锋利的头脑（的AI蒸馏人格）——费曼的拆解、乔布斯的偏执、纳瓦尔的杠杆——围绕你的问题吵一架。

每一位人格都带着 ta 独特的认知偏好与思维框架。他们互不谦让，彼此质疑，帮你跳出信息茧房，看见问题的更多面向，做出更清楚的决策。

**单视角听鸡汤，多视角出真知**。别一个人瞎琢磨——把大佬们叫出来，开一场只为你服务的圆桌会议。

或者就看他们吵架吧，反正挺好玩的。

---

<div align="center">

<a href="#项目简介">📖 项目简介</a>　·　<a href="#项目是怎么工作的">🧭 工作原理</a>　·　<a href="#如何使用">🚀 如何使用</a>　·　<a href="#效果示例">✨ 效果示例</a>

</div>

## 项目简介

`persona-roundtable` 是一个 TypeScript CLI：

- 为一场圆桌讨论配置主题和背景。**提供的背景越丰富，人格们能发挥的空间也越大。**
- 邀请多个不同的 AI 蒸馏人格，为他们配置你指定的模型提供商。**模型越聪明，讨论效果越好。**
- 看人格们开始激烈争论。
- 主持人进行阶段性小结，并在最后给出一份横跨多个视角的总结。

当前支持两种讨论模式：

`simple` 简单模式：
- 所有人格依次发言，主持人每轮之后进行小结
- 固定发言顺序，固定总轮数
- 守序善良的过家家模式（但是大家还是会吵起来）

`dynamic` 动态模式：
- 人格可以直接指定下一位发言者
- 在每个发言结束后，人格们会表达自己的回应紧迫度。系统动态决定下一位发言者。
- 主持人根据进度进行小结，或提前终止圆桌讨论
- 充满激情的 heated discussion

### 我让乔布斯的蒸馏人格帮我写了个引子

> 大多数人害怕真正的对话。
>
> 他们读一本书，听一场TED演讲，关注一个KOL，然后照着做。当结果不如预期时，他们归咎于自己不够努力、不够聪明。但问题从来不在这里。问题是你只听到了一个声音，一个被精心包装过的片面真实。
>
> 我做产品从来不问用户想要什么，因为用户只能告诉你他们已知的东西。他们无法想象一个没有键盘的手机，因为他们从未见过。同样的道理，当你只问一个人的意见时，你得到的只是他的局限。
>
> 这就是为什么这个项目有意思。
>
> 它不是给你更多答案。世界上已经有太多答案了，大多数是垃圾。它给你的是**摩擦**——让费曼拆解你的假设，让Naval计算你的杠杆，让我告诉你哪些东西该砍掉。然后我们互相质疑。因为真正的好想法需要被砸过、摔过、活下来才算数。
>
> 独处时的确信是最危险的。你需要反对的声音，你需要有人当面告诉你"This is shit." 你需要被挑战到重新思考一切，然后剩下的那部分，才是值得保留的。
>
> 大多数人不会这么做。他们找认同自己的人聊天，他们害怕被否定。但如果你想做出真正了不起的东西，这是唯一的路。
>
> 享受这场争吵。希望它能让你不舒服。

## 效果示例

*所有demo经过压缩简化处理

### 示例一：AI 与意识

**问题：当前 AI 系统是否已经接近拥有意识？**

```text
Round 1
费曼     ❯ 不要把“表现得像有意识”当成“拥有主观体验”。现在的 AI 没有身体、痛觉或持续的内在生活。
Karpathy ❯ LLM 是“召唤的幽灵”：能模拟反思，却没有内在状态。
主持人   ❯ 双方都判断当前 AI 没有意识；下一轮需要区分不同意识定义，并说明判断标准。

Round 2
费曼     ❯ 看它能否在被打断后保持自我连续性，或在没有提示时产生并维持自己的目标。
Karpathy ❯ 行为可以被模拟。更关键的是在线更新、不可重置的自我目标，以及不是由 prompt 触发的自主行为。
主持人   ❯ 讨论从抽象判断推进到可操作的测试和工程指标，但两套标准仍需对照。

Round 3
费曼     ❯ 行为测试无法证明主观体验；真正重要的信号可能是受苦能力。
Karpathy ❯ 与其执着于“意识”二分，不如观察在线损失函数和自主性：系统是否开始维护自己的目标与存在。
主持人   ❯ 当前 AI 仍没有意识；未来应重点观察在线学习、自主目标和自我维护，并警惕情感投射与责任错位。
```

---

### 示例二：复杂系统与社会周期

**问题：为什么一个越来越高效的社会系统，反而可能变得脆弱？**

```text
Round 1
毛泽东   ❯ 生产力提高并不自动带来普遍受益；当资源和决策权过度集中，社会矛盾会积累，劳动者往往承受更大压力。
达利欧   ❯ 从周期看，债务、财富差距和外部竞争叠加后，系统在高效率时也可能更脆弱。
主持人   ❯ 两个视角都指向同一风险：增长速度超过了系统的自我修正能力。

Round 2
毛泽东   ❯ 不能把周期当成宿命。关键是让基层经验进入决策，及时调整分配和制度。
达利欧   ❯ 参与需要制度化：公开数据、反方评估和压力测试，不能只依赖个人自觉。
主持人   ❯ 分歧从“谁来推动变化”转向“如何把反馈嵌入制度”。

Round 3
毛泽东   ❯ 制度要让权力更能回应社会，让公众保留参与和纠错的空间。
达利欧   ❯ 制度还要能跨代运行，有冗余、透明指标和独立监督，把危机变成可管理的调整。
主持人   ❯ 共识是：复杂性本身不是问题；缺少反馈、分配修正和纠错机制，才会让效率变成脆弱。
```

---

### 示例三：开源项目的独立性与机构支持（动态模式）

**问题：一个已有数百名开发者使用、并形成志愿者社区的本地 AI 圆桌开源项目，应该接受大公司的支持吗？对方希望影响路线图和治理。**

```text
Round 1
Paul Graham ❯ 先别把“社区或机构”当成二选一。接受资源前，测试用户是否愿意支持项目；一旦依赖资助方，路线图会被它的需求慢慢拉走。
马斯克       ❯ 接受资源，但绝不交出控制权：成立独立基金会，社区占董事会多数，工程师由基金会派工，并在合同中写死退出机制。
乔布斯       ❯ 真正的问题是谁决定产品是什么。若“专业用户功能”破坏体验，资助就是收购的预热；宁可拒绝，也不要失去产品灵魂。
主持人       ❯ 三方都把控制权视为红线，但对“治理结构能否抵挡资助方影响”存在根本分歧。

紧迫度投票
Paul Graham: 简要补充 · 马斯克: 强烈发言意愿
→ 下一位发言者: 马斯克（按回应紧迫度选择）

马斯克       ❯ 只谈有机增长太理想化。没有稳定基础设施，增长会停；现在就设边界、接受资源。保罗，纯热爱能付服务器账单吗？
邀请发言者: Paul Graham

Paul Graham ❯ 资源极度不对称时，钱会像重力一样改变日常优先级，基金会可能只是装饰。先做用户付费实验；若公司真想支持，就应接受无特殊地位、无路线图控制权的条件。
邀请发言者: 乔布斯

乔布斯       ❯ 你不能同时取悦志愿者、赞助商，又保留灵魂。条款挡不住每天的小妥协；聚焦做出用户愿意付费支持的产品，拒绝这笔钱。

紧迫度投票
Paul Graham: 简要补充 · 马斯克: 强烈发言意愿
→ 下一位发言者: 马斯克（按回应紧迫度选择）

马斯克       ❯ 拒绝不等于独立，可能只是等死。接受资源、把控制权锁进基金会；对方若不同意这些边界，就拒绝。别在中间摇摆。
主持人       ❯ 讨论已收敛为三条可执行路径：拒绝并靠用户支持、以严格基金会条件接受、或先做用户付费与赞助方意图测试；各方核心立场已充分交锋，结束讨论。
```

## 如何使用

**省流：让你的 AI/Agent 看，帮你跑。**

1. **安装项目**

   本项目需要一个**独立 API key**。目前订阅版 ChatGPT、Claude、Cursor 等不能直接运行。

   ```bash
   git clone https://github.com/guoran-future-hu/persona-roundtable.git
   cd persona-roundtable
   npm install
   ```

2. **配置 API key**

   将要使用的 API key 填入 `.env`。

3. **准备配置文件**

   把 `config.json` 复制成自己的配置文件，并按需修改主题、背景、人格、模型和讨论模式。仓库也提供 `config-cn.json` 和 `config-en.json` 两个语言版本。

4. **运行讨论**

   默认配置使用 DeepSeek：

   ```bash
   npm run roundtable
   # 或显式指定配置
   npm run roundtable -- --config config-custom.json
   ```

5. **使用测试模式（可选）**

   不调用 API 时，加上 `--test-mode`：

   ```bash
   npm run roundtable -- --config config.json --test-mode
   ```

6. **调试输出（可选）**

   默认只保存完整 transcript。需要开发日志和发言统计时，加上 `--debug`（或 `--debug-mode`）：

   ```bash
   npm run roundtable -- --config config.json --debug
   ```

7. **查看结果**

   讨论记录会保存到 `sessions/`。`test-configs/` 提供了一些可参考的讨论主题和参与人格。

## 运行原理

下面四个环节都会调用模型：

- **Minds**：`minds` 里的每个人格负责从自己的认知框架出发思考和发言。默认由 `globalMindsProvider` 路由，也可以给单个人格指定 provider。

- **Moderator**：主持人使用 `moderatorProvider`。在 `simple` 模式下，每轮发言后总结进展；在 `dynamic` 模式下，根据讨论状态进行阶段性总结或提前结束；最后再给出跨视角的总总结。

- **Compressor**：`compressionProvider` 指定模型，将人格和主持人的发言即时压成短摘要。方便在 CLI 监控讨论进度；此功能只影响实时显示，不会替换完整 transcript。`compressionEnabled` 默认是 `true`。

- **Urgency vote**：`dynamic` 模式下，每次发言后，人格会投票表示自己是 `no_new_comment`、`minor_update` 还是 `strong_need_to_respond`。系统优先选择回应紧迫度最高的人；如果上一位人格直接邀请了下一位，则先按邀请继续。

### 配置说明

根目录的 `config.json` 是默认讨论配置：

- `topic`：讨论的问题
- `context`：相关背景和细节；可直接填写文字，也可填写相对于 config 文件的 `.md` 路径。运行时会读取 `.md` 作为上下文
- `minds`：参与讨论的人格
- `outputLanguage`：主要的显示语言，例如 `chinese` 或 `english`，由模型直接读取，没有硬编码。
- `globalMindsProvider`、`moderatorProvider`：推荐使用支持 reasoning 的主力模型
- `compressionEnabled`：CLI 实时压缩，默认 `true`；设为 `false` 时直接显示原始发言
- `compressionProvider`、`urgencyProvider`：推荐使用轻量小模型
- `discussionMode`：`simple` 或 `dynamic`；动态模式至少需要 3 位人格
- `maxRounds`：`simple` 模式的最大讨论轮数。建议不要设置太高，避免后期的历史记录太长，影响模型注意力
- `maxTurns`：`dynamic` 模式的最大发言回合数；省略时默认为 `maxRounds × active minds`，且不能小于 active minds 数量。建议不要设置太高，避免后期的历史记录太长，影响模型注意力

`providers` 里放模型和环境变量名：

```json
"providers": {
  "primary": {
    "type": "openai",
    "model": "gpt-5.6-terra",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

## 后续路线图

- [x] 优化prompting模式，更高效利用LLM缓存命中机制
- [ ] 加入压缩先前讨论的功能，提高LLM在讨论后期的输出质量
- [ ] 支持更多context（多个文件，工作目录等）
- [ ] 加入联网搜索和其它tool calling功能
- [ ] 加入GUI

## 关于这个Idea背后的哲学想法

成功学鸡汤有一个特点：当事人只描述了几个特定角度下的几个特定因素。或许是因为传播学限制，没人可以完整的把决策背后的context都讲出来；亦或许是当事人自己也没看清楚。他们的打法在当时能work，但是换个人，换个环境，换个时代，可能就不work了

其实不只是成功学，我们看待一切事物都会落入这个局限之中

世界是一个巨大的复杂系统，任何的单一视角都是盲人摸象

但是如果细心留意，就可以把很多现象背后的脉络给找出来，看到一些平常不会看到的隐藏视角，能够获得对全局更好的理解

这个项目与其说是一个思维工具，其实更像是我的哲学理念和叙事的具象化吧

对这个话题感兴趣？欢迎来看我的blog：

[小红书](http://xhslink.com/o/9CCXWsADxr8) ｜ [公众号](https://mp.weixin.qq.com/s/5T4K93nJtKRXFmMIgu92ig) ｜ [英文版博客](https://guoran-future-hu.github.io/blogs/Causality/)

我经常会跟AI聊很抽象的东西，现在有一些问题我更爱跟这个圆桌聊了

## Acknowledgement

本项目大量使用了 [Huashu](https://github.com/alchaincyf) 的工作。多数 persona card 来自或基于他的 [Nuwa Skill](https://github.com/alchaincyf/nuwa-skill/tree/main)。

- `buffett` 卡片来自 [Panmax/buffett-skill](https://github.com/Panmax/buffett-skill)，`dalio` 卡片来自 [Panmax/dalio-skill](https://github.com/Panmax/dalio-skill)；两者均使用了 Nuwa 生态。
- `mao` 卡片来自 [leezythu/maoxuan-skill](https://github.com/leezythu/maoxuan-skill)，并保留了其对 [MaoZeDongAnthology](https://github.com/weiyinfu/MaoZeDongAnthology) 和 [tong-jincheng-skill](https://github.com/hotcoffeeshake/tong-jincheng-skill) 的相关致谢。
- `sun` 卡片来自 [0xquqi/sun-skill](https://github.com/0xquqi/sun-skill)，并使用了公开材料。

## License

本项目采用 [MIT License](LICENSE) 开源。