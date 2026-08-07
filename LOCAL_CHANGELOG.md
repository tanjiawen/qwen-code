# 本地版本记录 (LOCAL_CHANGELOG)

本文件记录本地学习分支的每一次修改，包括提升点和更新要素。
上游版本变更请参考 CHANGELOG.md。

---

## v0.21.5-study.5 (2026-08-07)

**主题：OpenCodeReview 确定性工程融入 —— verify-gate 验证闭环 + 防幻觉路径**

### 背景

研读阿里 `alibaba/open-code-review`（OCR）后，把其"确定性工程 × Agent 混合"中
能适配 qwen-code 的部分落地。核心洞察：OCR 的"验证→LLM 反思→再验证"闭环在
qwen-code 里机械层（hook）做不了（hook 单向拦截/记录，无法反馈模型继续），
只能靠 skill/constraint 语义层让模型自觉遵循；机械层只能做单向确定性门禁。
方案见 `docs/design/open-code-review-integration.md`。

### 变更内容

- **新增** `verify-gate` skill（`engineering-practices/skills/verify-gate/` +
  `.qwen/skills/verify-gate/`）：blueprint 编码"声称完成前先确定性验证 → 失败
  反思根因 → 修复 → 再验证"，借鉴 OCR `ReLocateComment`（`internal/diff/relocation.go:33`）
- **修改** `feat-dev` blueprint：Verify 步骤引用 verify-gate；新增 mandatory
  constraint"验证通过前不得声称任务完成"
- **P2 防幻觉路径**：`engineering-practices/AGENTS.partial.md` + `AGENTS.md`
  加"编辑/读文件必须用缓存验证过的真实路径，不得幻觉"（借鉴 OCR 路径强制注入
  `internal/llmloop/loop.go:270`）
- **配套**：`engineering-practices/README.md` skills 表加 `verify-gate`

### 验证

- 核心解析器校验 verify-gate / feat-dev frontmatter 合法
- `npm run typecheck && npm run build` 通过
- 相关单测通过

### 边界

- verify-gate 是 Constraint 层（靠遵循），不是 Hook 层（硬拦截）；真正的
  机械级硬门禁由现有 `stop-truth-guard.sh` 兜底
- hook 级闭环（验证失败反馈模型继续）需产品级新机制，本期不做

---

## v0.21.5-study.4 (2026-08-06)

**主题：启动时提示恢复上次会话（解决 exit 重进后"不记得"）**

### 背景

用 `exit` 退出后重新进入，新会话默认是空白的——上次会话聊到哪、改了什么、
下一步做什么都要重新说明。长期记忆（auto-memory）本会话会加载，但会话上下文
不延续。期望：无参交互式启动时，若当前目录有历史会话，提示用户选择恢复上次
会话或开新会话（像 Claude Code 的 resume）。

### 变更内容

- **修改** `packages/cli/src/gemini.tsx`：
  - 抽出并导出 `shouldPromptDefaultResume(argv, isTTY)` 纯函数：判定"是否该提示"
    （无显式会话 flag、无 prompt/query、TTY、非 bare/safe/acp/stream-json）
  - 启动流程 Phase D（`--resume` 处理之后）新增默认恢复提示：满足判定且存在
    历史会话时，复用 `showResumeSessionPicker`（SessionPicker）让用户选恢复哪个
    会话；Esc/取消 = 开新会话
- **新增** `packages/cli/src/gemini.test.tsx` 的 `shouldPromptDefaultResume` 单测
  13 例，覆盖 TTY/非 TTY 与各排除分支

### 验证

- `shouldPromptDefaultResume` 13/13 通过；完整 gemini 套件 72/72 通过（无回归）
- cli typecheck 通过；`npm run build && npm run typecheck` 全绿

### 备注

- 行为变化：无参交互式启动 + 有历史会话 → 弹会话选择器（选一个恢复、Esc 新建）
- 全局默认行为，所有用户生效；如觉打扰可后续改为配置开关

---

## v0.21.5-study.3 (2026-08-06)

**主题：Better Harness 状态列提取为可测组件 + 渲染效果验证**

### 背景

激活状态面板后，渲染整个 ProgressPanel 验证效果需要 mock 大量依赖
（core 的 selectLiveSnapshot 服务、ConfigContext 等），成本高且不稳定。
为便于单独渲染验证，把「无审计但有 gate/skill 状态」的显示逻辑提取为独立
组件（deep-module：可测核心模块化）。

### 变更内容

