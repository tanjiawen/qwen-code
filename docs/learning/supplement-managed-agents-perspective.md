# 补充篇：从 Managed Agents 视角理解 Qwen Code

> 基于 AgentScope 2.0 团队文章《专为 Managed Agents 而生的 Harness 底座》的产品化解读

## 🎯 核心洞察

Qwen Code 不仅是一个终端 CLI 工具——它是阿里 Agent 技术体系的**Harness 内核**，其架构设计已经为云端托管、多租户、Brain/Hands 分离预留了完整扩展点。

学习 Qwen Code 源码时，带着这个视角看每个模块，你会理解"为什么这样设计"。

---

## 一、三层产品递进模型

```
┌─────────────────────────────────────────────────────────────┐
│  第3层：Managed Agents（托管平台）                            │
│  多租户 · 版本治理 · Environment 切换 · Worker 队列          │
│  Qwen Code 对应：Daemon 模式 + 未来平台层                    │
├─────────────────────────────────────────────────────────────┤
│  第2层：Agent SDK（嵌入企业应用）                             │
│  Session API · 事件流 · 工具交互协议                         │
│  Qwen Code 对应：sdk-typescript / sdk-python / sdk-java     │
├─────────────────────────────────────────────────────────────┤
│  第1层：CLI（个人/单机开发）                                  │
│  本地工作区 · 终端 · 会话记录                                │
│  Qwen Code 对应：packages/cli（当前主形态）                   │
└─────────────────────────────────────────────────────────────┘
```

**状态归属逐步上移**：CLI 时状态在本地文件；SDK 时状态在接入方；Managed Agents 时状态在平台。

---

## 二、Brain/Hands 分离——Qwen Code 已实现的信任边界

AgentScope 文章的核心架构思想：**模型决定"要调用什么" ≠ 模型所在进程必须"亲自执行什么"**。

```
┌──────────────────────┐         ┌──────────────────────┐
│       Brain          │         │       Hands          │
│  (推理编排)           │         │  (工具执行)           │
│                      │         │                      │
│  • GeminiClient      │  tool   │  • coreToolScheduler │
│  • GeminiChat        │  _use   │  • Shell 进程        │
│  • 上下文压缩         │ ──────→ │  • 文件 I/O          │
│  • Memory recall     │         │  • MCP 调用          │
│  • 子任务委派         │ ←────── │  • 业务 API          │
│                      │ result  │                      │
└──────────────────────┘         └──────────────────────┘
         │                                │
         │  可以在同一进程                   │  也可以在：
         │  (CLI 模式)                     │  • Docker 沙箱
         │                                │  • 远程 E2B 沙箱
         │                                │  • 客户 VPC Worker
```

### Qwen Code 中的 Brain/Hands 边界实现

| 机制                  | 源码                               | 作用                                   |
| --------------------- | ---------------------------------- | -------------------------------------- |
| Sandbox 隔离          | `cli/src/utils/sandbox.ts`         | Hands 在容器中执行，Brain 在宿主机     |
| 工具 schema-only 定义 | `core/src/tools/tools.ts`          | Brain 只看到 schema，不持有执行逻辑    |
| `tool_use_id` 关联    | `core/src/core/toolCallIdUtils.ts` | 异步回传时正确匹配请求与结果           |
| Daemon 模式           | `cli/src/serve/`                   | Brain 作为 HTTP 服务，Hands 可远程     |
| SDK stream-json 协议  | `sdk-typescript/`                  | 外部进程作为 Hands，通过 JSON 事件交互 |

---

## 三、HarnessAgent = ReActAgent + 工程 Hook

AgentScope 的定义：**HarnessAgent 在 ReActAgent 之上通过 Hook 装配长期运行所需的工程默认项**。

Qwen Code 的精确对应：

```
ReActAgent（纯推理循环）
= GeminiChat.sendMessageStream() + Turn.run()
  → 模型调用 → 收集 tool calls → 回传结果 → 循环

HarnessAgent（工程化包装）
= GeminiClient.sendMessageStream()
  → 在 ReAct 之上叠加：
    ├── [Hook] System Prompt 组装（AGENTS.md / MEMORY.md）
    ├── [Hook] 上下文压缩（ChatCompressionService）
    ├── [Hook] 工具结果淘汰（persistAndTruncateToolResult）
    ├── [Hook] 循环检测（LoopDetectionService）
    ├── [Hook] Stop/续写判断（nextSpeaker / Stop hook）
    ├── [Hook] Memory 预取与注入
    └── [Hook] 会话持久化
```

### 为什么这个分层重要？

> "平台升级 Harness 后，所有 Agent 都能获得同一套工程改进，而不必逐个修改流程图。"

在 Qwen Code 中，这意味着：

- 改进压缩算法 → 所有用户自动受益（不需要改 system prompt）
- 改进循环检测 → 所有场景自动更安全
- 改进 Memory recall → 所有会话自动更智能

**业务开发者只需要关心**：system prompt、Skills、Tools、MCP、权限策略。

---

## 四、四层状态模型——理解 Qwen Code 的持久化设计

AgentScope 文章指出数据面托管了**四层生命周期不同的状态**：

| 状态层                 | AgentScope 描述               | Qwen Code 实现                  | 恢复方式               |
| ---------------------- | ----------------------------- | ------------------------------- | ---------------------- |
| **Session 事件日志**   | append-only，证明"发生了什么" | 会话 JSONL 存储                 | `--resume` 重放        |
| **AgentStateStore**    | 可恢复的 brain state          | `GeminiChat.history: Content[]` | 从 JSONL 重建          |
| **Workspace/文件系统** | 工具操作的对象                | 本地目录 / Sandbox 卷           | 不自动恢复（需快照）   |
| **外部副作用**         | 数据库写入、API 调用          | Shell 命令的副作用              | 不可恢复（需幂等设计） |

