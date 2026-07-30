# 本地版本记录 (LOCAL_CHANGELOG)

本文件记录本地学习分支的每一次修改，包括提升点和更新要素。
上游版本变更请参考 CHANGELOG.md。

---

## v0.21.2-study.3 (2026-07-30)

**主题：/dashboard 会话仪表盘 + ProgressPanel 增强**

### 背景

Agent 长时间运行时缺少全局视角——token 消耗、工具成功率、hook 拦截情况
散落在各处，无法一屏掌握。新增 `/dashboard` 命令提供快照式全景面板，
同时增强流式 ProgressPanel 的实时信息密度。

### 变更内容

#### 1. Hook 执行日志（Core 层新基础设施）

- **新增** `packages/core/src/hooks/hook-execution-log.ts`
  - 环形缓冲区（最多 50 条），记录每次 hook 触发的事件名、耗时、
    hook 数量、是否 block
  - 提供 `recordHookExecution`、`getRecentHookExecutions`、
    `getHookAggregateStats`、`clearHookExecutionLog` 四个函数
- **修改** `packages/core/src/hooks/hookEventHandler.ts`
  - 在 `processHookEvent` 末尾调用 `recordHookExecution()` 写入日志
- **修改** `packages/core/src/hooks/index.ts`、`packages/core/src/index.ts`
  - 导出读取/清除接口（不暴露写入接口给外部）

#### 2. /dashboard 命令

- **新增** `packages/cli/src/ui/commands/dashboard-command.ts`
  - `buildSnapshot()` 从 `session.stats.metrics` 聚合 token、延迟、
    工具调用、文件行数，加上 hook 统计，组装 `DashboardSnapshot`
  - 费用估算：$3/M input + $15/M output（粗略前沿模型定价）
- **新增** `packages/cli/src/ui/components/views/DashboardView.tsx`
  - 五个面板：⛽ Token Budget（进度条 + 明细）、📊 Performance
    （延迟/吞吐/成功率）、🔧 Tools（top5 + 文件行数）、💰 Cost、
    🪝 Hooks（按事件分类 + 最近 5 条）
- **修改** `packages/cli/src/ui/types.ts`
  - 新增 `DashboardSnapshot` 接口、`HistoryItemDashboard` 类型、
    `MessageType.DASHBOARD` 枚举值
- **修改** `packages/cli/src/services/BuiltinCommandLoader.ts`
  - 注册 `dashboardCommand`
- **修改** `packages/cli/src/ui/components/HistoryItemDisplay.tsx`
  - `type === 'dashboard'` 时渲染 `<DashboardView>`
- **修改** `packages/cli/src/ui/utils/historyUtils.ts`
  - `isSyntheticHistoryItem` 加入 `dashboard` case

#### 3. ProgressPanel 增强

- **修改** `packages/cli/src/ui/components/ProgressPanel.tsx`
  - 新增 token 进度条（绿→黄→红，60%/80% 阈值）
  - 新增吞吐量显示（output tokens / elapsed seconds）
  - 新增 hook 状态行（触发数 + blocked 数）
  - 布局改为 header（标题 + 耗时右对齐）+ 分区展示

### 验证结果

| 检查项                                 | 结果        |
| -------------------------------------- | ----------- |
| core hookEventHandler.test.ts（135）   | ✅ 全部通过 |
| cli historyUtils.test.ts（20）         | ✅ 全部通过 |
| cli HistoryItemDisplay.test.tsx（32）  | ✅ 全部通过 |
| cli BuiltinCommandLoader.test.ts（12） | ✅ 全部通过 |
| `npm run typecheck`（全包）            | ✅ 通过     |
| ESLint pre-commit                      | ✅ 通过     |

### 涉及文件

```
packages/core/src/hooks/hook-execution-log.ts               (新增)
packages/cli/src/ui/commands/dashboard-command.ts            (新增)
packages/cli/src/ui/components/views/DashboardView.tsx       (新增)
packages/core/src/hooks/hookEventHandler.ts                  (修改)
packages/core/src/hooks/index.ts                             (修改)
packages/core/src/index.ts                                   (修改)
packages/cli/src/services/BuiltinCommandLoader.ts            (修改)
packages/cli/src/ui/types.ts                                 (修改)
packages/cli/src/ui/components/HistoryItemDisplay.tsx         (修改)
packages/cli/src/ui/components/ProgressPanel.tsx             (修改)
packages/cli/src/ui/utils/historyUtils.ts                    (修改)
LOCAL_CHANGELOG.md                                           (更新)
```

---

## v0.21.2-study.2 (2026-07-29)

**主题：真实性约束 Hook——不允许胡编乱造**

### 背景

Skill 层的 blueprint/constraints 是"建议性"的（交通规则），模型可以选择不
遵循。但"真实可靠"是底线（红绿灯），必须强制执行。因此新增 Hook 层的
硬性约束：在 Agent 的产出变成磁盘上的文件之前，用机械手段验证。

### 变更内容

#### 1. Stop Hook：编译 + 测试证据双重门禁

- **新增** `.qwen/hooks/stop-truth-guard.sh`
- Agent 说"完成"之前，强制检查两件事：
  - **编译通过**：跑 `npm run typecheck`，失败则 exit 2 拦截，Agent 不许停
  - **测试跑过**：检查标记文件 `/tmp/qwen-truth-guard/tests-ran`，
    如果改了源文件但从未跑过测试，拦截
- 只检查非测试的 `.ts/.tsx` 文件变更（通过 `git diff` 判断）

#### 2. PostToolUse Hook：测试执行证据记录

- **新增** `.qwen/hooks/mark-test-execution.sh`
- 匹配 `run_shell_command` 工具，每次执行后检查命令内容
- 如果包含 `vitest`、`npm test`、`jest`、`pytest` 等关键词，
  创建标记文件 `/tmp/qwen-truth-guard/tests-ran`