- **新增** `packages/cli/src/ui/components/HarnessStatusBody.tsx`：接收
  `HarnessStatus`，渲染 gate + skill 最近状态摘要（`Gate pass · ...` /
  `Skill grill-me · invoked`）。
- **改** `ProgressPanel.tsx`：无审计且 harnessStatus 存在时复用
  `<HarnessStatusBody />`，替换内联 JSX。
- **新增** `HarnessStatusBody.test.tsx`：2 个渲染单测（有状态 / 无状态占位）。

### 验证

- `HarnessStatusBody.test.tsx` 2/2 通过；typecheck 通过；lint 通过。
- Ink 渲染效果（无审计产物时 Better Harness 列）：
  ```
  Gate pass · 影响半径分析通过（score 1
  Skill grill-me · invoked
  ```

### 备注

- 真实 TUI 截图需 node-pty（本机装不上），用 Ink 渲染组件验证替代。
- 完整发布时间：真实 TUI 需宽终端（≥110 列）时第三列显示。

---

## v0.21.5-study.2 (2026-08-06)

**主题：激活 ProgressPanel 的 Better Harness 状态面板（feat-dev 流程试跑）**

### 背景

用 `/feat-dev` 完整走了一遍强化后的 blueprint（grill → 术语表 → 失败测试 TDD →
设计 → 实现 → 验证），证明新的强制步骤真实执行。feature 本体是激活 ProgressPanel
第三列 Better Harness 显示组——它之前只读五维审计产物（fail：平时无审计产物，
恒显示「未审计」占位），形同摆设。

### 变更内容

#### 1. 运行时状态记录器（新增解析模块）

- **新增** `packages/cli/src/ui/utils/harness-status.ts`：纯函数
  `buildHarnessStatus(jsonl, limit)` 解析 `.qwen/harness-status.jsonl`（gate 触发 /
  skill 调用记录），按 ts 降序、按类型分 gate/skill、损坏行跳过（fail-open）。
- **新增** `packages/cli/src/ui/utils/harness-status.test.ts`：6 个单测（TDD 红→绿）。

#### 2. gate 写状态记录

- `scripts/better-harness-gate.mjs`：在 pass/warn/block 退出点追加一行 gate 记录到
  `.qwen/harness-status.jsonl`（结果 + 影响半径 detail），fail-open 不影响门禁。

#### 3. 面板读取与显示

- **新增** `useHarnessStatus` hook（`use-better-harness-panel.ts`）：5s 轮询读取状态文件。
- `ProgressPanel.tsx`：无审计产物时，若存在 gate/skill 状态则显示最近记录（如
  `Gate pass · 影响半径分析通过`、`Skill grill-me · invoked`），不再恒为「未审计」。

#### 4. 工程实践落地（沿用工程实践模板包）

- **新增** `GLOSSARY.md`（统一语言术语表，12 个核心术语）。
- **新增** `docs/design/better-harness-status-panel.md`（设计文档）。

### 验证

- typecheck 通过；`harness-status.test.ts` 6/6 通过；lint 通过。
- 端到端：写 gate+skill 记录 → `buildHarnessStatus` 正确解析（gates=[pass]，skills=[grill-me]）。
- `.qwen/harness-status.jsonl` 为 git-ignored，不提交。

### 备注

- `~/.qwen/scripts/better-harness-stop-gate.sh` 尚未加写记录（涉及全局配置，待用户确认）。
- skill 调用记录目前依赖状态文件被写入；完整 skill hook 记录机制为后续。

---

## v0.21.2-study.12 (2026-08-03)

**主题：修复 dev 模式长会话反复崩溃（OOM）**

### 背景

`npm run dev` 模式的长会话运行约 36–42 分钟必崩，一天内崩了两次。系统崩溃
报告显示是 V8 JavaScript 堆耗尽后进程主动 abort。

根因：渲染库 react-reconciler 的 dev 构建在**每次 UI 渲染**时都调用
`performance.measure()`，而 Node 把这些记录全部存在全局缓冲区、永不自动清理。
打包产物已有上游修复（构建时强制 production 模式，tree-shake 掉 dev 构建），
但 dev 模式按设计运行在 development 模式，修复不生效。实测高渲染负载下约
每秒累积 900 条（每条约 1KB），40 分钟可达 200 万条（约 2GB）撞上堆上限。
（study.x 新增的 dashboard hook 日志模块上限 50 条，已排查排除。）

### 变更内容

