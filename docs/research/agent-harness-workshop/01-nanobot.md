# Nanobot — 轻量智能体运行时

## 基本信息

- **作者/团队**：任旭滨（Xubin Ren），香港大学数据科学研究所三年级博士候选人，导师黄超教授（Prof. Chao Huang）及 Benjamin C.M. Kao 教授。本科毕业于武汉大学计算机科学与技术专业（2018–2023）。GitHub 主页：[Re-bin](https://github.com/Re-bin)，个人网站：[ren-xubin.github.io](https://ren-xubin.github.io)。
- **所属实验室**：HKUDS（Data Intelligence Lab @ HKU），由黄超教授领导。实验室在 GitHub 上有多个高星项目：nanobot（46.4k）、CLI-Anything（46.3k）、LightRAG（38.3k）、DeepTutor（31.1k）、Vibe-Trading（28.6k）等。
- **GitHub**：[https://github.com/HKUDS/nanobot](https://github.com/HKUDS/nanobot)
- **Stars**：46.4k（截至 2026-07-30）；Forks 8.2k；Commits 3,746；Open Issues 181；Open PRs 600
- **语言**：Python（核心）+ WebUI 前端
- **许可证**：MIT
- **PyPI 包名**：`nanobot-ai`
- **文档站**：[nanobot.wiki](https://nanobot.wiki/docs/latest/getting-started/nanobot-overview)
- **最新版本**：v0.3.0 "The Agency Release"（2026-07-24）
- **论文**（任旭滨作为第一/共同作者的代表作）：
  - VideoRAG: Retrieval-Augmented Generation with Extreme Long-Context Videos — **KDD 2026**（Applied Data Science Track）
  - EasyRec: Simple yet Effective Language Models for Recommendation — **EMNLP 2025**
  - A Comprehensive Survey on Self-Supervised Learning for Recommendation — **ACM Computing Surveys 2025**
  - RLMRec: Representation Learning with Large Language Models for Recommendation — **WWW 2024**
  - SSLRec: A Self-Supervised Learning Framework for Recommendation — **WSDM 2024 Oral**
  - LLMRec: Large Language Models with Graph Augmentation for Recommendation — **WSDM 2024 Oral**
  - A Survey of Large Language Models for Graphs — **KDD 2024**
  - DCCF: Disentangled Contrastive Collaborative Filtering — **SIGIR 2023**
  - LightGCL: Simple Yet Effective Graph Contrastive Learning for Recommendation — **ICLR 2023 Spotlight**

> **注**：目前未找到专门以 nanobot 为主题的学术论文。nanobot 在 README 中描述为"个人开源项目起步，后由社区协作维护"，其设计理念主要体现在代码和文档中，而非学术论文。研讨会报告"从轻量智能体到 Agent-Native 基础设施"的内容未能通过公开网页获取。

---

## 核心理念

### 解决什么问题？

nanobot 要解决的核心问题是：**现有 AI Agent 框架太重了**。

LangChain、AutoGen、CrewAI 等框架引入了大量抽象层——链（Chain）、图（Graph）、编排器（Orchestrator）、规划器（Planner）——使得开发者很难理解"一条消息从用户到模型再到工具，到底走了哪条路径"。对于个人用户和小型团队来说，这些框架的学习曲线陡峭、部署复杂、调试困难。

nanobot 的回答是：**用一个足够小的 agent loop 做核心，其他一切（通道、工具、记忆、模型）都是可插拔的外围**。

### 为什么现有方案不够？

1. **可读性差**：大型框架的调用链深达十几层，出了问题很难定位。nanobot 最初只有约 4,000 行核心代码，一个开发者可以在一个下午读完整个运行时。
2. **部署门槛高**：很多框架需要额外的向量数据库、消息队列、容器编排。nanobot 是 `pip install nanobot-ai` 一条命令，配置一个 JSON 文件就能跑。
3. **通道单一**：多数框架只关注 API 或 CLI。nanobot 原生支持 WebUI、Telegram、Discord、Slack、飞书、微信、Email、Mattermost 等十余种通道，且所有通道共享同一个 agent loop。
4. **记忆缺失**：大多数框架的"记忆"只是把对话历史塞进 prompt。nanobot 有独立的长期记忆系统（Dream），能跨会话保留有用的上下文。

### 设计哲学（来自官方文档）

1. **Small core agent loop with pluggable providers, channels, tools, and memory** — 核心循环尽可能小，一切外围通过注册/发现机制接入。
2. **The same turn model applies across CLI, API, WebUI, and chat apps** — 无论用户从哪个通道来，走的是同一条路径。
3. **Configuration controls capabilities; workspace stores instance state** — 配置文件决定"能做什么"，工作区保存"做过什么"。
4. **Agent identity and durable state are separated from project-specific working context** — agent 的身份（SOUL.md、USER.md、记忆、技能）和项目上下文（AGENTS.md、文件路径、shell 工作目录）是两个独立概念。
5. **Security as functional behavior** — 安全不是事后加的中间件，而是用户可见的功能行为，需要文档化。

---

## 架构设计

### 总体数据流

```
Channel → MessageBus → AgentLoop → AgentRunner → Provider/Tools → AgentRunner → AgentLoop → MessageBus → Channel
```

这是 nanobot 运行时的主干。一条用户消息从任意通道进入 MessageBus，AgentLoop 负责会话管理和上下文构建，AgentRunner 负责与模型交互和执行工具调用，最终结果沿原路返回。

### 核心模块

| 模块          | 文件                                            | 职责                                                          |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| 消息总线      | `nanobot/bus/events.py`, `nanobot/bus/queue.py` | 消息事件定义和队列                                            |
| Agent 循环    | `nanobot/agent/loop.py`                         | 通道侧的 turn 编排：会话选择、上下文构建、响应分发            |
| Agent 运行器  | `nanobot/agent/runner.py`                       | 模型侧的对话循环：provider 调用、工具执行、流式输出、迭代限制 |
| 上下文构建    | `nanobot/agent/context.py`                      | 组装 system prompt：身份、引导文件、记忆、技能、历史          |
| 会话管理      | `nanobot/session/manager.py`                    | 会话存储、压缩、重放                                          |
| 长期记忆      | `nanobot/agent/memory.py`                       | Dream 记忆整合                                                |
| 工具注册      | `nanobot/agent/tools/registry.py`               | 工具的注册、发现、schema 生成、执行                           |
| 工作区安全    | `nanobot/security/workspace_access.py`          | 工作区访问范围和沙箱策略                                      |
| Provider 注册 | `nanobot/providers/registry.py`                 | 模型提供者的元数据和选择逻辑                                  |
| 通道管理      | `nanobot/channels/manager.py`                   | 通道的发现和生命周期管理                                      |

### AgentLoop 与 AgentRunner 的分离

这是 nanobot 架构中最关键的设计决策：

- **AgentLoop**（`loop.py`，约 93KB 源码）是**通道侧**的编排器。它接收 InboundMessage，决定使用哪个 session、哪个 workspace，构建上下文，绑定 hooks，最终把 OutboundMessage 发回通道。它不直接与模型交互。
- **AgentRunner**（`runner.py`，约 64KB 源码）是**模型侧**的执行器。它接收一组 messages 和一个 ToolRegistry，循环调用 provider、执行工具、把工具结果喂回模型，直到产生最终回答或达到迭代上限。它不知道消息来自哪个通道。

这种分离意味着：

- 添加新通道不需要碰模型调用逻辑。
- 更换模型提供者不需要碰会话管理逻辑。
- 工具执行对通道透明。

### 上下文管理

`ContextBuilder`（`context.py`）负责组装发送给模型的完整消息列表。system prompt 由以下部分按顺序拼接（以 `\n\n---\n\n` 分隔）：

1. **身份信息**（identity）：工作区路径、运行时环境（OS/架构/Python 版本）、平台策略、当前通道。
2. **引导文件**（bootstrap files）：
   - `AGENTS.md`：来自当前项目工作区（项目级指令）。
   - `SOUL.md`：来自 agent 全局工作区（agent 人设）。
   - `USER.md`：来自 agent 全局工作区（用户偏好）。
3. **工具契约**（tool contract）：定义 agent 的工具使用规范。
4. **长期记忆**（long-term memory）：从 `<workspace>/memory/MEMORY.md` 读取。
5. **活跃技能**（active skills）：始终激活的技能 + 当前消息显式调用的技能。
6. **技能摘要**（skills summary）：可用但未激活的技能列表。
7. **近期历史**（recent history）：从记忆系统读取的最近 50 条记录，硬上限 8,000 tokens。
8. **归档摘要**（archived session summary）：旧对话的压缩摘要。

关键设计点：

- **项目上下文和 agent 身份是分离的**。`AGENTS.md` 来自项目目录，`SOUL.md` 和 `USER.md` 来自 agent 全局工作区。切换项目不会改变 agent 的身份和记忆。
- **记忆注入在 system prompt 中**，而非作为 user message。这使得记忆成为 agent 的"内在知识"而非"外部输入"。
- **近期历史有硬上限**（50 条 / 8,000 tokens），防止上下文膨胀。

### 工具系统

工具通过 `ToolRegistry` 管理，采用显式动态注册模式：

```python
registry = ToolRegistry()
registry.register(tool)  # 注册
registry.unregister("tool_name")  # 注销
```

工具定义通过 `get_definitions()` 生成，分为两组：

- **内置工具**（按名称排序）：文件读写、shell 执行、web 搜索/抓取、cron 定时、图像生成、子 agent、运行时自省。
- **MCP 工具**（`mcp_` 前缀，按名称排序）：通过 MCP 协议接入的外部工具。

排序是有意为之的——保持 tool definitions 的顺序稳定，有利于 LLM 的 prompt cache 命中。

工具执行流程：

1. `prepare_call(name, params)` — 精确名称查找（失败时提供模糊建议）、参数类型转换、参数校验。
2. `execute(name, params)` — 调用 `tool.execute(**params)`，错误包装为 `ToolResult.error`，并附加提示"分析错误并尝试其他方法"。

### 权限控制与沙箱

nanobot 的安全模型围绕**工作区范围**（Workspace Scope）构建：

- **两种访问模式**：
  - `restricted`：工具被限制在项目工作区路径内。`ToolWorkspace.allowed_root` 返回项目路径。
  - `full`：无工作区限制。`allowed_root` 返回 `None`。

- **三层执行保障**：
  1. **系统级沙箱**（`level="system"`）：通过 macOS App Sandbox 或 Bubblewrap (bwrap) 等操作系统机制强制执行。由环境变量 `NANOBOT_WORKSPACE_SANDBOX_PROVIDER` 和 `NANOBOT_WORKSPACE_SANDBOX_ENFORCED` 控制。
  2. **应用级守卫**（`level="application"`）：nanobot 自身的路径检查和 SSRF 防护。当没有系统沙箱时退化为这一层。
  3. **关闭**（`level="off"`）：不做工作区限制。

- **作用域解析**：通过 Python `ContextVar` 实现 per-turn 的工作区作用域绑定。每个 agent turn 开始时 `bind_workspace_scope()`，结束时 `reset_workspace_scope()`。工具调用时通过 `current_tool_workspace()` 获取当前策略。

- **通道级访问控制**：WebUI/WebSocket 通道支持 per-message 的工作区范围选择（用户可以在浏览器中切换项目），其他通道使用默认工作区。

### 记忆系统（Dream）

nanobot 区分两种存储：

| 存储     | 位置                                             | 用途             |
| -------- | ------------------------------------------------ | ---------------- |
| 会话历史 | `<workspace>/sessions/*.jsonl`                   | 近期对话重放     |
| 长期记忆 | `<workspace>/memory/MEMORY.md` + `history.jsonl` | 跨会话的持久知识 |

**Dream** 是一个周期性整合任务（在 gateway 模式下运行）。它读取累积的对话历史，提取有价值的信息，更新 `MEMORY.md`。这使得 agent 的"知识"可以超越单次会话的生命周期。

### 多入口统一

nanobot 提供多种入口，但共享同一个 agent loop：

| 入口       | 命令                     | 场景                              |
| ---------- | ------------------------ | --------------------------------- |
| CLI 单次   | `nanobot agent -m "..."` | 脚本、快速检查                    |
| CLI 交互   | `nanobot agent`          | 终端对话                          |
| Gateway    | `nanobot gateway`        | 长驻服务：通道、定时任务、Dream   |
| OpenAI API | `nanobot serve`          | 程序化接入 `/v1/chat/completions` |
| WebUI      | `nanobot webui`          | 浏览器工作台                      |

---

## 关键源码解读

### AgentLoop（`nanobot/agent/loop.py`）

这是 nanobot 最大的单文件（约 93KB），是整个运行时的中枢。核心数据结构：

- **`TurnKind`**：枚举，区分 `USER` 和 `SYSTEM` turn。
- **`TurnContext`**：一个 turn 的完整上下文，包含：
  - `msg: InboundMessage` — 入站消息
  - `session_key: str` — 会话标识
  - `runtime: LLMRuntime | None` — 模型运行时（在 BUILD 阶段建立）
  - `delivery: TurnDelivery` — 响应投递策略
  - `history: list[dict]` — 对话历史
  - `tools: ToolRegistry | None` — 本 turn 可用的工具集
  - `hooks: list[AgentHook]` — turn 级钩子
  - 各种回调：`on_progress`、`on_stream`、`on_retry_wait` 等

`AgentLoop` 类的职责（来自源码注释）：

1. 从总线接收消息
2. 构建上下文（历史、记忆、技能）
3. 调用 LLM
4. 执行工具调用
5. 发送响应

值得注意的是 `TurnContext` 使用了 `require_runtime()` 和 `require_session()` 方法来强制阶段顺序——runtime 必须在 BUILD 阶段初始化，session 必须在 RESTORE 阶段初始化。这是一种轻量级的阶段契约。

### AgentRunner（`nanobot/agent/runner.py`）

`AgentRunner` 是模型侧的执行循环，核心配置通过 `AgentRunSpec` 数据类传入：

```python
@dataclass(slots=True)
class AgentRunSpec:
    initial_messages: list[dict[str, Any]]
    tools: ToolRegistry
    runtime: LLMRuntime
    max_iterations: int
    max_tool_result_chars: int
    concurrent_tools: bool = False
    fail_on_tool_error: bool = False
    context_block_limit: int | None = None
    provider_retry_mode: str = "standard"
    goal_active_predicate: Callable[[], bool] | None = None
    goal_continue_message: GoalContinueMessage | None = None
    finalize_on_max_iterations: bool = True
    # ... 更多回调
```

关键设计：

- **`max_iterations`**：防止无限工具调用循环。
- **`concurrent_tools`**：支持并行工具执行。
- **`context_block_limit`**：上下文窗口限制，与 `ContextGovernor` 配合管理 token 预算。
- **`goal_active_predicate` + `goal_continue_message`**：支持长时目标（long-horizon goals）。当模型认为已完成但目标谓词仍为真时，注入继续消息。
- **`injection_callback`**：允许在 turn 执行过程中注入外部消息（最多 3 次注入，5 个循环）。
- **错误恢复**：空回复最多重试 2 次（`_MAX_EMPTY_RETRIES`），长度截断最多恢复 3 次（`_MAX_LENGTH_RECOVERIES`）。

`AgentRunResult` 记录执行结果：最终内容、所有消息、使用的工具列表、token 用量、停止原因。

### ToolRegistry（`nanobot/agent/tools/registry.py`）

约 7.6KB，设计非常精简。值得注意的细节：

1. **缓存友好的 schema 排序**：`get_definitions()` 把内置工具和 MCP 工具分开排序，结果缓存到下次注册/注销。这不是随意的——稳定的工具定义顺序有助于 LLM provider 的 prompt cache。
2. **模糊建议而非模糊执行**：`_suggest_name()` 只在工具名查找失败时提供"你是不是想用 X？"的建议，绝不用于实际执行。工具名必须精确匹配。
3. **参数兼容层**：`_unwrap_arguments_payload()` 处理旧版外部工具的 `{"arguments": ...}` 包装格式。
4. **错误消息设计**：所有工具错误都附加 `"[Analyze the error above and try a different approach.]"`，引导模型自我纠错。

### ContextBuilder（`nanobot/agent/context.py`）

约 11.5KB。核心方法 `build_system_prompt()` 的拼接逻辑已在架构部分详述。值得关注的实现细节：

1. **模板检测**：`_is_template_content()` 检查文件内容是否与内置模板完全一致。如果用户没有自定义 `AGENTS.md` 或 `USER.md`，这些文件会被跳过，避免在 system prompt 中塞入无意义的默认文本。
2. **图片处理**：`build_user_content()` 将图片读取、MIME 检测、base64 编码封装为 multimodal content blocks。
3. **同角色消息合并**：如果当前消息与历史中最后一条消息角色相同，会合并而非追加，避免违反某些 provider 的角色交替要求。

### WorkspaceScope（`nanobot/security/workspace_access.py`）

约 13.9KB。核心是 `WorkspaceScope` 冻结数据类：

```python
@dataclass(frozen=True)
class WorkspaceScope:
    project_path: Path
    access_mode: WorkspaceAccessMode  # "restricted" | "full"
    restrict_to_workspace: bool
    sandbox_status: WorkspaceSandboxStatus
    source_channel: str | None = None
```

作用域通过 Python `ContextVar` 绑定到当前 asyncio 任务，实现了 per-turn 的隔离。`WorkspaceScopeResolver` 负责从消息元数据、会话元数据、默认配置三层解析出有效作用域，优先级：消息级 > 会话级 > 默认。

---

## "Agent-Native 基础设施"的含义

结合 nanobot 和 HKUDS 实验室的另一个项目 CLI-Anything（46.3k stars），可以理解任旭滨报告中"Agent-Native 基础设施"的含义：

**Agent-Native 是指：软件接口的设计以 AI Agent 为第一用户，而非人类。**

具体表现为：

1. **CLI 是通用接口**：相比 GUI，CLI 是轻量的、可组合的、确定性的，天然匹配 LLM 的输入/输出格式。
2. **结构化输出**：所有命令支持 `--json` 输出，agent 可以程序化解析。
3. **自描述能力**：通过 `--help` 和 `SKILL.md` 文件，agent 可以自主发现和理解工具能力。
4. **真实软件集成**：Agent-Native 不是简化替代品，而是为真实软件（Blender、LibreOffice 等）构建结构化接口。
5. **自主发现与安装**：通过 CLI-Hub 注册中心，agent 可以自主浏览、安装和使用社区构建的 CLI。

nanobot 在这个图景中的位置是：**它是 agent 的运行时环境**——提供工具调用、记忆管理、多通道接入、权限控制等基础设施，让 agent 能够持久运行、自主工作。CLI-Anything 则是**工具的供给侧**——把现有软件变成 agent 可用的工具。

---

## 对 qwen-code 的启示

### 可以借鉴的设计思路

1. **AgentLoop / AgentRunner 分离**
   nanobot 把"通道侧编排"和"模型侧执行"清晰分离。qwen-code 当前在 CLI 场景下这两者耦合较紧（TUI 渲染、会话管理、模型调用交织在一起）。如果未来要支持多通道（如 WebUI、API 服务），这种分离是值得参考的架构模式。

2. **工具定义的稳定排序**
   nanobot 有意保持 tool definitions 的顺序稳定（内置工具排序在前，MCP 工具排序在后），以利用 provider 的 prompt cache。qwen-code 可以检查自己的工具定义顺序是否稳定，避免每次请求都因顺序变化导致 cache miss。

3. **工具错误的引导性消息**
   nanobot 在所有工具错误后附加 `"[Analyze the error above and try a different approach.]"`。这是一个简单但有效的 prompt engineering 技巧，引导模型在工具失败时自我纠错而非重复同一操作。

4. **模板检测避免 prompt 膨胀**
   nanobot 的 `_is_template_content()` 检查引导文件是否被用户自定义过，未自定义则跳过。qwen-code 有类似的 QWEN.md / AGENTS.md 机制，可以借鉴这种"空模板不注入"的策略。

5. **per-turn 工作区作用域（ContextVar）**
   nanobot 用 Python `ContextVar` 实现 per-turn 的工作区作用域绑定，确保并发 turn 之间的安全隔离。qwen-code 在处理多会话或子 agent 时，类似的作用域隔离机制值得参考。

6. **Dream 记忆整合**
   nanobot 的 Dream 是一个后台周期性任务，从对话历史中提取有价值信息写入长期记忆。qwen-code 的 auto memory 机制是用户/模型驱动的，没有自动整合。对于长时间运行的 daemon 模式，自动记忆整合是一个有价值的特性。

### 不同场景不适用的部分

1. **多通道消息总线**
   nanobot 的 MessageBus + Channel 架构是为"一个 agent 服务多个通道"设计的（Telegram、Discord、WebUI 等）。qwen-code 是 CLI-first 的开发工具，核心场景是终端交互，不需要这种多通道抽象。引入消息总线会增加不必要的复杂度。

2. **Gateway 长驻服务模式**
   nanobot 的 gateway 模式（后台运行、heartbeat、cron 定时任务）面向"个人 AI 助手"场景。qwen-code 是开发工具，以会话为单位运行，不需要 7×24 长驻。

3. **Python 生态选择**
   nanobot 选择 Python 是因为目标用户包含非技术背景的个人用户（"Start Without Technical Background" 文档）。qwen-code 选择 TypeScript/Node.js 是因为目标用户是开发者，且需要与 npm 生态深度集成。这是正确的场景匹配，无需改变。

4. **WebUI 作为主入口**
   nanobot 推荐 `nanobot webui` 作为首次运行入口，在浏览器中配置模型。qwen-code 的用户是开发者，终端是自然的工作场所，TUI 是更合适的交互形式。

5. **宽松的安全模型**
   nanobot 的默认安全模型是应用级守卫（路径检查），系统级沙箱是可选的。这对于个人助手场景足够（用户信任自己的 agent）。qwen-code 面向开发场景，处理的是生产代码，需要更严格的安全边界（如 qwen-code 已有的 sandbox 机制）。

### 定位差异总结

| 维度     | nanobot                          | qwen-code                      |
| -------- | -------------------------------- | ------------------------------ |
| 目标用户 | 个人用户、非技术人员、小团队     | 开发者                         |
| 核心场景 | 个人 AI 助手、多通道聊天、自动化 | 代码开发、终端交互、工程工作流 |
| 运行模式 | 长驻 gateway + 多通道            | 会话制 CLI/TUI                 |
| 交互入口 | WebUI 优先                       | 终端优先                       |
| 工具重点 | 文件、shell、web、图像生成、聊天 | 代码编辑、搜索、shell、MCP     |
| 记忆     | Dream 自动整合                   | 用户/模型驱动的 auto memory    |
| 安全     | 应用级守卫 + 可选系统沙箱        | 沙箱隔离 + 审批模式            |
| 扩展性   | 通道、工具、provider、技能       | 工具、MCP、扩展、技能          |

---

## 参考链接

- nanobot GitHub 仓库：https://github.com/HKUDS/nanobot
- nanobot 文档站：https://nanobot.wiki/docs/latest/getting-started/nanobot-overview
- nanobot 架构文档：https://github.com/HKUDS/nanobot/blob/main/docs/architecture.md
- nanobot 概念文档：https://github.com/HKUDS/nanobot/blob/main/docs/concepts.md
- 任旭滨 GitHub：https://github.com/Re-bin
- 任旭滨个人主页：https://ren-xubin.github.io
- 任旭滨 Google Scholar：https://scholar.google.com/citations?user=mxtvnNUAAAAJ
- HKUDS 实验室：https://github.com/HKUDS
- 黄超教授主页：https://sites.google.com/view/chaoh/home
- CLI-Anything：https://github.com/HKUDS/CLI-Anything
- VideoRAG 论文：https://arxiv.org/abs/2502.01549
- nanobot PyPI：https://pypi.org/project/nanobot-ai/
