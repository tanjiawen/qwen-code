# 本地版本记录 (LOCAL_CHANGELOG)

本文件记录本地学习分支的每一次修改，包括提升点和更新要素。
上游版本变更请参考 CHANGELOG.md。

---

## v0.21.2-study.7 (2026-07-31)

**主题：Session Snapshot——退出时真正生成 LLM 会话摘要**

### 背景

study.6 落地了快照数据层和 `generateSnapshotSummary()`，但退出写入时
`summary` 字段仍硬编码为 `null`——LLM 摘要能力实现了却没有接进退出流程，
恢复快照时永远看不到摘要。本次把它真正接通。

### 变更内容

#### 1. 退出摘要生成（CLI 层）

- **修改** `packages/cli/src/ui/AppContainer.tsx`
  - quit handler 在 `runExitCleanup()` 之前调用 `generateSnapshotSummary`
    （经 `runSideQuery` 走 LLM）。之所以放在 cleanup 前，是因为 cleanup
    每个函数有 2 秒上限，对一次 LLM 往返太紧
  - 用 `AbortController` 做 3 秒超时保护
  - 新增 `snapshotSummaryRef` 保存结果；cleanup 写快照时从 ref 读取，
    取代原来硬编码的 `null`
  - 全程 best-effort：任何失败（超时 / 无模型 / 异常）摘要保持 `null`，
    不阻塞退出
  - 将 `sessionStats` 补进 imperative-handle 的 `useMemo` 依赖数组
    （退出处理函数读取了它，修复 ESLint exhaustive-deps 告警）

---

## v0.21.2-study.6 (2026-07-31)

**主题：Session Snapshot——退出保存工作区快照，启动自动恢复**

### 背景

每次重新启动 Qwen Code 时，agent 对上一次会话的工作内容完全失忆。用户
需要重新描述上下文。本次实现退出时自动保存结构化快照（+ 可选 LLM 摘要），
下次在同一项目启动时静默恢复为系统上下文。

### 变更内容

#### 1. 快照数据层（Core 层）

- **新增** `packages/core/src/services/session-snapshot.ts`
  - `SessionSnapshot` 数据模型：git 分支/提交、todo 状态、修改文件、
    会话指标、LLM 摘要
  - `writeSnapshot()` / `readLastSnapshot()` / `clearSnapshot()`
  - `isSnapshotRecent()`：过期判断（默认 72 小时）
  - `formatSnapshotForPrompt()`：格式化为系统提示注入文本
- **新增** `packages/core/src/services/session-snapshot-summary.ts`
  - `generateSnapshotSummary()`：调用 LLM 生成 2-3 句中文摘要，
    3 秒超时保护，失败返回 null
- **新增** `packages/core/src/services/session-snapshot.test.ts`（17 例）

#### 2. 存储与配置

- **修改** `packages/core/src/config/storage.ts`
  - 新增 `getLastSnapshotPath()`：`~/.qwen/projects/<id>/last-snapshot.json`
- **修改** `packages/core/src/config/config.ts`
  - 新增 `sessionSnapshotContext` / `sessionSnapshotRestored` 字段及 getter/setter
- **修改** `packages/core/src/core/client.ts`
  - 系统提示拼接时追加快照上下文（两处）

#### 3. 退出写入（CLI 层）

- **修改** `packages/cli/src/ui/AppContainer.tsx`
  - 注册 cleanup 函数：收集 git 状态、FileHistory 修改文件、
    sessionStats 指标、todos、最后用户指令，写入快照文件
  - 新增 `snapshotTodosRef` / `snapshotLastPromptRef` 保持最新状态

#### 4. 启动恢复（CLI 层）

- **修改** `packages/cli/src/gemini.tsx`
  - `loadCliConfig` 之后读取快照，72 小时内有效则注入系统上下文
  - 支持 `settings.json` 中 `sessionSnapshot.enabled/llmSummary/maxAgeHours`

#### 5. Progress Panel 指示

- **修改** `packages/cli/src/ui/components/ProgressPanel.tsx`
  - L0 状态条末尾显示 "📋 快照已恢复"（仅当本次启动恢复了快照时）

---

## v0.21.2-study.5 (2026-07-30)

**主题：Progress Panel 重写——中文双列状态面板 + 生命周期状态机**

### 背景

study.4 补齐了 Flight Deck 数据层，但 UI 仍是英文三栏航空仪表盘隐喻，
信息密度低且缺乏对 agent 运行阶段的感知。本次将 ProgressPanel 整体重写
为中文双列布局，引入生命周期状态机和三种洞察视图，并将数据聚合下沉到
core 层的纯函数选择器。

### 变更内容

#### 1. 数据选择器（Core 层）

- **新增** `packages/core/src/telemetry/live-snapshot.ts`
  - `selectLiveSnapshot()`：纯函数，将散落在 flight-deck / uiTelemetry
    里的指标聚合为结构化 `LiveSnapshot`（上下文、令牌、模型、子代理、
    工具、延迟、费用、健康、事件）
  - 引入 `MetricProvenance`（measured / estimated / proxy），UI 可标注
    数据来源，避免把估算当实测
- **新增** `packages/core/src/telemetry/live-snapshot.test.ts`
- **修改** `packages/core/src/telemetry/index.ts`：re-export 新模块

#### 2. UI 派生逻辑（CLI 层）

- **新增** `packages/cli/src/ui/utils/progress-insights.ts`
  - 思考链 `buildThinkingChain()`：从 history + pending 串出
    🧠思考 → 🔧动作 → 💡发现 → 📝记忆 有序步骤
  - 系统记忆面板 `buildMemoryPanel()`：记忆文件 token 占用、近期读写
  - 类知识图谱 `buildKnowledgeGraph()`：文件 × 工具关联统计
  - 生命周期推导 `derivePhase()` / `resolveTerminalPhase()`：
    starting → running → waiting → stalled → completed / interrupted / broke
  - 中文工具动词映射（40+ 条）
