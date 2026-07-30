# MindOS — 人机共进化的 Context Layer

## 基本信息

- **作者**：王天富（Tianfu Wang），港科大广州（HKUST-GZ）AI Trust 方向一年级博士生，导师为熊辉（Hui Xiong）教授和 Nicholas Jing Yuan 博士
- **教育背景**：重庆大学本科（2022）→ 中国科学技术大学硕士（2025，导师熊辉）→ 港科大广州博士（在读）
- **实习经历**：腾讯（当前）、微软 AI / MSRA、京东探索研究院
- **GitHub**：https://github.com/GeminiLight （105 followers，37 个公开仓库）
- **个人主页**：https://tianfuwang.tech
- **MindOS 仓库**：https://github.com/GeminiLight/MindOS （657 stars，59 forks，TypeScript，MIT 协议）
- **npm 包**：`@geminilight/mindos`
- **官方网站**：https://tianfuwang.tech/MindOS/

### 代表性论文（与本报告主题相关）

| 论文                                                                                                  | 会议/期刊          | 角色     | 关联                                                      |
| ----------------------------------------------------------------------------------------------------- | ------------------ | -------- | --------------------------------------------------------- |
| _Scaling Human-AI Coding Collaboration Requires a Governable Consensus Layer_ (arXiv:2604.17883)      | 预印本             | 一作     | **Context Layer 的理论基础**——提出 Agentic Consensus 范式 |
| _Evolve as a Team: Collaborative Self-Evolution for LLM-based Multi-Agent Systems_ (arXiv:2605.29790) | 预印本             | 共同作者 | 多智能体协同自进化框架 Meta-Team                          |
| _GenMentor: LLM-powered Multi-agent Framework for Goal-oriented Learning_                             | WWW 2025 Oral      | 一作     | 目标导向的智能辅导——"让人成长"的早期实践                  |
| _SocialCoach: Personalized Social Skill Learning with RL-based Agentic Tutoring_                      | —                  | 一作     | RL 驱动的社交技能个性化辅导                               |
| _EvoDiagram: Agentic Editable Diagram Creation via Design Expertise Evolution_ (arXiv:2604.09568)     | —                  | 一作     | 设计专长的 Agent 进化                                     |
| _Virne: A Comprehensive Simulator and Benchmark for RL-based NFV Resource Allocation_                 | ICLR 2026          | 一作     | RL 基准（早期方向）                                       |
| _CONAL: Constraint-aware Learning for Robust Network Resource Allocation_                             | ICML 2025 Workshop | 一作     | **Best Paper Award**（1/33）                              |
| _HumanLLM: Personalized Understanding and Simulation of Human Nature_                                 | KDD 2026           | 合作     | 人性化 LLM                                                |

Google Scholar 引用 500+，发表 AI 顶会顶刊论文 30 余篇。

### 其他开源项目