#### 1. 定期清理 performance 缓冲区（新模块）

- **新增** `packages/cli/src/utils/performance-buffer-janitor.ts`：每 60 秒
  清空一次累积的 mark/measure 记录，把无界增长变成有界锯齿（峰值约 50MB）。
  `unref` 不阻塞进程正常退出，重复初始化安全（幂等）。
- 清理安全性已确认：全仓检索 Node 侧没有任何代码读取这些记录
  （启动耗时测量只用 `performance.now()` 时钟，不读条目）。
- 接入点：`packages/cli/src/cli.ts` 顶部，与现有的 startupProfiler /
  cpuProfiler 初始化并排，覆盖所有子命令路由。

#### 2. 测试与验证

- **新增** `performance-buffer-janitor.test.ts` 4 个单测：定时清理、首个周期
  前不误清、幂等、reset 语义。
- 端到端复验：真实模块 + dev 构建渲染循环运行 65 秒，记录数在 60 秒清理点
  从 41,095 回落到 12，确认增长有界。typecheck / lint / build 全绿。

---

## v0.21.2-study.11 (2026-08-03)

**主题：修完审计剩下的两个问题（模块说明书 + 技能瘦身）**

### 背景

首次 `/better-harness` 审计共 4 个问题，study.10 修了前两个（门禁的维护者
豁免、缺依赖兜底）。本版本修完后两个：① 每个代码模块缺少自己的说明书；
② 十几个技能文件又长又全、一调用就占满上下文。同时把审计报告本身重写成了
普通人能读懂的大白话（此前过于拗口）。

### 变更内容

#### 1. 模块级说明书（docs，审计 Finding #3）

- **新增** `packages/core/AGENTS.md` 与 `packages/cli/AGENTS.md`：承接根
  AGENTS.md 的规则并本地化——讲清本包是什么、高风险路径、包内验证命令、
  特有的坑（如 core 的 ESM-only / 导出面，cli 的 vi.hoisted mock / 快照 /
  i18n）、下一步路由。不重复通用规则。
- 缓解「一份总规则要覆盖约 1800 个源文件、模块级覆盖为 0」的问题。

#### 2. 技能渐进式披露拆分（refactor，审计 Finding #4）

把最长的两个技能拆成「精简主文件 + 按需引用文档」，内容逐字搬移、无删减：

- **verify-pr**：638 → 118 行，拆出 8 个引用文档（environment / ab-proof /
  vacuity / wire-oracles / gates / artifact-types / report-contract /
  hard-rules）
- **codegraph**：657 → 178 行，新增 3 个文档（examples / java / api）并扩充
  schema / patterns / bug-analysis / pr-analysis
- 两个主文件都远低于 500 行硬上限，30 个引用链接全部指向真实文件。

#### 3. 审计报告改写为大白话（不入库）

- `.qwen/better-harness/run-20260803-000737/` 的 findings.json / report.html
  重写：去掉「接线 / 演练 / fail-open」等黑话，按「原来什么问题 → 为什么 →
  现在怎么修的」讲清楚（该目录 git-ignored）。

---

## v0.21.2-study.10 (2026-08-03)

**主题：门禁缺口修复（审计驱动）+ Progress Panel 新增 Better Harness 列**

### 背景

对 fork 跑了第一次完整 `/better-harness` 五维审计（任务理解 70 / 可控执行
72 / 改动验证 62 / 可靠交付 64 / 经验沉淀 62，Operationalize 轨道），审计
「吃自己的狗粮」发现刚接入的门禁有两处真实缺口；本版本修复这两处，并把
审计结果可视化到 Progress Panel。

### 变更内容

#### 1. 门禁缺口修复（fix，审计 Finding #1/#2）

- **修改** `scripts/better-harness-gate.mjs`：
  - **maintainer 豁免**——提交作者命中 `maintainers` 名单时，核心模块命中
    与安全代码移除阻断降级为警告；critical 影响半径对所有人保持客观阻断。
    解决了与 AGENTS.md「maintainer 豁免」政策的冲突（此前合法 core 改动被迫
    常态化 `--no-verify`）
  - **fail-open 兜底**——Better Harness 缺失或分析报错时，触及 core 区的改动
    给出醒目告警而非静默放行；非 core 改动仍 fail-open
  - 说明：blast-radius 的 `securityRemovals` 是关键词启发式，对门禁/安全代码
    自身的编辑会频繁误报，故对 maintainer 豁免（已记录于脚本注释与 AGENTS.md）
