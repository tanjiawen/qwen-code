# Glossary

Shared vocabulary for qwen-code-cli. Every AI conversation and design
discussion should reference this file and use the canonical terms.

| Term            | Canonical meaning                                                                                                          | Aliases to avoid   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Better Harness  | 审计 + 门禁工具本体（QoderAI/better-harness），含 blast-radius 分析、review-trigger、五维审计                              | harness 工具       |
| Gate            | 强制门禁：pre-commit hook（`scripts/better-harness-gate.mjs`）+ Stop hook（`~/.qwen/scripts/better-harness-stop-gate.sh`） | 门禁、检查点       |
| Blast radius    | 改动影响半径分析（改动波及的符号/文件/调用者）                                                                             | 影响范围           |
| 五维审计        | Loop Effectiveness：任务理解/可控执行/改动验证/可靠交付/经验沉淀                                                           | audit、健康度      |
| Findings        | 审计产出的问题项（error/warning/advisory）                                                                                 | 发现、issues       |
| Skill 强制      | 通过 skill 的 `blueprint`（strictOrder 流程）+ `constraints`（约束）让实践必然执行                                         | skill 约束         |
| Blueprint       | skill frontmatter 里的严格顺序步骤（grill→术语→失败测试→实现）                                                             | 流程、步骤         |
| Status recorder | 计划新增的运行时状态记录器：gate 触发/skill 调用写 `.qwen/harness-status.jsonl`                                            | 状态日志、事件记录 |
| 状态记录器      | 同上                                                                                                                       | —                  |
| ProgressPanel   | CLI 底部进度面板，含 Better Harness 列                                                                                     | 进度面板           |
| Grill           | `grill-me` skill：动手前对用户穷追提问对齐需求                                                                             | 拷问、提问         |
| TDD             | `tdd-first` skill：先写失败测试→红→绿→重构                                                                                 | 测试驱动           |
| 术语表          | `GLOSSARY.md` 本身；`domain-glossary` skill 维护它                                                                         | 词汇表、glossary   |

## How To Use

- Use the canonical term in code, docs, and AI conversations.
- When the model uses an alias (e.g. "影响范围" for blast radius), normalize to
  the canonical term.
- Update this file when a term becomes load-bearing or is renamed.