- 永远不拦截（exit 0），只做记录

#### 3. SessionStart Hook：标记清理

- **新增** `.qwen/hooks/cleanup-markers.sh`
- 每次新会话开始时清理 `/tmp/qwen-truth-guard/` 目录
- 防止上一轮的"测试已跑"标记误导新一轮检查

#### 4. Hook 注册

- **修改** `.qwen/settings.json`
  - 新增 `hooks` 配置，注册三个 Hook：
    - `SessionStart` → `cleanup-markers.sh`（超时 5s）
    - `PostToolUse`（matcher: `run_shell_command`）→ `mark-test-execution.sh`（超时 5s）
    - `Stop` → `stop-truth-guard.sh`（超时 180s，因为要跑 typecheck）

### 设计原则

| 层级           | 机制                 | 性质             | 类比       |
| -------------- | -------------------- | ---------------- | ---------- |
| Hook           | exit 2 硬拦截        | 强制（没得选）   | 红绿灯     |
| Constraint     | system-reminder 注入 | 建议（靠遵循）   | 交通规则   |
| checkPriorRead | 工具内置前置检查     | 强制（不可关闭） | 收费站栏杆 |

Hook 管"能不能"（机械判断），Constraint 管"该不该"（语义判断）。
两者不是替代关系，是分工。

### 涉及文件

```
.qwen/hooks/stop-truth-guard.sh      (新增)
.qwen/hooks/mark-test-execution.sh   (新增)
.qwen/hooks/cleanup-markers.sh       (新增)
.qwen/settings.json                  (修改：新增 hooks 配置)
LOCAL_CHANGELOG.md                   (更新)
```

---

## v0.21.2-study.1 (2026-07-29)

**主题：借鉴 DataFlow-Harness 的 Harness 工程改进**

### 背景

研读北大 DCAI 团队的 DataFlow-Harness 论文（arXiv 2607.16617）及其三个
开源仓库（DataFlow、DataFlow-WebUI、DataFlow-Skills），以及阿里
AgentScope 2.0 的 Managed Agents 架构后，提炼出四项可迁移到 Qwen Code
的改进提案。

### 变更内容

#### 1. 设计文档

- **新增** `docs/design/2026-07-29-harness-engineering-improvements.md`
  - 四项提案的完整设计（中文）
  - A/B 对比测试方案（8 个场景 × 5 次运行）
  - 与 DataFlow-Harness 论文实验的对应关系

#### 2. 提案 1：文件编辑前的外部修改检测

- **状态：已由现有代码完整覆盖，无需新增代码**
- 经代码审查确认，`FileReadCache`（mtime/size 漂移检测）+
  `checkPriorRead()`（edit/write_file 前置拦截）已完整实现
- 现有实现比设计更完善：inode 追踪、二进制文件区分、部分读取支持
- 设计文档中已标注实施状态

#### 3. 提案 2：多文件编辑安全规则（Skills 层面）

- **修改** `.qwen/skills/bugfix/SKILL.md`
  - Step 3 (Fix) 中新增「多文件编辑安全（MANDATORY）」规则
  - 要求：改函数签名前先 grep 所有调用点 → 列出受影响文件 → 全部纳入编辑计划 → 编辑后跑 typecheck
- **修改** `.qwen/skills/feat-dev/SKILL.md`
  - Phase 5 (Implement) 中新增同样的「多文件编辑安全（MANDATORY）」规则

#### 4. 提案 3：Blueprint + Constraints 结构化约束

- **修改** `.qwen/skills/bugfix/SKILL.md` frontmatter
  - 新增 `blueprint`：6 步严格顺序（读 issue → 复现 → 修复 → 验证 → 测试 → 审计）
  - 新增 `constraints`：4 条约束（复现先于修复、改签名前必须 grep、多文件编辑后必须 typecheck、验证先于审计）
- **修改** `.qwen/skills/feat-dev/SKILL.md` frontmatter
  - 新增 `blueprint`：8 步严格顺序（调研 → 设计 → 测试计划 → 干跑 → 实现 → 验证 → 审计 → 收尾）
  - 新增 `constraints`：4 条约束（设计先于实现、改签名前必须 grep、多文件编辑后必须 typecheck、E2E 验证先于审计）
- 利用现有 `ProceduralBlueprint` / `CompositionalConstraint` 类型系统
  （`packages/core/src/skills/types.ts`），通过 `compileSkillConstraints()`
  注入 `<system-reminder>` 提示词

### 验证结果

| 检查项                       | 结果        |
| ---------------------------- | ----------- |
| Skills 单元测试（303 个）    | ✅ 全部通过 |
| 全量编译 `npm run build`     | ✅ 通过     |
| 类型检查 `npm run typecheck` | ✅ 通过     |

### 涉及文件

```
docs/design/2026-07-29-harness-engineering-improvements.md  (新增)
.qwen/skills/bugfix/SKILL.md                                (修改)
.qwen/skills/feat-dev/SKILL.md                              (修改)
package.json                                                (版本号)
LOCAL_CHANGELOG.md                                          (新增)
```

### 参考资料

- DataFlow-Harness 论文：arXiv 2607.16617
- DataFlow 主库：github.com/OpenDCAI/DataFlow（7.1k stars）
- DataFlow-WebUI：github.com/OpenDCAI/DataFlow-WebUI
- DataFlow-Skills：github.com/OpenDCAI/DataFlow-Skills
- AgentScope 2.0：github.com/agentscope-ai/agentscope-java

---

## v0.21.1 (上游基线)

上游 Qwen Code 官方版本，通过 merge commit `7167f6169` 同步了 130 个
上游提交。本地学习分支以此为基线。