- **修改** `.better-harness/blast-radius.json`：新增 `maintainers: ["tanjiawen"]`
- **修改** `AGENTS.md`：step 6 同步豁免已编码 + 依赖缺失 core 告警的说明

#### 2. Progress Panel 新增 Better Harness 列（feat）

- **新增** `packages/cli/src/ui/utils/progress-insights.ts` 的
  `buildBetterHarnessPanel()`：解析审计 `findings.json` 为五维分数 + findings
  概览（数量与严重度分布），含规范中文维度标签
- **新增** `packages/cli/src/ui/hooks/use-better-harness-panel.ts`：定位
  `.qwen/better-harness/` 下最新 `findings.json` 并每 5s 轮询；未审计时返回
  undefined（面板显示占位）
- **修改** `packages/cli/src/ui/components/ProgressPanel.tsx`：在原「智能体
  状态 / 思考链」两列旁新增第三列显示五维分数；窄终端降级为下方整行
- **新增** `progress-insights.test.ts` 9 个单测（共 35 个全过）

#### 3. 审计产物（不入库）

- 首次完整审计报告渲染于 `.qwen/better-harness/run-20260803-000737/`
  （report.html / report.md / findings.json），该目录 git-ignored

---

## v0.21.2-study.9 (2026-08-03)

**主题：接入 Better Harness 强制门禁——任何代码改动须过三层检查**

### 背景

此前 fork 上多次出现 agent 失控改动与崩溃。研读阿里云 Qoder 团队开源的
Better Harness 后，决定将其接入本 fork 作为强制门禁：先规划、再编码，但
任何代码改动都必须经过 Better Harness 的检查与约束才能通过。落地分三层
（pre-commit 硬门禁 / Stop 钩子 / 里程碑全审计），先在本 fork 试点，阈值
放宽起步、跑顺后再收紧。

### 变更内容

#### 1. pre-commit 硬门禁（本仓库）

- **新增** `scripts/better-harness-gate.mjs`：调用 Better Harness 的
  blast-radius 影响半径分析，对 critical 级改动、删除安全相关代码、改动
  high/critical-risk 核心模块的提交硬阻断（exit 1）；fail-open 设计，
  Better Harness 缺失或分析报错时放行并告警，不会卡死提交
- **修改** `.husky/pre-commit`：在 lint-staged 门禁后追加 Better Harness
  门禁

#### 2. 门禁配置

- **新增** `.better-harness/blast-radius.json`：放宽 monorepo 阈值
  （changedFiles critical 60、changedLines critical 3000 等），并将
  `packages/core/src/**` 与 `auth/providers/models/config/tools/services`
  标为 high-risk 核心模块（贴合 AGENTS.md 的 maintainer-only 规则）

#### 3. 流程文档

- **修改** `AGENTS.md`：通用工作流新增第 6 步「Better Harness gate
  (mandatory)」，规定每次改动受 pre-commit + Stop 钩子约束，里程碑/PR 前
  必须运行完整 `/better-harness` 五维审计并将报告作为交付物；不得为过检查
  而调低阈值

#### 4. Stop 钩子层（全局 `~/.qwen`，不在本仓库内）

- **新增** `~/.qwen/scripts/better-harness-stop-gate.sh`：本回合有源码改动
  且 review-trigger 报出 error 级 finding 时，阻止 agent 结束回合；已注册进
  `~/.qwen/settings.json` 的 Stop 数组（与 changelog-version-guard 并列）

---

## v0.21.2-study.8 (2026-08-02)

**主题：回滚 Session Snapshot 功能**

### 背景

study.6 / study.7 实现的 Session Snapshot（退出保存工作区快照、启动自动
恢复、退出时生成 LLM 会话摘要）未达到预期效果，决定整体回滚到该功能之前
的状态。

### 变更内容

- 通过 `git revert` 撤销 study.6（快照数据层 + 退出写入 + 启动恢复）与
  study.7（退出 LLM 摘要）两次提交，并丢弃相关的未提交改动
- **删除** `packages/core/src/services/session-snapshot.ts`、
  `session-snapshot-summary.ts`、`session-snapshot.test.ts`
- **还原** `config.ts` / `storage.ts` / `client.ts` / `index.ts` /
  `gemini.tsx` / `AppContainer.tsx` / `ProgressPanel.tsx` 中该功能的所有改动
- 飞行仪表盘 / Progress Panel 重写（study.4 / study.5）不受影响，予以保留

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
