# Design: Better Harness 状态面板（ProgressPanel 第三列激活）

## Problem

ProgressPanel 的 Better Harness 列目前只从 `.qwen/better-harness/run-*/findings.json`
（**五维审计产物**）读取，而该产物仅在用户手动跑里程碑审计时生成。日常开发
无审计产物 → 面板恒显示「未审计 · 运行 /better-harness」占位，形同摆设。

用户希望该列展示**实时的、可感知的**工程强制状态：

1. Better Harness **Gate 触发记录**（stop hook / pre-commit 何时检查、结果）
2. 新 **Skill 强制状态**（grill-me / tdd-first / domain-glossary / deep-module 被调用）
3. 保留**五维分数**（审计产物存在时）
4. **可靠性 insight 精简版**（从审计报告 insights 提取）

## Proposed

新增一个**运行时状态记录器**：有状态事件（gate 触发、skill 调用）追加一行到
`.qwen/harness-status.jsonl`；面板轮询该文件解析并显示。

### 状态文件格式（JSONL）

每行一个 JSON 对象：

```json
{"ts":1754500000000,"type":"gate","source":"stop-hook","result":"pass","detail":"change-test-evidence 检查通过"}
{"ts":1754500001000,"type":"skill","name":"grill-me","status":"invoked"}
```

- `type`: `gate` | `skill`
- `source`: `stop-hook` | `pre-commit` | `audit`
- `result`: `pass` | `block` | `warn`
- `detail`: 人类可读说明

### 记录点

| 事件       | 写入位置                                                                                        | 方式                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Gate 触发  | `scripts/better-harness-gate.mjs` 退出前 + `~/.qwen/scripts/better-harness-stop-gate.sh` 退出前 | 追加一行到 `.qwen/harness-status.jsonl`                                  |
| Skill 调用 | 新 skill 的 frontmatter `hooks` 配置一条命令（`SkillStart`/`PostToolUse`）写记录                | 在 `grill-me/tdd-first/domain-glossary/deep-module` 的 SKILL.md 加 hooks |

### 解析与显示

- 新增纯函数 `buildHarnessStatus(jsonlText): HarnessStatus`（`progress-insights.ts`），把
  JSONL 解析为面板可用的最近记录（gate 最近 N 条、skill 最近 N 条、汇总）。
- `useBetterHarnessPanel` 轮询时同时读 `harness-status.jsonl` 与 `findings.json`。
- `ProgressPanel` Better Harness 列：有审计产物时显示五维分数；否则显示最近
  gate/skill 状态（不再恒为「未审计」占位）。

## Scope

**In（本 design 实现）**

- 状态文件格式 + `buildHarnessStatus` 解析函数（纯函数，TDD 目标）
- gate 脚本（pre-commit + stop hook）写记录
- `useBetterHarnessPanel` 读取状态 + `ProgressPanel` 显示 gate/skill 状态
- insight 精简版：从审计产物 insights 字段提取一行展示

**Out（后续/非目标）**

- 不为 skill 调用做复杂的运行时 hook 记录（skill 侧用 frontmatter hooks 简化实现，或标记为 insight）
- 不改变 gate 逻辑本身
- 不做完整的历史 UI（只显示最近若干条）

## Key Decisions

1. **JSONL 而非 JSON**：追加式日志，幂等，避免并发写 JSON 冲突。
2. **纯函数解析**：`buildHarnessStatus` 不碰 I/O，便于单测（TDD）。
3. **fail-open**：状态文件缺失/解析失败 → 面板回退占位，不报错。

## Files

- 新增 `packages/cli/src/ui/utils/harness-status.ts`（解析 + 类型）
- 新增 `packages/cli/src/ui/utils/harness-status.test.ts`（TDD 单测）
- 改 `packages/cli/src/ui/utils/progress-insights.ts`（复用 `buildHarnessStatus` / insight）
- 改 `packages/cli/src/ui/hooks/use-better-harness-panel.ts`（读状态文件）
- 改 `packages/cli/src/ui/components/ProgressPanel.tsx`（渲染 gate/skill 状态）
- 改 `scripts/better-harness-gate.mjs`（写记录）
- 改 `~/.qwen/scripts/better-harness-stop-gate.sh`（写记录）

## Open Questions

- skill 调用记录的 hook 精确事件名（`SkillStart` 是否可用）需在实现时确认。
