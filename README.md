<div align="center">

# persona-roundtable

**让多个 AI 思维人格围绕同一个问题，进行结构化、可追踪的圆桌讨论。**

[English](README_EN.md) · 中文

</div>

> 中文完整文档正在整理中。当前页面先提供项目入口、文档导航和 README 文件结构；详细安装与配置说明请查看 [English README](README_EN.md)。

[快速开始](#快速开始) · [效果示例](#效果示例) · [工作原理](#工作原理) · [仓库结构](#仓库结构)

## 项目简介

`persona-roundtable` 是一个 TypeScript CLI。你可以为一场讨论配置主题、背景、多个 persona 和不同模型提供商，让它们分别发言，再由 moderator 组织进展并生成总结。

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

> TODO: 后续补充真实 session 截图或代表性中文对话。

## 快速开始

```bash
npm install
```

创建本地配置：

```powershell
Copy-Item config-example.json config.json
Copy-Item .env.example .env
```

编辑 `.env` 填写实际使用的 provider API key，再编辑 `config.json`，然后运行：

```bash
npm run roundtable
```

如果只想做不调用模型 API 的确定性测试：

```bash
npm run roundtable -- --test-mode
```

完整参数、provider 和 persona 配置见 [English README — Config](README_EN.md#config)。

## 工作原理

```text
JSON config
    │
    ├── topic + context
    ├── active minds ──> persona prompts ──> independent responses
    └── providers      ──> model calls
                                      │
                                      ▼
                              moderator review
                                      │
                                      ▼
                              final summary
```

当前支持两种讨论模式：

- `simple`：按轮次让所有 active minds 发言，再由 moderator 评审进展。
- `dynamic`：根据邀请、紧迫度和 moderator 决策动态选择下一位发言者。

## 仓库结构

```text
persona-roundtable/
├── README.md              # 中文入口（当前为布局与导航版本）
├── README_EN.md           # English full documentation
├── src/                   # TypeScript runtime code
│   ├── app.ts             # CLI entry point
│   └── models/            # provider adapters
├── config-example.json    # session configuration template
├── agents/                # persona skills and research material
├── prompts/               # discussion and context-engineering templates
├── tests/                 # automated tests
└── sessions/              # generated transcripts (ignored by git)
```

## 文档路线图

| 文档 | 用途 |
| --- | --- |
| [README.md](README.md) | 中文项目介绍、入口和导航 |
| [README_EN.md](README_EN.md) | English installation, configuration, runtime, and development notes |
| [config-example.json](config-example.json) | 可复制的 session 配置模板 |
| [prompts/](prompts/) | 讨论流程和 context engineering 模板 |
| [agents/](agents/) | 可参与讨论的 persona 定义 |

## 贡献与许可证

欢迎提交 issue、改进 prompt、添加 persona 或完善文档。本项目采用 [Apache License 2.0](LICENSE) 开源。

目前请先查看 [English README](README_EN.md) 了解项目细节。