| 项目                                                                                | Stars | 说明                                    |
| ----------------------------------------------------------------------------------- | ----- | --------------------------------------- |
| [virne](https://github.com/GeminiLight/virne)                                       | 158   | ICLR 2026，NFV 资源分配 RL 模拟器与基准 |
| [awesome-ai-llm4education](https://github.com/GeminiLight/awesome-ai-llm4education) | 208   | AI/LLM 教育论文集                       |
| [gen-mentor](https://github.com/GeminiLight/gen-mentor)                             | 79    | WWW 2025 Oral，目标导向智能辅导         |
| [flag-vne](https://github.com/GeminiLight/flag-vne)                                 | 37    | IJCAI 2024，元 RL 网络资源分配          |

---

## 核心理念

### 为什么"人也要进化"？

王天富的研究核心问题（引自个人主页）：

> "How can we build socially aware AI agents that empower humans to thrive?"

这不是一个纯粹的工程问题，而是一个关于**人与 AI 关系**的立场声明。当前 Agent 系统的主流叙事是"让 AI 更强"——更大的模型、更好的工具调用、更长的上下文。但王天富认为这忽略了一个根本问题：

**如果只有 AI 在进化，人类退化为"提示词输入器"和"结果审批员"，那这种协作是不可持续的。**

具体而言，现有 Agent 系统存在三个结构性盲区：

1. **记忆孤岛（Memory Silos）**：每个 Agent、每次对话、每个工具都有自己独立的上下文。用户在 Claude Code 里建立的偏好，到了 Cursor 就消失了。人类被迫反复"教"AI 同样的事情。
2. **维度坍缩（Dimension Collapse）**：AI 辅助编程的主要产物是"代码 + 聊天记录"。聊天记录把复杂的系统拓扑、设计决策、约束条件压扁成低维文本。代码能跑，但没人知道为什么这样写、假设了什么、依赖了什么。
3. **经验蒸发（Experience Evaporation）**：人类在协作中产生的洞察、修正、判断标准，随着对话窗口关闭就消失了。没有被沉淀、没有被复用、没有被结构化。

### "人机共进化"的含义

MindOS 的口号是 **"Where You Think, Agents Act"**——人在这里思考，Agent 在那里行动。但关键不在于分工，而在于**闭环**：

```
人类思考、审查、修正
        ↓
MindOS 存储持久化上下文
        ↓
Agent 基于共享上下文执行
        ↓
Agent 的结果和经验回流
        ↓
审查后的经验变成可复用的 SOP/Skill
        ↓
未来的 Agent 运行从更好的基线出发
```

在这个循环中：

- **AI 进化**：Agent 获得越来越丰富的上下文、越来越精确的 SOP，执行质量提升。
- **人类进化**：人的决策被记录、被链接、被回顾。知识图谱让人看到自己的思维轨迹。"Echo/Reflection"模块支持认知蒸馏和思维成长追踪。人不再是"一次性提示词工人"，而是在积累**可复合的认知资产**。

---

## Context Layer 架构

### 理论基础：Agentic Consensus

MindOS 的工程实现背后有一篇理论基础论文：_Scaling Human-AI Coding Collaboration Requires a Governable Consensus Layer_（arXiv:2604.17883，王天富一作）。

该论文提出 **Agentic Consensus** 范式：

- **共识层 C**（Consensus Layer）是一个**可操作的世界模型**，用**类型化属性图（typed property graph）**表示。
- 共识层**取代代码**成为工程的主要产物（primary artifact）。可执行产物（代码、配置等）从 C 派生，并通过同步算子保持对应：
  - **Φ（realize）**：从共识层派生可执行产物。
  - **Ψ（rehydrate）**：从可执行产物反向恢复共识层信息。
- 证据直接链接到 C 中的结构性声明，使每个承诺可审计，使不充分指定（under-specification）可度量为**共识熵（consensus entropy）**。
- 评估标准从"代码正确性"转向**对齐保真度（alignment fidelity）**、**共识熵**和**干预距离（intervention distance）**。

MindOS 可以被视为 Agentic Consensus 范式的**工程实现**：本地 Markdown 知识库就是共识层 C 的实例化，MCP 工具就是 Φ/Ψ 同步算子的接口。

### 系统架构

```
┌─────────────────────────────────────────────────────┐
│                     人类                             │
│  想法 · 反馈 · 审查 · 修正 · 偏好 · 标准            │
└─────────────┬───────────────────────────┬───────────┘
              │ 写入                      │ 审查/回顾
              ▼                          │
┌─────────────────────────────────────────┤
│           MindOS 本地知识库              │
│  ~/.mindos/mind/                        │
│  ┌─────────────────────────────────┐    │
│  │ Profile/    — 身份、偏好        │    │
│  │ Projects/   — 项目记忆          │    │
│  │ Workflows/  — SOP、工作流       │    │
│  │ Configs/    — 代码标准、配置    │    │
│  │ Resources/  — 参考资料          │    │
│  │ Inbox/      — 暂存区            │    │
│  └─────────────────────────────────┘    │
│  存储格式：本地 Markdown 纯文本          │
│  版本控制：Git 自动同步                  │
│  知识图谱：文件间引用/依赖可视化         │
│  审计日志：Agent 操作 + 内容变更记录     │
└─────────────┬───────────────────────────┘
              │ MCP / Skills
              ▼
┌─────────────────────────────────────────┐
│           AI Agents                      │
│  Claude Code · Cursor · Codex · Gemini  │
│  GitHub Copilot · Trae · CodeBuddy ...  │
│                                         │
│  读取上下文 → 执行任务 → 返回结果       │
│  结果 + 经验 → 蒸馏为 SOP/Skill         │
└─────────────────────────────────────────┘
```

### 与普通 Memory 系统的区别

| 维度         | 普通 Memory（如 qwen-code memories/） | MindOS Context Layer                                          |
| ------------ | ------------------------------------- | ------------------------------------------------------------- |
| **所有权**   | Agent 拥有，Agent 写入                | 人类拥有，人类可编辑、审查、否决                              |
| **透明度**   | 通常隐藏在配置目录中                  | 本地 Markdown，GUI 可浏览，Git 可追溯                         |
| **跨 Agent** | 绑定单一 Agent 工具                   | 通过 MCP 对所有支持的 Agent 开放                              |
| **结构化**   | 扁平文件 + 索引                       | 空间（Space）层级 + 知识图谱 + 反向链接                       |
| **可审计**   | 通常无审计                            | Agent Inspector + 操作日志 + 内容变更追踪                     |
| **可回滚**   | 通常不支持                            | Git 自动同步，支持 rollback                                   |
| **人类进化** | 不涉及                                | Echo/Reflection 模块追踪思维成长                              |
| **经验沉淀** | 记忆条目                              | SOP、Skill、Workflow 定义——可执行的结构化知识                 |
| **健康度**   | 无                                    | `mindos_lint` 检测孤立文件、过期文件、断链，给出 0-100 健康分 |
| **主动维护** | 无                                    | `mindos_dreaming` 后台知识维护——生成审查提案但不直接修改      |

**核心区别总结**：普通 memory 是 Agent 的"笔记本"，MindOS 是人与 Agent 共享的"心智操作系统"。Memory 让 Agent 记住过去，Context Layer 让人和 Agent 共同积累可复合的认知资产。

---

## 关键源码解读

### 仓库结构

```
MindOS/
├── packages/mindos/            # 核心运行时：CLI、服务器、协议、产品逻辑
│   └── src/
│       ├── agent/              # Agent 运行时（可恢复会话、取消、重连）
│       ├── foundation/         # 基础设施
│       ├── intelligence/       # AI 能力层
│       │   └── cognition/      # 认知处理
│       ├── knowledge/          # 知识模块（核心）
│       │   ├── storage/        # 持久化存储
│       │   ├── spaces/         # 知识空间管理
│       │   ├── graph/          # 知识图谱（引用/依赖解析）
│       │   ├── audit/          # 审计日志（Agent 操作 + 内容变更）
│       │   ├── git/            # Git 集成（历史、回滚）
│       │   ├── knowledge-ops/  # 高层知识操作
│       │   └── content-integrity.ts  # 内容完整性校验
│       ├── plugin/             # 插件系统
│       ├── protocols/          # 协议层
│       │   ├── mcp-server/     # MCP 服务器（Agent 接入点）
│       │   └── acp/            # ACP/A2A 协议（实验性）
│       ├── retrieval/          # 检索/搜索/向量适配器
│       ├── server/             # HTTP 服务器
│       ├── setup/              # 安装/引导
│       └── tool/               # 工具定义
├── packages/web/               # Next.js 前端（本地知识工作台）
├── packages/desktop/           # Electron 桌面客户端
├── packages/browser-extension/ # Web Clipper 浏览器扩展
├── packages/retrieval/         # 可选检索适配器
├── packages/mobile/            # Expo 移动端
├── skills/                     # Agent Skills（指令集）
│   ├── mindos/                 # 英文 Skill
│   ├── mindos-zh/              # 中文 Skill
│   ├── mindos-max/             # 增强版 Skill
│   └── project-wiki/           # 项目 Wiki Skill
├── templates/                  # 知识库模板
└── docs/                       # 文档
```

### MCP 服务器：Agent 接入层

MCP 服务器（`packages/mindos/src/protocols/mcp-server/index.ts`）是一个**协议适配器**——它不包含业务逻辑，而是将 MCP 工具调用转发到 MindOS App 的 REST API。

**传输方式**：

- Streamable HTTP（默认，端口 8781，路径 `/mcp`）
- stdio

**Agent 身份追踪**：MCP 客户端名称通过 `x-mindos-agent` 头传递，用于审计日志。

**暴露的 MCP 工具**（前缀 `mindos_`）：

| 类别             | 工具                                                                                                                                   | 说明                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **发现与读取**   | `mindos_list_files`, `mindos_list_spaces`, `mindos_read_file`, `mindos_read_lines`                                                     | 浏览知识库结构和内容               |
| **搜索**         | `mindos_search_notes`, `mindos_get_recent`                                                                                             | 全文搜索 + 最近文件                |
| **文件变更**     | `mindos_write_file`, `mindos_create_file`, `mindos_batch_create_files`, `mindos_delete_file`, `mindos_rename_file`, `mindos_move_file` | CRUD 操作                          |
| **行级编辑**     | `mindos_insert_lines`, `mindos_update_lines`                                                                                           | 精确行级修改                       |
| **内容追加**     | `mindos_append_to_file`, `mindos_insert_after_heading`, `mindos_update_section`, `mindos_append_csv`                                   | Markdown 结构化编辑                |
| **空间管理**     | `mindos_create_space`, `mindos_rename_space`                                                                                           | 知识空间 CRUD                      |
| **链接与上下文** | `mindos_get_backlinks`, `mindos_bootstrap`                                                                                             | 反向链接 + 引导上下文              |
| **Git 历史**     | `mindos_get_history`, `mindos_get_file_at_version`                                                                                     | 版本追溯                           |
| **健康与维护**   | `mindos_lint`, `mindos_dreaming`, `mindos_compile`                                                                                     | 健康检查 + 后台维护 + 空间概览生成 |

**安全设计**：

- 写操作包含安全标志：`allow_shrink`、`allow_empty`、`allow_truncated_content`
- 删除操作标注 `destructiveHint: true`
- 输出截断限制：25,000 字符
- `mindos_read_file` 支持 offset/limit 分页

### 知识模块：核心 API

`knowledge.ts` 是知识模块的公共入口，导出六个子系统：

```typescript
export * from './knowledge/storage/index.js'; // 持久化
export * from './knowledge/spaces/index.js'; // 空间管理
export * from './knowledge/graph/index.js'; // 知识图谱
export * as audit from './knowledge/audit/index.js'; // 审计
export * as git from './knowledge/git/index.js'; // Git 集成
export * from './knowledge/knowledge-ops/index.js'; // 高层操作
```

**审计 API** 是人机共进化的关键基础设施：

```typescript
// Agent 操作审计
appendAgentAuditEvent(event: AgentAuditInput)
listAgentAuditEvents()

// 内容变更追踪
appendContentChange(change: ContentChangeInput)
listContentChanges()
getContentChangeSummary(): ContentChangeSummary
markContentChangesSeen()
```

每次 Agent 对知识库的读写都被记录，人类可以通过 Agent Inspector 审查所有操作。

### Skills：Agent 行为指令

MindOS 通过 `skills/mindos/SKILL.md` 向连接的 Agent 注入行为规范。核心规则：

**检索策略**（双路径并行）：

1. **目录扫描**：从文件/文件夹名推断相关性
2. **全文搜索**：名称不够时搜索内容
3. 深读最相关的 1-3 个文件，引用稳定路径

**读写规则**：

- 默认**只读**。只有用户明确要求保存/记录/更新时才写入
- 写入前必须先读取目标文件
- 目标不明确时存入 `Inbox/` 暂存
- 多文件编辑先展示计划，获批后执行
- 优先使用 `update_section`、`insert_after_heading` 等精确编辑，避免全文件覆写

**优先级链**：

1. 用户当前指令
2. `.mindos/user-preferences.md`
3. 最近目录的 `INSTRUCTION.md`
4. 根目录 `INSTRUCTION.md`
5. SKILL.md 默认值

**主动但克制**：

- 先搜索已存储的上下文
- 在有价值的工作后提议保存，但只在适当时
- 写入任务后最多提议一个后续钩子（经验捕获、一致性同步、SOP 漂移检查等）

**硬性禁止**：

- 不得写入知识库根目录
- 不得假设目录名
- 不得为小编辑覆写整个文件
- 不得未经确认修改 `INSTRUCTION.md` 或 `README.md`
- 不得在重命名/移动后留下孤立引用

### Dreaming：后台知识维护

`mindos_dreaming` 是一个独特的设计——Agent 在后台运行保守的知识维护：

- 捕获本地信号（孤立文件、过期内容、断链等）
- 将信号分组为维护主题
- 生成**审查优先的提案**，写入 `.mindos/dreaming/`
- **不直接修改用户笔记**

这体现了 MindOS 的核心原则：**Agent 可以建议，但人类决定**。

---

## 与 qwen-code 记忆系统的对比

### qwen-code memories/ 系统

qwen-code 的记忆系统（即本项目正在使用的系统）是一个**Agent 侧的持久化记忆机制**：

- **存储**：`~/.qwen/memories/`（用户级）和项目级 `memory/` 目录
- **格式**：带 frontmatter 的 Markdown 文件（name, description, type）
- **索引**：`MEMORY.md` 单文件索引，每行一条
- **类型**：user（用户画像）、feedback（行为反馈）、project（项目状态）、reference（外部资源指针）
- **写入者**：Agent 自主判断并写入
- **读取时机**：每次对话开始时加载 MEMORY.md 索引

### 对比分析

| 维度              | qwen-code memories/                         | MindOS Context Layer                                 |
| ----------------- | ------------------------------------------- | ---------------------------------------------------- |
| **设计哲学**      | Agent 的"长期记忆"——让 Agent 跨会话记住用户 | 人机共享的"心智操作系统"——让人和 Agent 共同积累认知  |
| **所有权与控制**  | Agent 写入，用户可手动编辑但无 GUI          | 人类拥有，GUI 可浏览/编辑，Agent 操作需遵循严格规则  |
| **跨 Agent 能力** | 仅限 qwen-code                              | 通过 MCP 支持 12+ 种 Agent 工具                      |
| **结构化程度**    | 4 种类型 + 扁平文件                         | 空间层级 + 知识图谱 + 反向链接 + INSTRUCTION.md      |
| **可审计性**      | 无审计日志                                  | Agent Inspector + 操作日志 + 内容变更追踪 + Git 历史 |
| **版本控制**      | 无（iCloud 同步可能有）                     | Git 自动同步，支持 commit/push/pull/rollback         |
| **健康维护**      | 依赖 Agent 自觉清理                         | `mindos_lint` 健康评分 + `mindos_dreaming` 后台维护  |
| **经验沉淀形式**  | 记忆条目（文本）                            | SOP、Skill、Workflow 定义——可执行的结构化知识        |
| **人类成长支持**  | 无                                          | Echo/Reflection 模块、知识图谱可视化、思维轨迹追踪   |
| **安装复杂度**    | 零配置，内置                                | 需要安装（npm/desktop）+ MCP 配置 + Skill 安装       |
| **Token 开销**    | 低（MEMORY.md 索引 < 200 行）               | 中-高（bootstrap 上下文 + 搜索 + 深读）              |
| **适用场景**      | 单一 Agent CLI 的个性化                     | 多 Agent 工具链的统一知识管理                        |

### 各自优势

**qwen-code memories/ 的优势**：

- **零摩擦**：不需要安装任何东西，Agent 自动管理
- **低开销**：索引极小，不占用太多上下文窗口
- **类型化**：4 种类型有明确的 scope 指导（user vs project），避免混乱
- **深度集成**：与 qwen-code 的对话流无缝衔接，Agent 自主判断何时读写

**MindOS 的优势**：

- **人类主权**：知识库归人类所有，Agent 是"访客"而非"主人"
- **跨工具**：一份知识，所有 Agent 共享——解决了记忆孤岛问题
- **可审计**：每个 Agent 操作都有日志，人类可以追溯和回滚
- **结构化**：知识图谱、反向链接、空间层级——比扁平文件更丰富
- **可执行知识**：SOP 和 Skill 不只是"记住"，而是"可以照着做"
- **健康度管理**：主动检测知识腐化（孤立、过期、断链）

---

## 对 qwen-code 的启示

### 1. 从"Agent 记忆"到"共享上下文"

qwen-code 的 memories/ 系统本质上是 Agent 的私人笔记本。MindOS 的思路是：**知识应该归人类所有，Agent 是知识的使用者和贡献者，但不是所有者**。

**可借鉴**：在 memories/ 系统中增加"人类审查"机制。例如：

- Agent 写入记忆后，在下次对话开始时简要告知用户"我记住了 X"
- 提供 `/memories review` 命令让用户浏览和清理
- 记忆文件增加 `source: agent | user` 标记，区分来源

### 2. 审计与透明

MindOS 的 Agent Inspector 和审计日志是一个重要设计。当前 qwen-code 的记忆写入是"静默"的——用户不知道 Agent 记了什么、改了什么。

**可借鉴**：

- 在记忆写入时输出简短确认（"已保存 feedback 记忆：xxx"）
- 在 MEMORY.md 索引中增加最后修改时间
- 考虑 `git init` 记忆目录，提供变更历史

### 3. 经验沉淀为可执行知识

MindOS 最有价值的设计是将经验蒸馏为 **SOP 和 Skill**——不只是"记住发生了什么"，而是"下次该怎么做"。qwen-code 的 feedback 类型记忆接近这个理念，但还不够结构化。

**可借鉴**：

- feedback 记忆可以增加 `trigger`（何时触发）和 `action`（该怎么做）字段
- 考虑增加 `sop` 类型记忆，存储多步骤的操作规程
- 与 qwen-code 的 skills 系统打通——从反复出现的 feedback 中自动生成 skill

### 4. 知识健康度

MindOS 的 `mindos_lint`（健康评分）和 `mindos_dreaming`（后台维护提案）是防止知识腐化的机制。qwen-code 的 memories/ 目前没有清理机制，随着时间推移可能积累过期或矛盾的记忆。

**可借鉴**：

- 在记忆索引中增加创建/更新时间
- Agent 在读取记忆时检查时效性（"这条记忆是 3 个月前写的，可能已过期"）
- 定期（或用户触发）运行记忆清理：合并重复、删除过期、标记需确认

### 5. 跨 Agent 互操作

MindOS 通过 MCP 实现了"一份知识，所有 Agent 共享"。qwen-code 的 memories/ 是封闭的——只有 qwen-code 能读写。

**可借鉴**：

- 考虑将 memories/ 目录结构标准化，使其可被其他工具读取
- 或者通过 MCP 暴露记忆读写能力
- 但需权衡：跨 Agent 共享增加了复杂性，qwen-code 的"零配置"优势不应丢失

### 6. Agentic Consensus 的理论视角

王天富的论文提出的"维度坍缩"问题值得深思：当前的 AI 辅助编程把复杂的系统设计压扁成"代码 + 聊天记录"，丢失了结构信息。qwen-code 的 design docs（`docs/design/`）和 plans 是对抗维度坍缩的初步尝试，但可以更系统化。

**可借鉴**：

- 在 design doc 中显式记录**假设**和**约束**，而不仅是方案
- 考虑在 PR 描述中增加"共识熵"概念——这个 PR 有多少隐含假设没有被显式记录？
- 将 AGENTS.md 视为 qwen-code 项目自身的"共识层"——它已经在做这件事，但可以更结构化

---

## 参考链接

### MindOS 项目

- GitHub 仓库：https://github.com/GeminiLight/MindOS
- 官方网站：https://tianfuwang.tech/MindOS/
- npm 包：https://www.npmjs.com/package/@geminilight/mindos
- 文档（配置）：https://github.com/GeminiLight/MindOS/blob/main/docs/en/configuration.md
- 文档（支持的 Agent）：https://github.com/GeminiLight/MindOS/blob/main/docs/en/supported-agents.md
- 文档（CLI 命令）：https://github.com/GeminiLight/MindOS/blob/main/docs/en/cli-commands.md

### 作者

- GitHub：https://github.com/GeminiLight
- 个人主页：https://tianfuwang.tech
- 微信：wtfly2018

### 论文

- Agentic Consensus（Context Layer 理论基础）：https://arxiv.org/abs/2604.17883
- Meta-Team（多智能体协同自进化）：https://arxiv.org/abs/2605.29790
- GenMentor（WWW 2025 Oral，目标导向智能辅导）：https://arxiv.org/abs/2501.15749
- EvoDiagram（设计专长进化）：https://arxiv.org/abs/2604.09568

### 相关项目

- GenMentor 代码：https://github.com/GeminiLight/gen-mentor
- Virne（ICLR 2026）：https://github.com/GeminiLight/virne
- CONAL（ICML 2025 Workshop Best Paper）：https://github.com/GeminiLight/conal-vne

---

_研究日期：2026-07-30_
_数据来源：GitHub、arXiv、作者个人主页、MindOS 官方网站、MindOS 源码_
_注：Google Scholar 搜索因反爬机制未能直接获取引用数据，引用数来自任务背景描述_
