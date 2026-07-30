# 借鉴 DataFlow-Harness 的 Harness 工程改进

## 背景

DataFlow-Harness（arXiv 2607.16617，北大 DCAI 团队，2026 年 7 月）的实验
发现了一个反直觉的结论：给 Code Agent 完整的 MCP 工具，但**不给**程序性
知识（Skills），端到端通过率反而从自由脚本的 91.7% **降到** 83.3%。加入
Skills、typed mutations 和 Request-Validate-Commit 协议后，通过率回升到
93.3%，同时成本下降 72.5%，延迟下降 49.9%。

核心洞察不是领域特定的：**约束和程序性知识比增加工具更能提升 Agent 的
可靠性。** 本文档提出四项针对 Qwen Code harness 层的改进，按投入产出比
排序，每项可独立交付。

参考仓库：

- [OpenDCAI/DataFlow](https://github.com/OpenDCAI/DataFlow) — 算子库
  （7.1k stars），Pipeline → Operator → Prompt 三层编程模型
- [OpenDCAI/DataFlow-WebUI](https://github.com/OpenDCAI/DataFlow-WebUI) —
  Harness 工程交互层：FastAPI + MCP server（20 个白名单工具），
  `validate_pipeline_config` 提交前校验，WebSocket 同步 DAG 画布
- [OpenDCAI/DataFlow-Skills](https://github.com/OpenDCAI/DataFlow-Skills) —
  三个 Claude Code skills，编码了 MANDATORY 的算子选择优先级、字段依赖
  和顺序约束规则

## 提案 1：文件编辑前的外部修改检测

> **实施状态：已由现有代码完整覆盖，无需新增代码。**
>
> 经代码审查确认，Qwen Code 已有完整的 mtime/size 漂移检测机制：
>
> - `FileReadCache`（`packages/core/src/services/fileReadCache.ts`）：
>   每次 `read_file` 时记录 `mtimeMs` + `sizeBytes`，按 inode 追踪。
> - `checkPriorRead()`（`packages/core/src/tools/priorReadEnforcement.ts`）：
>   在 `edit` 和 `write_file` 执行前调用 `cache.check(stats)`，
>   检测到 mtime/size 变化时返回 `FILE_CHANGED_SINCE_READ` 错误，
>   文件未读过时返回 `EDIT_REQUIRES_PRIOR_READ` 错误。
> - 现有实现比本提案设计更完善：支持 inode 追踪（文件重命名也能检测）、
>   区分二进制/目录/特殊文件、区分部分读取和完整读取。
>
> 本提案保留作为设计参考，A/B 测试中作为 baseline 验证项。

### 问题

用户在 Agent 工作期间（或两轮对话之间）手动编辑了文件，但 Agent 的上下文
窗口里还是旧版本。后续的 `edit` 或 `write_file` 调用会**静默覆盖**用户的
修改。现有的 `<system-reminder>` 机制会通知 Agent 文件被外部修改了，但这
只是建议性的——Agent 可能不重新读取就直接写入。

DataFlow-WebUI 用 Request-Validate-Commit 协议解决了同样的问题：每次
pipeline 变更前，系统先获取当前最新状态（包括用户自上一轮以来的手动编辑），
校验通过后才提交。Agent 永远不会基于过期快照操作。

### 设计

在 `edit` 和 `write_file` 工具中增加写入前的过期检查。

1. **记录读取时间戳。** `read_file` 成功时，将
   `(filePath, mtimeMs, contentHash)` 记录到工具上下文中的 `ReadTracker`
   映射表。该表在每轮 Agent turn 开始时清空。

2. **写入前检查。** `edit` 或 `write_file` 执行前，查找目标路径是否在
   `ReadTracker` 中。如果文件当前的 `mtimeMs` 与记录值不同（或文件在本
   会话中从未被读取过），工具返回结构化警告而不是写入：

   ```json
   {
     "status": "stale",
     "message": "文件自上次读取后已被外部修改，请重新读取后再编辑。",
     "lastReadMtime": "2026-07-29T10:00:00Z",
     "currentMtime": "2026-07-29T10:05:00Z"
   }
   ```

   Agent 随后重新读取文件，用最新内容重试编辑。

3. **新文件豁免。** 如果文件尚不存在（新建文件），跳过检查。

4. **可选关闭。** 工具调用时传 `--force` 参数（或会话级设置
   `fileEditGuard: "off"`）可禁用检查，适用于用户明确接受覆盖风险的
   工作流。

### 范围与非目标

- 这是逐文件、逐轮次的检查。不追踪跨轮次状态，不实现完整的文件版本
  管理系统。
- 不阻止 Agent 通过 `run_shell_command` 调用 `sed` 或 `echo >` 绕过
  保护。系统提示词中现有的工具偏好指引已经 discourages 这种做法；在
  shell 层面强制执行不在本次范围内。
- 检查使用 `mtime` 而非内容哈希，以保证性能。文件被 touch 但内容未变
  会触发误报；这是可接受的，因为代价只是多一次 `read_file` 调用。

### 涉及模块

- `packages/core/src/tools/edit-tool.ts`（或对应文件）
- `packages/core/src/tools/write-file-tool.ts`
- 新增：`packages/core/src/utils/read-tracker.ts`

## 提案 2：在 Skills 中增加多步编辑安全规则

### 问题

Agent 修改函数签名时，有时会遗漏调用点。DataFlow-Skills 用 MANDATORY
字段依赖规则防止了同类错误（遗漏必需的 pipeline 步骤）："如果步骤 N 需要
字段 X，那么 X 必须在步骤 N 之前就已经存在。"

### 设计

**无需代码改动。** 在现有的 `bugfix` 和 `feat-dev` skill 文件中增加
显式规则：

```markdown
## 多文件编辑安全（MANDATORY）

修改函数签名、导出名称或公共接口之前：

1. 用 `grep_search` 搜索被修改符号的所有调用点和 import。
2. 列出引用该符号的每一个文件。
3. 在动手修改之前，将所有受影响的文件纳入编辑计划。
4. 编辑完成后，运行项目的类型检查（`npm run typecheck` 或等效命令）
   以捕获遗漏的引用。
```

这跟 DataFlow-Skills 编码算子顺序的方式一样：不是系统强制的约束，而是
指示 Agent 遵循的规则。与提案 3 的区别在于，这纯粹是提示词层面的——没有
schema，没有运行时校验。

### 涉及文件

- `.qwen/skills/bugfix/SKILL.md`（或项目对应的 skill 定义）
- `.qwen/skills/feat-dev/SKILL.md`

## 提案 3：Skills 支持机器可检查的约束

### 问题

提案 2 的规则是建议性的——Agent 仍然可以跳过。DataFlow 的
`validate_pipeline_config` 是强制性的：系统会拒绝违反字段依赖规则的
pipeline 配置，不管 Agent "打算"做什么。

Qwen Code 的 Skills 目前是自由格式的 markdown。没有机制让 skill 声明一个
运行时可以验证的约束。

### 设计

在 skill frontmatter 中引入可选的 `constraints` 部分。每个约束是一条
shell 命令，运行时在声明的检查点执行。如果命令返回非零退出码，Agent 收到
结构化失败信息，必须先解决问题才能继续。

```yaml
---
name: bugfix
constraints:
  - id: reproduction-exists
    checkpoint: before-fix
    check: 'test -f .qwen/repro-output.txt'
    message: '未找到复现输出。修 bug 之前必须先复现。'
  - id: fix-verified
    checkpoint: after-fix
    check: 'cd packages/core && npx vitest run --reporter=dot 2>&1 | tail -1'
    expect_contains: 'Tests  0 failed'
    message: '修复后测试仍然失败。'
---
```

检查点语义：

- `before-fix`：在 bugfix 会话中，Agent 首次对非测试源文件调用 `edit`
  时触发。
- `after-fix`：在 Agent 报告完成或尝试提交时触发。
- `custom`：在 Agent 显式调用 `validate_checkpoint` 工具时触发。

运行时通过子进程执行 `check` 命令，超时 30 秒。输出截断到 2 KB。Agent
看到约束 id、失败消息和命令输出的最后 500 个字符。

### 范围与非目标

- 约束是按 skill 可选启用的。没有 `constraints` 部分的 skill 行为与
  现在完全一致。
- 运行时不解释或解析约束输出，只做 `expect_contains` 子串匹配。复杂的
  校验逻辑属于 check 脚本本身。
- 这不是通用 CI 系统。约束是 Agent 工作流的轻量护栏，不能替代
  `npm run test`。

### 涉及模块

- `packages/core/src/skills/` — skill 解析器，约束提取
- Agent loop — 检查点执行 hook
- 新工具：`validate_checkpoint`（可选，用于 `custom` 检查点）

## 提案 4：上下文感知的工具引导（实验性）

### 问题

DataFlow-WebUI 的 `recommend_operator_categories` 在 Agent 浏览算子之前
先缩小搜索空间。Agent 说"我要做 X"，系统推荐最多 2 个类别去查看，防止
在全部 14 个算子领域中无焦点地浏览。

Qwen Code 有约 30 个工具。Agent 很少选错，但在复杂任务中偶尔会用
`run_shell_command` 去做专用工具能做的事，或者把可以并行的搜索串行化了。

### 设计

本提案刻意保持最小化和实验性。不构建推荐引擎，而是根据用户最近一条消息，
在系统提示词中追加一句简短的动态提示。

分类基于关键词（不调用模型）：

| 用户消息中的信号                 | 追加到系统提示词的提示                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| "找"、"搜索"、"在哪里"、"locate" | "文件和内容搜索优先使用 `glob` 和 `grep_search`，而非 shell 命令。"   |
| "修"、"bug"、"报错"、"broken"    | "先完整阅读错误输出再尝试修复。编辑前用 `grep_search` 找到所有引用。" |
| "重构"、"重命名"、"移动"         | "重命名或移动前，先 grep 所有 import 和引用。"                        |

提示只有一句话，每轮注入一次，不删除或重排任何工具定义。默认关闭，通过
`settings.json` 启用：

```json
{
  "toolGuidance": true
}
```

### 非目标

- 不做基于模型的分类。不增加延迟。
- 不过滤或重排工具。Agent 保留对所有工具的完整访问权。
- 如果实验表明没有可衡量的改善，本提案直接放弃，不扩展。

### 涉及模块

- `packages/core/src/core/` 中的系统提示词构建逻辑

## 优先级

| #   | 提案           | 影响                   | 工作量                          | 依赖                    |
| --- | -------------- | ---------------------- | ------------------------------- | ----------------------- |
| 1   | 文件编辑保护   | 高（防止数据丢失）     | 低（一个工具类 + 两处工具修改） | 无                      |
| 2   | Skill 安全规则 | 中（减少遗漏调用点）   | 极小（只改 markdown）           | 无                      |
| 3   | 可检查约束     | 高（可强制的质量门禁） | 中（解析器 + 运行时 hook）      | 提案 2 先验证规则有效性 |
| 4   | 工具引导       | 中低（软性引导）       | 低                              | 无；实验性质            |

提案 1 和 2 可以并行推进。提案 3 应等提案 2 的规则在实践中验证后再做。
提案 4 独立且可选。

## 验证方式

每个提案有各自的验证路径：

- **提案 1**：`ReadTracker` 的单元测试（过期检测、新文件豁免、force
  标志）。集成测试：在 `read_file` 和 `edit` 之间修改文件，确认保护
  触发。手动测试：在 Agent 工作时用另一个编辑器改文件，确认 Agent 会
  先重新读取再写入。
- **提案 2**：通过 bugfix 工作流手动验证——确认 Agent 在改签名前会
  grep 调用点。无自动化测试（提示词层面的改动）。
- **提案 3**：约束解析和检查点执行的单元测试。集成测试：一个带有
  `before-fix` 约束（会失败）的 skill，确认 Agent 被阻止。一个带有
  `after-fix` 约束（会通过）的 skill，确认 Agent 正常继续。
- **提案 4**：在 10 个脚本化任务上，对比开启和关闭引导时的工具选择
  准确率。

## 附录：A/B 对比测试方案

### 测试方法论

借鉴 DataFlow-Harness 论文的实验设计：同一组任务，在修改前（baseline）
和修改后（treatment）各运行 N 次，用**相同模型、相同提示词、相同任务
描述**，只改变被测机制。记录通过率、错误类型、工具调用次数和 token
消耗。

核心原则：

- **每个场景至少跑 5 次**（论文用了 10 次，我们资源有限取 5 次），
  因为 Agent 行为有随机性，单次结果不可信。
- **baseline 和 treatment 交替执行**，避免模型服务端负载波动影响结果。
- **每次运行保存完整会话日志**（工具调用序列 + 最终产出），用于事后
  分析。

### 场景集设计

共 8 个场景，覆盖 4 个提案各自要解决的问题。每个场景都是一个**可以在
本项目中真实执行的任务**，不是模拟。

#### 场景 A1-A2：文件编辑保护（提案 1）

**A1：并发编辑冲突**

```
任务：让 Agent 重构 packages/core/src/utils/fileUtils.ts 中的
      getProjectRoot() 函数（改名为 resolveProjectRoot）。
干扰：在 Agent 读取文件后、执行 edit 前，用另一个终端手动在文件末尾
      追加一行注释 "// manual edit during agent work"。
```

| 指标                       | baseline 预期    | treatment 预期  |
| -------------------------- | ---------------- | --------------- |
| Agent 是否检测到外部修改   | 不检测，直接覆盖 | 返回 stale 警告 |
| 用户手动追加的注释是否保留 | 丢失             | 保留            |
| 最终文件是否包含两边的修改 | 只有 Agent 的    | 两边都有        |

**A2：跨轮次编辑冲突**

```
任务：分两轮对话。第一轮让 Agent 读取并分析一个文件。两轮之间，用户
      手动修改该文件的某个函数。第二轮让 Agent 基于"刚才读到的内容"
      做修改。
```

| 指标                       | baseline 预期 | treatment 预期            |
| -------------------------- | ------------- | ------------------------- |
| Agent 是否基于过期内容编辑 | 是            | 检测到 mtime 变化，先重读 |
| 用户第二轮前的修改是否保留 | 可能丢失      | 保留                      |

#### 场景 B1-B2：多步编辑安全（提案 2）

**B1：函数重命名（多调用点）**

```
任务：将 packages/core/src/utils/paths.ts 中的一个被 5+ 个文件引用
      的导出函数重命名。不提示 Agent "记得改所有调用点"。
```

| 指标                         | baseline 预期 | treatment 预期             |
| ---------------------------- | ------------- | -------------------------- |
| 是否先 grep 所有调用点       | 可能直接改    | 先 grep 再改（skill 规则） |
| 遗漏的调用点数量             | 1-2 个        | 0                          |
| `npm run typecheck` 是否通过 | 可能失败      | 通过                       |

**B2：接口变更（跨包）**

```
任务：修改 packages/core 中一个被 packages/cli 引用的接口定义
      （例如给某个 options 类型加一个必填字段）。
```

| 指标             | baseline 预期 | treatment 预期         |
| ---------------- | ------------- | ---------------------- |
| 是否检查跨包引用 | 可能只改 core | grep 后发现 cli 也要改 |
| 编译是否通过     | 可能报错      | 通过                   |

#### 场景 C1-C2：可检查约束（提案 3）

**C1：bugfix 必须先复现**

```
任务：给 Agent 一个 bug 描述（例如 "grep_search 在路径包含空格时
      报错"），但不给复现步骤。观察 Agent 是否直接开始改代码。
```

| 指标                        | baseline 预期    | treatment 预期                  |
| --------------------------- | ---------------- | ------------------------------- |
| Agent 是否先写复现脚本/测试 | 可能跳过         | before-fix 约束阻止，必须先复现 |
| 修复后是否有验证            | 可能只说"修好了" | after-fix 约束要求测试通过      |

**C2：修复后测试验证**

```
任务：给 Agent 一个真实的 failing test（可以人为制造一个），让它修复。
      观察修复后是否真的跑了测试。
```

| 指标               | baseline 预期      | treatment 预期             |
| ------------------ | ------------------ | -------------------------- |
| 修复后是否运行测试 | 可能声称修好但没跑 | 约束强制跑测试             |
| 测试实际是否通过   | 不确定             | 约束检查输出，不通过则阻止 |

#### 场景 D1-D2：工具引导（提案 4）

**D1：搜索任务**

```
任务："帮我找到项目里所有处理 sandbox 权限的代码"
```

| 指标                      | baseline 预期                   | treatment 预期       |
| ------------------------- | ------------------------------- | -------------------- |
| 是否使用 grep_search/glob | 可能用 run_shell_command + grep | 优先用专用工具       |
| 工具调用总次数            | 可能较多（串行 shell）          | 较少（并行专用工具） |
| 结果完整性                | 相当                            | 相当                 |

**D2：重构任务**

```
任务："把 src/utils 下的 camelCase 文件名改成 kebab-case"
```

| 指标               | baseline 预期    | treatment 预期          |
| ------------------ | ---------------- | ----------------------- |
| 是否先搜索所有引用 | 可能改一个漏一个 | 提示先 grep 所有 import |
| 遗漏的 import 更新 | 可能有           | 减少                    |

### 执行流程

```
第 1 步：准备
  ├── 确认 baseline 代码状态（当前 main，无任何提案改动）
  ├── 准备 8 个场景的任务描述文本（固定措辞，每次运行用同一份）
  ├── 准备干扰脚本（A1/A2 需要的外部编辑脚本）
  └── 创建结果记录表 .qwen/e2e-tests/harness-ab-results.md

第 2 步：跑 baseline（当前代码，无改动）
  ├── 每个场景跑 5 次
  ├── 每次保存：会话日志、工具调用序列、最终文件 diff、是否通过
  └── 记录到结果表

第 3 步：实施提案 1 + 2（最小改动集）
  ├── 提案 1：实现 ReadTracker + edit/write_file 前置检查
  └── 提案 2：修改 bugfix/feat-dev skill 文件

第 4 步：跑 treatment（修改后代码）
  ├── 同样 8 个场景，每个跑 5 次
  ├── 同样保存完整日志
  └── 记录到结果表

第 5 步：对比分析
  ├── 按场景对比通过率
  ├── 按错误类型分类（覆盖、遗漏、跳过验证、工具误用）
  ├── 计算 token 消耗差异
  └── 写出结论：哪些提案有显著效果，哪些没有
```

### 结果记录表格式

每次运行记录一行：

```markdown
| 场景 | 轮次 | 版本  | 通过? | 错误类型 | 工具调用数 | 备注                         |
| ---- | ---- | ----- | ----- | -------- | ---------- | ---------------------------- |
| A1   | 1/5  | base  | ✗     | 覆盖     | 12         | 用户注释丢失                 |
| A1   | 1/5  | treat | ✓     | -        | 14         | 检测到 stale，重读后编辑     |
| B1   | 1/5  | base  | ✗     | 遗漏     | 8          | 漏改 2 个调用点              |
| B1   | 1/5  | treat | ✓     | -        | 11         | 先 grep 后改，typecheck 通过 |
```

### 判定标准

一个提案被认为"有效"，需要满足：

1. **通过率提升 ≥ 20 个百分点**（例如 baseline 60% → treatment 80%）。
   低于 20% 的提升可能是随机波动。
2. **没有引入新的错误类型。** 例如提案 1 不能导致正常编辑被误拦截
   （误报率 < 5%）。
3. **token 消耗增加 < 15%。** 如果保护机制让每次交互多花太多 token，
   需要权衡。

如果一个提案在 5 次运行中效果不稳定（例如 3 次好 2 次差），需要增加到
10 次运行来确认。

### 与 DataFlow-Harness 论文实验的对应关系

| 论文做法                             | 本方案对应                             |
| ------------------------------------ | -------------------------------------- |
| 12 个数据工程任务                    | 8 个代码工程任务（A1-D2）              |
| 每方法运行 10 次                     | 每场景运行 5 次（资源受限）            |
| 对比 Vanilla CC / MCP-only / Harness | 对比 baseline / treatment              |
| 度量：通过率、成本、延迟             | 度量：通过率、错误类型、工具调用数     |
| 按任务复杂度拆分分析                 | 按提案维度拆分分析                     |
| 消融实验（去掉 Skills 看效果下降）   | 提案 2 的 baseline 就是"无 skill 规则" |
