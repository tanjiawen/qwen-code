# OpenCodeReview 确定性工程融入 qwen-code

- 日期：2026-08-07
- 参考研读：`~/open-code-review-study-notes.md`（alibaba/open-code-review 深度研读，19.4k★）
- 落地版本：v0.21.5-study.5（P1 + P2 已实现）
- 状态：✅ P1、P2 已落地；P3 待定

## 1. 目标

把 OCR 的"确定性工程 × Agent 混合"设计，像 Better Harness 那样，通过 qwen-code
现有的三条融入通道（hook / skill·blueprint·constraint / pre-commit gate）落地，
增强"三层防线"里 Hook 防不住语义层编造的那个缺口。

## 2. 能力盘点（为什么闭环不能靠 hook）

qwen-code 的 hook 事件（`packages/core/src/hooks/types.ts:24`）都是**单向**的：
执行 shell → 拦截（Stop exit 2）或记录（PostToolUse）。**没有**"把验证结果反馈给
模型、让它继续反思"的循环能力。因此：

- **机械层（hook）只能做单向确定性门禁**：过不了就拦，但不驱动重做。
- **闭环（验证→反思→再验证）只能靠 skill/constraint 语义层**让模型自觉遵循。

这是本方案最重要的边界，也是"为什么用 skill 而不是 hook"的根据。

## 3. 三个融入点

| 融入点          | 层     | 机制                                                     | 借鉴 OCR                                              | 状态      |
| --------------- | ------ | -------------------------------------------------------- | ----------------------------------------------------- | --------- |
| P1 验证闭环     | 语义层 | `verify-gate` skill + feat-dev blueprint 步骤/constraint | `ReLocateComment`（`internal/diff/relocation.go:33`） | ✅ 已落地 |
| P2 防幻觉路径   | 语义层 | AGENTS.partial.md + AGENTS.md 约束                       | 路径强制注入（`internal/llmloop/loop.go:270`）        | ✅ 已落地 |
| P3 机械门禁增强 | 机械层 | 增强 `stop-truth-guard.sh`                               | 确定性硬约束（token/schema 归一化）                   | ⏸ 可选   |

### P1：verify-gate 验证闭环

新增独立 skill `verify-gate`，blueprint 三步：**确定性验证 → 失败反思根因 → 修复再验证**。
并在 `feat-dev` blueprint 的 Verify 步骤引用它，加 mandatory constraint
"验证通过前不得声称任务完成"。

- 文件：`engineering-practices/skills/verify-gate/SKILL.md` + `.qwen/skills/verify-gate/`
- 效果：让模型在声称"做了 X"之前先跑确定性检查，失败就反思重做——把
  "程序性知识 > 声明性知识"（DataFlow-Harness 结论）编码成流程。
- 边界：Constraint 层（靠遵循），硬兜底由 `stop-truth-guard.sh`（Hook 层）承担。

### P2：防幻觉路径

向系统上下文注入"编辑/读文件必须用缓存验证过的真实路径，不得幻觉"。
qwen-code 已有 `checkPriorRead`（文件外部修改检测），此约束补充"路径必须真实"。

- 文件：`engineering-practices/AGENTS.partial.md` + `AGENTS.md`
- 边界：语义约束，依赖遵循；真正的路径校验靠工具层 `checkPriorRead`。

### P3：机械门禁增强（未做，记录方案）

把 `stop-truth-guard.sh` 从"编译 + 测试证据"扩展到更多确定性校验（如输出 schema
归一化、路径校验）。这是单向底线门禁，不驱动重做。本期未做，避免过度工程。

## 4. 不做（边界）

- **hook 级闭环**：让 PostToolUse/Stop 结果注入上下文并允许模型继续反思——需要
  qwen-code 产品级新机制，当前不存在。
- **评论定位 / coverage / delegate**：OCR 评审专用，qwen-code 无对应概念。
- **token 预算 / 记忆压缩 / 最小工具集**：qwen-code 已有成本控制和记忆管理。

## 5. OCR 关键实现参考

```
internal/diff/relocation.go:33   # 验证失败 → LLM 反思 → 再确定性验证
internal/llmloop/loop.go:270     # 路径防幻觉强制注入
internal/tool/code_comment.go:83 # 输出 schema 归一化
internal/agent/agent.go:1423     # 确定性文件过滤
internal/tool/definitions.go:19  # 最小工具集（6 个）
```

## 6. 后续可探索

- 若 qwen-code 未来支持"hook 反馈注入上下文并继续"，可把 verify-gate 从
  Constraint 层升级为 Hook 层，实现真正的机械级闭环。
- P3 机械门禁增强可随时补上（低风险）。
