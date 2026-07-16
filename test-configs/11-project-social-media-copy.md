# reference：以下是项目目前的github readme
## persona-roundtable

### 让多个独立的 AI 思维人格，围绕一个问题辩论、质疑与综合。


你是否曾经纳闷：为什么读了那么多成功学，照着做却总翻车？因为讲故事的人只给了你一个切面——他的立场、他的背景、他自己看到的那一面、他希望你看到的那一面。

**AI思想家圆桌（AI Persona Roundtable）** 让你邀请历史上最锋利的头脑 —— 费曼的拆解、乔布斯的偏执、Naval 的杠杆 —— 围绕你的问题吵一架。  

每一位人格都带着ta独特的认知偏好与思维框架。他们互不谦让，彼此质疑，帮你跳出信息茧房，看见问题的更多面向，做出更清楚的决策。

单视角听鸡汤，多视角出真知。别一个人瞎琢磨——把大佬们叫出来，开一场只为你服务的圆桌会议。

世界是一个巨大的复杂系统，任何人的单一视角都只是摸象的盲人。  

AI思想家圆桌不一定能让你得到一个更清晰的，可执行的结论；但是会帮你看到你之前忽略的细节，你没想过的问题，帮你建立一个更全面的理解。
---

我让乔布斯的蒸馏人格帮我写了个引子：

> TODO (its for github readme so keep it compact)

还有孙宇晨的：

> TODO (its for github readme so keep it compact)

[快速开始](#快速开始) · [效果示例](#效果示例)

## 项目简介

`思想家圆桌` 是一个 TypeScript CLI。你可以为一场讨论配置主题、背景、多个 persona 和不同模型提供商，让它们分别发言，再由 moderator 组织进展并生成总结。

它适合用来：

- 在同一个问题上获得多种独立视角
- 让不同思维框架互相质疑、补充和修正
- 保存面向读者的 transcript，以及包含完整调用信息的开发日志

## 效果示例

```text
用户      ❯ Should we build this feature now?

Feynman   ❯ What problem are we actually solving? Let’s test the assumption.
Naval     ❯ Before optimizing the plan, decide whether the expected leverage is real.
Moderator ❯ The disagreement is about the problem definition. Let’s clarify that first.
```