**关键洞察**：这四层不能用一个"保存对话历史"概括。恢复流程必须分别恢复每一层。

Qwen Code 当前的实现：

- ✅ Session 事件：`packages/cli/src/commands/sessions/`
- ✅ Brain state：`--continue` / `--resume` 恢复对话
- ⚠️ Workspace：本地目录天然持久，但 Sandbox 内不保证
- ❌ 外部副作用：无追踪（这是产品化需要补的）

---

## 五、Environment 与执行面切换

AgentScope 的核心设计：**Agent 定义不变，Hands 位置改变**。

```
同一份 Agent 定义（system prompt + tools + skills）
        │
        ├── Environment: local     → 工具直接操作本机文件
        ├── Environment: sandbox   → 工具在 Docker/Podman 中执行
        ├── Environment: cloud     → 工具在 E2B/FC 云沙箱中执行
        └── Environment: self_hosted → 工具在客户 VPC Worker 中执行
```

Qwen Code 的对应：

| Environment 类型 | Qwen Code 实现        | 切换方式                   |
| ---------------- | --------------------- | -------------------------- |
| local            | 默认模式              | 无需配置                   |
| sandbox          | `QWEN_SANDBOX=docker` | 环境变量 / `--sandbox`     |
| cloud            | 暂未实现              | 未来扩展点                 |
| self_hosted      | Daemon + SDK 模式     | `qwen serve` + 外部 Worker |

**为什么统一文件系统抽象重要？**

> "同一套文件工具既可以指向本机目录，也可以指向分布式 BaseStore 或 E2B 沙箱。正因为逻辑工作区与物理执行面分离，Agent 定义才能在不改业务提示词的情况下切换隔离策略。"

在 Qwen Code 中，`read_file` / `write_file` / `edit` 工具的语义不关心底层是本地 fs 还是远程存储——这就是 AbstractFileSystem 的思想。

---

## 六、多 Agent 编排的两种模式

| 模式                 | AgentScope 描述                            | Qwen Code 实现               |
| -------------------- | ------------------------------------------ | ---------------------------- |
| **Harness 原生委派** | 主 Agent 用 `sessions_spawn` 动态拆解任务  | `agent` 工具 + fork/subagent |
| **平台 fan-out**     | `/api/multiagent/run` 并行发送给多个 Agent | 暂未实现（产品化需补）       |

Qwen Code 的子代理系统已经实现了第一种模式：

- `agent` 工具 → 启动子代理（隔离上下文 + 工具过滤）
- Fork → 继承父上下文的轻量子代理
- 后台任务 → 异步执行 + 完成通知

---

## 七、学习路线图（产品化视角增强版）

在原有 21 天学习路径基础上，每学一个模块时多问一个问题：

| 学习日  | 模块       | 产品化视角问题                                      |
| ------- | ---------- | --------------------------------------------------- |
| Day 5   | Agent 循环 | 这个循环如何在多副本数据面中做 turn 租约？          |
| Day 8-9 | 工具系统   | 工具如何变成 schema-only 定义，让远程 Worker 执行？ |
| Day 10  | 上下文     | 压缩后的摘要如何在跨请求间延续？                    |
| Day 11  | Memory     | 长期记忆如何在多租户间隔离？                        |
| Day 12  | MCP        | MCP 工具如何在不同 Environment 中路由？             |
| Day 13  | 子代理     | 子代理的 Session 如何独立持久化和恢复？             |
| Day 15  | UI         | TUI/Headless/Daemon 三种模式如何共享同一核心？      |

---

## 八、Qwen Code 产品化 Gap 分析

基于 AgentScope 文章的完整 Managed Agents 形态，Qwen Code 还需要补充：

| 能力                   | 重要性 | 难度 | 说明                            |
| ---------------------- | ------ | ---- | ------------------------------- |
| 多租户 ACL             | P0     | 中   | 用户/团队级资源隔离             |
| Agent 版本快照         | P0     | 低   | 每次修改生成不可变版本          |
| 分布式 AgentStateStore | P0     | 高   | Redis/DB 替代内存状态           |
| turn 租约协调          | P1     | 中   | 防止多副本重复执行同一 turn     |
| Worker 队列协议        | P1     | 中   | Self-hosted Worker 的 poll/push |
| HITL ticket            | P1     | 低   | 异步人工确认（不阻塞进程）      |
| append-only 事件存储   | P0     | 中   | 替代当前内存事件流              |
| Environment key rotate | P2     | 低   | 沙箱凭证轮换                    |
| 归档与审计             | P1     | 中   | Session 归档 + 操作审计日志     |

---

## 九、一句话总结

> **Qwen Code 的 Harness 内核已经 80% 就绪。** 它缺的不是推理能力或工具系统，而是分布式状态管理、多租户治理和执行面协议——这些是"从单机 CLI 到云端平台"的最后 20%。理解这 20% 的 gap，你就理解了 Qwen Code 架构中每一个"看起来过度设计"的抽象（AsyncGenerator 事件流、AbstractFileSystem、Schema-only 工具定义）的真正目的。

---

## 参考链接

- AgentScope 2.0 原文：https://mp.weixin.qq.com/s/rAla7_6DXhMuBM8YQn_I9Q
- AgentScope Java：https://github.com/agentscope-ai/agentscope-java
- AgentScope 文档：https://java.agentscope.io
- OpenDev 论文（对照参考）：arXiv:2603.05344
