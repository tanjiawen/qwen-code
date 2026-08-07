# 工程编程平台能力审计报告

- 日期：2026-08-07
- 审计对象：qwen-code 库 `main@5be1c19fe`（v0.21.5-study.7）
- 审计范围：把 OpenCodeReview（OCR）作为 Agent 融入后，是否构成"完整的编程平台"——系统的分析、拆解、编程、控制、检查，以及输出稳定可靠、不带错误的代码
- 结论：**广度覆盖，深度有明确边界**——12 项中 8 项真落实（硬拦截/流程强制），4 项"有但靠遵循"

## 1. 审计框架

把"完整编程平台"拆成六个维度，每个维度映射到当前机制，并按三层防线（Hook 机械层 / Constraint 语义层 / Skill-Agent 知识层）评估**落实程度**：

| 落实等级    | 含义                                                 |
| ----------- | ---------------------------------------------------- |
| ✅ 硬拦截   | hook exit 2，改源码必须过，模型无法跳过              |
| ✅ 流程强制 | blueprint strictOrder 步骤，但仍依赖模型在流程内执行 |
| ⚠️ 靠遵循   | constraint / skill，模型可能跳过或假装做了           |
| ⚠️ 主动调用 | 需主 Agent 显式 spawn                                |

## 2. 当前机制盘点

### Skills（`engineering-practices/skills/`，8 个工程实践）

`grill-me`、`domain-glossary`、`tdd-first`、`deep-module`、`design-interface`、`verify-gate`、`feat-dev`、`bugfix`

### Hooks（`.qwen/hooks/` + `.qwen/settings.json`）

- **SessionStart**：`cleanup-markers.sh`（清真实性标记）、`cleanup-ocr-review.sh`（清 OCR 标记）
- **PostToolUse**(run_shell_command)：`mark-test-execution.sh`（记测试证据）
- **Stop**：`stop-truth-guard.sh`（编译 + 测试证据）、`stop-changelog-guard.sh`（changelog + 版本）、`stop-ocr-review-guard.sh`（OCR 评审）

### Agents（`.qwen/agents/`）

- `ocr-review`：OCR delegate 模式完整评审（确定性文件选择 + 会话 LLM 评审）
- `test-engineer`：复现 bug / 验证修复，**被禁止改源码**（保证验证独立性）

### feat-dev 完整流程（blueprint strictOrder）

grill-me → glossary → investigate → design doc → **deep-module** → **design-interface** → failing test(tdd) → e2e plan → dry-run → implement → verify(e2e+verify-gate) → **ocr-review** → self-audit → wrap up

## 3. 逐维度落实核对表

| 维度           | 能力                                                                                        | 机制                   | 落实等级                          | 说明                                |
| -------------- | ------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- | ----------------------------------- |
| **分析**       | `grill-me` 需求拷问、`domain-glossary` 统一语言、feat-dev `investigate`、`codegraph` 代码图 | skill + blueprint 步骤 | ✅ 流程强制                       | 分析深度靠模型，广度有保障          |
| **拆解**       | `deep-module` 深层模块、`design-interface` 接口、design doc                                 | skill + blueprint 步骤 | ⚠️ 流程强制、无机械校验           | 中间设计步骤无 tool，模型可跳过语义 |
| **编程**       | `design-interface` 委托实现、feat-dev `implement`                                           | blueprint 步骤         | ✅ 流程强制                       | 接口边界需先定义                    |
| **控制**       | blueprint `strictOrder` + constraints + 3 个 Stop hook                                      | skill 系统 + hook      | ✅ 硬拦截                         | 流程顺序 + 机械门禁                 |
| **检查**       | `tdd-first`、`verify-gate`、`truth-guard`（编译+测试）、`ocr-review`、`test-engineer`       | skill + hook + agent   | ✅ 局部硬拦截                     | 编译/测试证据/评审被硬拦截          |
| **稳定无错误** | typecheck gate、测试证据、OCR 评审                                                          | hook 硬拦截            | ⚠️ 硬拦截"跑没跑"，不保证"跑得对" | 见 §4 缺口                          |

## 4. 三层防线视角的落实分层

### 机械层（hook，真·硬拦截）

| Hook                    | 检查                              | 拦不住什么                 |
| ----------------------- | --------------------------------- | -------------------------- |
| `stop-truth-guard`      | typecheck 编译 + 测试**标记存在** | 测试质量（断言废、覆盖空） |
| `stop-ocr-review-guard` | 改了源码但没跑 OCR 评审           | 评审质量（LLM 走形式）     |
| `stop-changelog-guard`  | 改源码但没更新 changelog/version  | —                          |

### 语义层（constraint，靠模型遵循）

`verify-gate`（验证通过才声称完成）、`tdd-first`（先写失败测试）、`deep-module`/`design-interface` 顺序约束。

### Agent 层（需主动调用）

`ocr-review`（完整评审）、`test-engineer`（独立复现/验证，禁改源码→验证可信）。

## 5. 诚实指出的缺口（不夸大）

1. **测试质量无法保证（最根本）**：`truth-guard` 只检查"跑过测试"的标记，不检查覆盖、断言有效性。逻辑错但能编译、测试全绿但断言是废的——Hook 拦不住。这是三层防线模型的固有边界。
2. **语义层靠遵循**：`verify-gate`、deep-module、design-interface 都是"建议"，模型可能跳过或假装做了。无机械校验。
3. **缺运行时验证**：目前靠 typecheck + 单测 + 评审，真实运行程序（E2E 行为）依赖 e2e plans + 模型自觉，不是硬门禁。
4. **拆解无校验**：deep-module/design-interface 是设计步骤，没有工具强制"先声明接口再实现"。

## 6. 结论与建议

**12 项中 8 项真落实（硬拦截或流程强制），4 项"有但靠遵循"。** 不是"都实现了"——广度覆盖了，但"语义层"和"测试质量"是明确软肋。

可选改进方向（按 ROI）：

1. **测试质量校验**（最硬缺口）：PostToolUse 或 Stop hook 检查测试是否覆盖了改动文件（如被改的 .ts 是否有对应 .test.ts），而非只查"跑过"标记。
2. **verify-gate 升级**：从语义 constraint 升级为可校验的 hook（验证命令真实执行，而非仅声明）。
3. **运行时验证门禁**：E2E 计划 + 真实运行纳入硬门禁。
4. **拆解机械校验**：强制"接口声明"作为可检查产物。

## 7. 参考

- 设计哲学：见记忆 `design-philosophy.md`（三层防线模型）
- OCR 融入：`docs/design/open-code-review-integration.md`
- 工程实践：`engineering-practices/README.md`
