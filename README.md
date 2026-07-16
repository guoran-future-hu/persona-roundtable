<div align="center">

# persona-roundtable

### 让多个独立的 AI 思维人格，围绕一个问题辩论、质疑与综合。

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Runtime: TypeScript](https://img.shields.io/badge/runtime-TypeScript-3178C6.svg)](#快速开始)
[![Modes: Simple + Dynamic](https://img.shields.io/badge/modes-simple%20%2B%20dynamic-6B7280.svg)](#工作原理)

[English](README_EN.md) · **中文**

</div>

你是否曾经纳闷：为什么读了那么多成功学，照着做却总翻车？因为讲故事的人只给了你一个切面——他的立场、他的背景、他自己看到的那一面、他希望你看到的那一面。

**思想家圆桌（Persona Roundtable）** 让你邀请历史上最锋利的头脑（的AI蒸馏人格） —— 费曼的拆解、乔布斯的偏执、Naval 的杠杆 —— 围绕你的问题吵一架。  

每一位人格都带着ta独特的认知偏好与思维框架。他们互不谦让，彼此质疑，帮你跳出信息茧房，看见问题的更多面向，做出更清楚的决策。

单视角听鸡汤，多视角出真知。别一个人瞎琢磨——把大佬们叫出来，开一场只为你服务的圆桌会议。

---

我让乔布斯的蒸馏人格帮我写了个引子：

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


[快速开始](#快速开始) · [效果示例](#效果示例)

## 项目简介

`思想家圆桌` 是一个 TypeScript CLI 。
- 为一场圆桌讨论配置主题和背景。提供的背景越丰富，各位蒸馏人格能发挥的空间也越大。
- 邀请多个不同的AI蒸馏人格，为他们配置你指定的模型提供商。模型越聪明，讨论效果越好。
- 主持人进行阶段性小结，并在最后给出一份横跨多个视角的总结。

当前支持两种讨论模式：
- `simple`：简单模式
  - 所有人格依次发言，主持人每轮之后进行小结
  - 固定发言顺序，固定总轮数
  - 守序且善良的过家家模式
- `dynamic`：动态模式
  - 人格可以直接指定下一位follow-up发言者
  - 在每个发言结束后，人格们会表达自己的回应紧迫度。系统动态决定下一位发言者。
  - 主持人根据进度进行小结，或提前终止圆桌讨论
  - 真正充满热情的heated discussion

## 效果示例

### 示例一：AI 与意识

> **问题：当前 AI 系统是否已经接近拥有意识？**

```text
Round 1
费曼     ❯ 不要把“表现得像有意识”当成“拥有主观体验”。现在的 AI 没有身体、痛觉或持续的内在生活。
卡帕西   ❯ LLM 是“召唤的幽灵”：能模拟反思，却没有内在状态。
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

### 示例二：复杂系统与社会周期

> **问题：为什么一个越来越高效的社会系统，反而可能变得脆弱？**

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

### 示例三

## 如何使用

让你的AI / Agent看这段，帮你跑起来：



## TODO
- [x] 优化prompting模式，更高效利用LLM缓存命中机制
- [ ] 加入压缩先前讨论的功能，提高LLM在讨论后期的输出质量
- [ ] 支持更多context（多个文件，工作目录等）
- [ ] 加入联网搜索和其它tool calling功能
- [ ] 加入GUI

## 关于我这个idea背后的哲学想法


成功学鸡汤有一个特点：当事人只描述了几个特定角度下的几个特定因素。或许是因为传播学限制，没人可以完整的把决策背后的所有context都讲出来；亦或许是当事人自己也没看清楚。他们的打法在当时能work，但是换个人，换个环境，换个时代，可能就不work了。

世界是一个巨大的复杂系统，任何的单一视角都是盲人摸象。

但是如果细心留意，就可以把很多成功学鸡汤背后隐藏的脉络给找出来，就可以看到一些平常没机会看到的隐藏视角，能够获得对全局更好的理解。

这个项目与其说是一个帮你思考的工具，其实更像是我的哲学理念和叙事的具象化吧

对这个话题感兴趣？欢迎来看我的blog：
小红书 http://xhslink.com/o/9CCXWsADxr8 | 公众号 https://mp.weixin.qq.com/s/5T4K93nJtKRXFmMIgu92ig | 英文版 https://guoran-future-hu.github.io/blogs/Causality/


## 致谢

本项目大量使用了 [Huashu](https://github.com/alchaincyf) 的工作。多数长篇 persona card 来自或基于他的 [Nuwa Skill](https://github.com/alchaincyf/nuwa-skill/tree/main)。当前仓库中的 Huashu/Nuwa 卡片包括：`andrej-karpathy`、`elon-musk`、`feynman`、`ilya-sutskever`、`mrbeast`、`munger`、`naval`、`paul-graham`、`steve-jobs`、`taleb`、`trump`、`zhang-yiming`。但并非所有卡片都直接来自该仓库：

- `buffett` 卡片来自 [Panmax/buffett-skill](https://github.com/Panmax/buffett-skill)，`dalio` 卡片来自 [Panmax/dalio-skill](https://github.com/Panmax/dalio-skill)；两者均使用了 Nuwa 生态。
- `mao` 卡片来自 [leezythu/maoxuan-skill](https://github.com/leezythu/maoxuan-skill)，并保留了其对 [MaoZeDongAnthology](https://github.com/weiyinfu/MaoZeDongAnthology) 和 [tong-jincheng-skill](https://github.com/hotcoffeeshake/tong-jincheng-skill) 的相关致谢。
- `sun` 卡片来自 [0xquqi/sun-skill](https://github.com/0xquqi/sun-skill)，并使用了公开材料；`david`、`oliver`、`peter` 是本项目的测试人格。

主页面图片由 [Huashu Design](https://github.com/alchaincyf/huashu-design/tree/master) 生成。

## 贡献与许可证

欢迎提交issue或改进prompt。本项目采用 [MIT License](LICENSE) 开源。