- **新增** `packages/cli/src/ui/utils/progress-insights.test.ts`

#### 3. ProgressPanel 组件重写

- **重写** `packages/cli/src/ui/components/ProgressPanel.tsx`
  - 布局：英文三栏 → 中文双列（左列指标 + 右列洞察）
  - 右列 [M] 切换：思考链 / 系统记忆 / 知识图谱
  - 常驻 L0 状态条：收起时仍显示一行关键指标
  - 生命周期徽章：【启动中】【进行中】【等待确认】【停滞】【已完成】【已中断】【已跳出】
  - 数据溯源标记：~ 估算 · ≈ 间接信号
  - 快捷键：[T] 展开/收起、[M] 切换右列、[D] 明细
  - 全面中文化

#### 4. 布局变更

- **修改** `packages/cli/src/ui/layouts/DefaultAppLayout.tsx`
  - ProgressPanel 从"仅 Responding 时挂载"改为始终挂载
  - 回合结束后折叠为终态状态条
- **修改** `packages/cli/src/ui/layouts/DefaultAppLayout.test.tsx`
  - 新增 2 个测试用例验证始终挂载行为

---

## v0.21.2-study.4 (2026-07-30)

**主题：Flight Deck 数据层——让仪表盘显示真实数据**

### 背景

study.3 搭好了 `/dashboard` 快照面板，并把流式 ProgressPanel 改造成
"Agent Flight Deck" 三栏驾驶舱 UI。但 UI 只是空壳：事件时间线、每日成本、
系统健康这几块仪表没有接上任何数据源，运行时永远显示 `awaiting events...`
和默认值。本次补齐数据管线，把全部五类 flight 事件和成本 / 延迟 / 健康
指标接入真实遥测流。

### 变更内容

#### 1. flight-deck 数据层模块（Core 层新基础设施）

- **新增** `packages/core/src/telemetry/flight-deck.ts`
  - 事件时间线：环形缓冲（最多 50 条），记录 tool_call / thinking /
    user_input / task_complete / error 五类事件
  - 延迟百分位：保留最近 100 个样本，计算 p50 / p95 / p99
  - 每日成本：持久化到 `~/.qwen/daily-cost.json`，按天累计
  - 系统健康：rate limit / 重试次数 / API 连接 / 磁盘状态
  - `estimateCostUsd()`：集中费率（$3/M input + $15/M output），供遥测
    与面板共用，避免两处硬编码漂移
- **新增** `packages/core/src/telemetry/flight-deck.test.ts`
  - 覆盖环形缓冲、百分位、系统健康、费率估算（14 例）

#### 2. 遥测汇聚点接入（UiTelemetryService）

- **修改** `packages/core/src/telemetry/uiTelemetry.ts`
  - api_response：记录成本、thinking 事件（thoughts_token_count > 0），
    标记 API 已连接并重置重试 / 限流
  - api_error：记录 error 事件，标记断连、重试 +1，429 视为限流 100%
  - tool_call：记录 tool_call 事件（失败的工具记为 error）
- **修改** `packages/core/src/telemetry/uiTelemetry.test.ts`
  - mock flight-deck 避免触碰真实 home 目录，并断言接线（新增 4 例）

#### 3. 日志汇聚点接入（loggers）

- **修改** `packages/core/src/telemetry/loggers.ts`
  - `logUserPrompt`：记录 user_input 事件，用 `isInternalPromptId` 过滤
    suggestion / forked / side-query 等内部 prompt
  - `logConversationFinishedEvent`：记录 task_complete 事件
  - 两处均置于函数顶部、telemetry SDK 守卫之前，未开 OTLP 也能记录
- **修改** `packages/core/src/telemetry/loggers.test.ts`
  - 用 flight-deck 真实读取函数断言接线（新增 3 例）

#### 4. 面板修正与导出

- **修改** `packages/cli/src/ui/components/ProgressPanel.tsx`
  - 改用共享的 `estimateCostUsd()` 计算会话成本
  - 修复每日成本重复计算：`recordCost` 已按响应把本会话累计进当日文件，
    `getDailyCost()` 已含本会话，故不再额外叠加 sessionCost
- **修改** `packages/core/src/telemetry/index.ts`
  - 导出 flight-deck 的读取 / 写入接口与 `estimateCostUsd`

### 验证结果

| 检查项                            | 结果        |
| --------------------------------- | ----------- |
| core flight-deck.test.ts（14）    | ✅ 全部通过 |
| core uiTelemetry.test.ts（51）    | ✅ 全部通过 |
| core loggers.test.ts（69）        | ✅ 全部通过 |
| `npm run typecheck`（core + cli） | ✅ 通过     |
| ESLint                            | ✅ 通过     |
| Prettier                          | ✅ 已格式化 |

### 涉及文件

```
packages/core/src/telemetry/flight-deck.ts          (新增)
packages/core/src/telemetry/flight-deck.test.ts     (新增)
packages/core/src/telemetry/uiTelemetry.ts          (修改)
packages/core/src/telemetry/uiTelemetry.test.ts     (修改)
packages/core/src/telemetry/loggers.ts              (修改)
packages/core/src/telemetry/loggers.test.ts         (修改)
packages/core/src/telemetry/index.ts                (修改)
packages/cli/src/ui/components/ProgressPanel.tsx    (修改)
LOCAL_CHANGELOG.md                                  (更新)
```

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
