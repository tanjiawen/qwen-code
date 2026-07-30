# DataFlow — 模型在环的数据准备 Harness

## 基本信息

- **作者/团队**：梁昊，元枢智汇联合创始人、北京大学大数据科学研究中心博士
- **GitHub**：
  - [OpenDCAI/DataFlow](https://github.com/OpenDCAI/DataFlow)（7.1k stars）
  - [OpenDCAI/DataFlow-WebUI](https://github.com/OpenDCAI/DataFlow-WebUI)（Harness 工程层）
  - [OpenDCAI/DataFlow-Skills](https://github.com/OpenDCAI/DataFlow-Skills)（程序性知识）
- **论文**：arXiv 2607.16617（DataFlow-Harness），HuggingFace Papers daily #2
- **研讨会报告主题**："Data Harness：构建模型在环的数据准备系统"

## 已有研究

本项目在 v0.21.2-study.1 中已深度研究（2026-07-29），详见：

- 设计文档：`docs/design/2026-07-29-harness-engineering-improvements.md`
- 记忆文件：`reference/dataflow-repos.md`

## 研讨会新视角

梁昊在研讨会上的报告将 DataFlow 重新定位为 **Agent Harness 的一个特化实例**，
而非仅仅是数据 pipeline 框架。核心论点：

> "Agent Harness 不只是工具调用层，也可以成为数据生产系统的核心架构。"
> "从 pipeline 思维转向 Harness 思维。"

### 与 qwen-code 的已落地关联

DataFlow-Harness 论文的四个改进方向中，三个已在 qwen-code 中落地：

| #   | DataFlow 理念              | qwen-code 落地                       | 状态        |
| --- | -------------------------- | ------------------------------------ | ----------- |
| 1   | 文件编辑前外部修改检测     | `FileReadCache` + `checkPriorRead()` | ✅ 上游已有 |
| 2   | 多文件编辑安全（字段契约） | SKILL.md grep-before-signature 规则  | ✅ 已实现   |
| 3   | 程序性知识编码（Skills）   | Blueprint + Constraints frontmatter  | ✅ 已实现   |
| 4   | 工具选择软引导             | —                                    | ⏸ 搁置     |

### DataFlow 的 Harness 组件映射

| DataFlow 组件     | Harness 角色 | qwen-code 对应                             |
| ----------------- | ------------ | ------------------------------------------ |
| Operator          | 原子操作单元 | Tool（read_file, edit, run_shell_command） |
| Pipeline          | 操作编排     | Skill（/bugfix, /feat-dev 的步骤序列）     |
| Global Storage    | 共享状态     | 文件系统 + memories/                       |
| Serving Interface | 外部交互     | MCP 协议                                   |
| Compile           | 运行前验证   | typecheck + lint                           |
| WebUI             | 可视化       | CLI TUI                                    |
| DataFlow-Agent    | Agent 运行时 | qwen-code 核心循环                         |
| DataFlow-Skills   | 程序性知识   | SKILL.md + constraints                     |

## 参考链接

- DataFlow 主仓库：https://github.com/OpenDCAI/DataFlow
- DataFlow-WebUI：https://github.com/OpenDCAI/DataFlow-WebUI
- DataFlow-Skills：https://github.com/OpenDCAI/DataFlow-Skills
- 论文：https://arxiv.org/abs/2607.16617
