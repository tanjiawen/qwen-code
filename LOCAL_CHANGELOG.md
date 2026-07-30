# 本地版本记录 (LOCAL_CHANGELOG)

本文件记录本地学习分支的每一次修改，包括提升点和更新要素。
上游版本变更请参考 CHANGELOG.md。

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
