# Agent Harness 综述 — 外部化范式

## 基本信息

- **作者/团队**：Chenyu Zhou（周宸宇，一作）, Huacan Chai, Wenteng Chen, Zihan Guo, Rong Shan, Yuanyi Song, Tianyi Xu, Yingxuan Yang, Aofan Yu, Weiming Zhang, Congming Zheng, Jiachen Zhu, Zeyu Zheng, Zhuosheng Zhang, Xingyu Lou, Changwang Zhang, Zhihui Fu, Jun Wang, Weiwen Liu, Jianghao Lin, Weinan Zhang（共 21 人）
- **机构**：上海交通大学智能计算研究院（导师：叶荫宇教授、葛冬冬教授）
- **论文标题**：_Externalization in LLM Agents: A Unified Review of Memory, Skills, Protocols and Harness Engineering_
- **arXiv**：[2604.08224](https://arxiv.org/abs/2604.08224)（2026 年 4 月 9 日提交）
- **GitHub**：未能获取。截至 2026-07-30，未在 GitHub 上找到该论文的专属仓库、awesome list 或代码实现。作者 GitHub 个人主页也未能确认。
- **研讨会报告主题**："模型之外的智能：LLM Agent 的外部化范式"

### 同一团队的相关论文

| 论文                                                                                  | arXiv                                          | 日期    | 核心思路                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| LatentSkill: From In-Context Textual Skills to In-Weight Latent Skills for LLM Agents | [2606.06087](https://arxiv.org/abs/2606.06087) | 2026-06 | 将文本 skill 转化为 LoRA 适配器，从 context 空间迁移到 weight 空间，减少 64-72% 的 prefill token 开销 |
| Skills on the Fly: Test-Time Adaptive Skill Synthesis for LLM Agents                  | [2605.16986](https://arxiv.org/abs/2605.16986) | 2026-05 | 测试时自适应 skill 合成（SkillTTA），检索相关轨迹并动态生成临时 skill，配合元提示优化（MPO）          |
| From Soliloquy to Agora: Memory-Enhanced LLM Agents with Decentralized Debate         | [2604.25847](https://arxiv.org/abs/2604.25847) | 2026-04 | 记忆增强的多 Agent 去中心化辩论框架，用于优化建模                                                     |

---

## 核心框架：外部化范式

### 中心论点

> 实用的 LLM Agent 进展越来越不仅取决于更强的模型，还取决于更好的**外部认知基础设施**。

论文借用 Norman 的"认知制品"（cognitive artifacts）概念：外部化工具不只是放大能力，而是**改变了任务本身的性质**。Agent 基础设施的意义不在于给模型"加配件"，而在于把模型难以内部处理的认知负担转化为更可靠的形式。

### 历史演进：Weights → Context → Harness

| 阶段        | 能力定位              | 代表技术                                                  | 优势                                             | 局限                                           |
| ----------- | --------------------- | --------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| **Weights** | 能力 = 模型参数       | 预训练、scaling laws、指令微调、偏好优化                  | 推理快、部署紧凑、泛化广                         | 难以选择性更新、审计、个性化、治理             |
| **Context** | 能力 = 输入设计       | Prompt engineering、CoT、ReAct、ToT、RAG                  | 无需更新权重、快速迭代                           | 有限上下文、噪声、lost-in-the-middle、状态短暂 |
| **Harness** | 能力 = 运行时基础设施 | AutoGPT、AutoGen、SWE-agent、OpenHands、LangGraph、CrewAI | 持久状态、可复用 skill、受治理交互、编排、可观测 | 工程复杂度高                                   |

### 三层外部化 + 统一工程层

论文的核心结构是**三个外部化维度 + 一个统一工程层**：

```
┌─────────────────────────────────────────────────┐
│              Harness Engineering                 │
│    （运行时环境：编排、治理、可观测、反馈）         │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Memory  │  │  Skills  │  │ Protocols│       │
│  │ 状态外部化│  │ 过程外部化│  │ 交互外部化│       │
│  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────┘
```

---

### 1. Memory：状态外部化

**核心转化：从 recall（回忆）到 recognition（识别）**

不再强迫模型从潜在权重中重新生成过去的知识，而是从外部存储中检索相关状态。

#### 四个内容维度

| 维度           | 内容                                                 | 特征                                 |
| -------------- | ---------------------------------------------------- | ------------------------------------ |
| **工作上下文** | 打开的文件、临时变量、活跃假设、部分计划、执行检查点 | 变化快，仅在当前任务有价值           |
| **情景经验**   | 过去的决策点、工具调用、失败、结果、反思             | 作为先例：避免重复错误、提供具体示例 |
| **语义知识**   | 领域事实、通用启发式、项目惯例、稳定世界知识         | 跨情景的抽象，比情景记忆更持久       |
| **个性化记忆** | 用户偏好、习惯、循环约束、历史交互                   | 有独立的保留规则、检索规则、隐私要求 |

#### 四种架构范式

1. **单体上下文（Monolithic Context）**：所有历史留在 prompt 中。透明但不可扩展。
2. **上下文 + 检索存储（Context with Retrieval Storage）**：近期状态在上下文，长期轨迹外部存储按需检索。当前主流模式（copilot、编码 Agent）。
3. **层级记忆与编排（Hierarchical Memory）**：引入提取、整合、遗忘、晋升、分层等显式记忆操作。两个方向：
   - 时空维度的资源解耦（类操作系统的热/冷存储分层）
   - 认知功能维度的语义解耦（按事件/用户画像/世界知识分类）
4. **自适应记忆系统（Adaptive Memory）**：记忆系统对经验做出响应。
   - 动态模块：架构本身可在运行时演化
   - 基于反馈的策略优化：RL 检索、MoE 路由、多轮检索条件精化

#### Harness 时代的记忆

在成熟的 Agent 系统中，记忆成为**受管理的状态基础设施**：

- 将状态与上下文分离
- 提供策划过的快照而非完整历史
- 支持可恢复执行
- 为 skill 蒸馏提供证据
- 与协议事件集成
- 支持共享、权限、冲突解决和治理

> 一个典型的 harness 级模式：将文件系统或工作区作为任务状态的权威记录，模型在每个决策步骤只读取策划过的快照。

---

### 2. Skills：过程知识外部化

**核心转化：从 generation（即兴生成）到 composition（组合复用）**

不再每次从头即兴推导每个步骤，而是从预验证的组件中组装行为。

#### 外部化的三类内容

| 类型           | 内容                                       | 作用             |
| -------------- | ------------------------------------------ | ---------------- |
| **操作过程**   | 工作流、步骤序列、SOP、工具使用模式        | 减少执行间的方差 |
| **决策启发式** | 何时用什么工具、如何优先排序、如何处理异常 | 提供实践判断规则 |
| **规范约束**   | 安全约束、策略约束、质量标准、组织惯例     | 使行为更可治理   |

#### 演化三阶段

1. **原子执行原语**：调 API、跑命令、读文件、搜索——窄 building blocks
2. **大规模原语选择**：大量原语可用，Agent 需从中选择——发现、路由、schema 正确性
3. **Skill 即打包专长**：包含过程 + 工具绑定 + 约束 + 使用指南的高级能力包

#### 五种外部化机制

1. **规约（Specification）**：名称、目的、输入输出、约束、示例、操作说明
2. **发现（Discovery）**：注册表、索引、搜索、能力元数据
3. **渐进披露（Progressive Disclosure）**：先展示摘要，需要时才展开细节，节省上下文预算
4. **执行绑定（Execution Binding）**：绑定到工具、API、沙箱、文件系统
5. **组合（Composition）**：skill 组合成更大工作流——兼容性、排序、安全、状态交接

#### 四种获取模式

| 模式                     | 说明                         | 优劣                           |
| ------------------------ | ---------------------------- | ------------------------------ |
| **人工编写（Authored）** | 人类显式编写                 | 高质量、清晰意图，但成本高、慢 |
| **蒸馏（Distilled）**    | 从轨迹、演示、成功片段中提取 | 将经验转化为可复用过程         |
| **发现（Discovered）**   | 通过探索或自动搜索涌现       | 可扩展但需要验证               |
| **组合（Composed）**     | 组合现有 skill 形成新能力    | 实现抽象和复用，但引入组合风险 |

#### 边界条件与风险

- **语义对齐**：skill 必须有意义地匹配目标任务，错位的 skill 检索会产生看似合理但错误的行为
- **可移植性与过时**：skill 可能依赖特定环境/API/版本
- **不安全组合**：单独安全的 skill 组合后可能不安全
- **上下文依赖退化**：在一个设置中有效的 skill 在另一个设置中可能失败

---

### 3. Protocols：交互结构外部化

**核心转化：从 ad-hoc coordination（即兴协调）到 structured contract（结构化契约）**

#### 外部化的四个要素

| 要素               | 内容                                     |
| ------------------ | ---------------------------------------- |
| **调用语法**       | 请求格式、参数、schema、响应结构         |
| **生命周期语义**   | 会话发起、继续、取消、完成、错误处理     |
| **权限与信任边界** | 授权、委托限制、升级、信任关系           |
| **发现元数据**     | 能力卡片、工具描述、Agent 画像、服务清单 |

#### 四类协议

1. **Agent-Tool 协议**：schema 正确性、调用语义、结果解析、错误处理、权限
2. **Agent-Agent 协议**：委托、协商、任务分配、结果交换、协调
3. **Agent-User 协议**：意图捕获、澄清、审批、解释、用户控制
4. **其他协议**：环境接口、编排契约、治理钩子、可观测性标准

#### 为什么协议重要

- **统一交互标准**：减少脆弱的定制集成
- **安全、治理与可审计**：显式契约使行为更易检查、约束、记录、验证
- **减少厂商依赖**：标准化接口减少锁定，组件更可替换

---

### 4. Harness Engineering：统一外部化层

**定义**：Harness Engineering 不是第四个外部化类型，而是**承载和协调 Memory、Skills、Protocols 的运行时环境**。

> Harness engineering unifies externalized modules into a coherent runtime environment with constraints, observability, feedback loops, and control points.

#### Harness 做什么

Harness 在以下要素之间做中介：

- 模型的推理能力
- 外部记忆
- 可复用 skill
- 协议化接口
- 执行环境
- 人类监督

它决定：

- 模型**看到**什么
- 模型**记住**什么
- 模型**能调用**什么
- 模型**被允许做**什么
- 失败**如何处理**
- 行为**如何评估**

#### 六个设计维度

| 维度                     | 关注点                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| **Agent 循环与控制流**   | 单轮/多轮循环、计划-执行周期、子 Agent 编排、分支、重试、终止条件 |
| **沙箱与执行隔离**       | 隔离环境、受限文件访问、受控网络访问、安全代码执行                |
| **人类监督与审批门**     | 审批、确认、升级、审查检查点                                      |
| **可观测性与结构化反馈** | 轨迹、日志、工具调用、中间状态、评估信号                          |
| **配置、权限与策略编码** | 角色、权限、策略、约束、允许的工具、访问配额                      |
| **上下文预算管理**       | 检索什么记忆、加载什么 skill、包含什么协议元数据、何时压缩或摘要  |

---

## 与现有系统的对比

### 按能力层分类

论文将现有框架按能力定位分为三代：

- **Weights 层**：GPT-4、Gemini、DeepSeek-V3、Qwen2.5 等基础模型
- **Context 层**：Prompt engineering、CoT、ReAct、ToT、Self-Refine、自动 prompt 优化、RAG
- **Harness 层**：AutoGPT、BabyAGI、AutoGen、MetaGPT、CAMEL、Reflexion、SWE-agent、OpenHands、Voyager、LangGraph、CrewAI、OS-Copilot、Deep Research 类系统

### 按外部化维度分类

| 导向              | 代表系统                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Memory 导向**   | MemGPT、MemoryOS、Mem0、Memory-R1、MemBank、MIRIX、MemOS、xMemory、MemEvolve、MemVerse、MemRL、GAM |
| **Skill 导向**    | 按成熟度分：原子原语 → 大规模选择 → 打包专长                                                       |
| **Protocol 导向** | 按交互类型分：Agent-Tool / Agent-Agent / Agent-User                                                |
| **Harness 导向**  | 按设计维度分：控制流 / 沙箱 / 人类监督 / 可观测 / 策略 / 上下文预算                                |

### 模块交互分类

论文还提出了系统级分类——按模块间耦合方式：

- memory → skill：经验蒸馏
- skill → memory：执行记录
- skill → protocol：能力调用
- protocol → skill：能力生成
- memory → protocol：策略选择
- protocol → memory：结果同化

### qwen-code 属于哪一类？

按论文框架，qwen-code 属于 **Harness 层**系统，且是一个**以编码为中心的 Agent harness**。具体而言：

- 它不是单纯的 context 层工具（不只是 prompt engineering），而是具备持久状态、skill 注册、协议化接口、编排逻辑和人类监督的完整运行时
- 在六个 harness 设计维度上均有体现（详见"对 qwen-code 的启示"一节）

---

## 关键洞察

### 洞察 1：Agent 可靠性越来越来自环境，而非模型

许多实际收益不来自改变基础模型，而来自：持久记忆、可复用 skill、标准化接口、受约束执行、显式控制逻辑、可观测性、审批循环。

> 实际问题不仅是"模型有多强？"，而是"哪些负担已经被外部化，使模型不必每次都在内部解决它们？"

### 洞察 2：外部化是表征转化，不只是"加组件"

借用 Norman 的认知制品理论：

- recall → recognition（记忆）
- improvised generation → composition（skill）
- ad hoc coordination → structured contract（协议）

### 洞察 3：三个核心失配驱动外部化需求

| 失配           | 问题                                                 | 对应外部化 |
| -------------- | ---------------------------------------------------- | ---------- |
| **连续性问题** | 有限上下文、弱会话记忆                               | Memory     |
| **方差问题**   | 长多步过程每次重新推导而非一致执行                   | Skills     |
| **协调问题**   | 与工具/服务/协作者的交互在自由格式 prompt 下仍然脆弱 | Protocols  |

### 洞察 4：Harness 是生产可靠性的工程所在

模型仍是推理引擎，但智能分布在塑造以下内容的结构中：模型看到什么、记住什么、能调用什么、被允许做什么。

> "Agent engineering" 越来越成为 "Harness engineering"。

### 洞察 5：记忆质量在于可读性（legibility），而非存储量

巨大的存储 + 弱检索 = 仍然失败。生产记忆必须在正确时间、以可用形式提供正确的历史切片。

### 洞察 6：外部化不是免费的——存在权衡空间

| 权衡维度     | 参数化能力        | 外部化能力               |
| ------------ | ----------------- | ------------------------ |
| 更新频率     | 稳定但难更新      | 易更新但可能过时         |
| 可复用性     | 难以跨 Agent 复用 | 更易跨 Agent 复用        |
| 可审计性     | 难以检查          | 更可检查、可治理         |
| 延迟与简洁性 | 低开销            | 增加编排开销、消耗上下文 |

### 洞察 7：模块耦合是一等设计问题

Memory、Skills、Protocols 不是独立的：

- 记忆扩展与 skill 加载竞争上下文预算
- 协议标准化影响 skill 打包方式
- skill 执行产生轨迹成为记忆
- 记忆检索影响协议路由

Harness 必须调解这些耦合。

---

## 未来方向

### 1. 自演化 Harness（Self-Evolving Harness）

未来 Agent 可能不仅使用外部基础设施，还**主动演化**它：

- 自动 skill 发现
- 自动记忆策略优化
- 自适应编排
- 控制流的自我精化
- 从执行轨迹中运行时学习

### 2. 共享 Agent 基础设施

从 Agent 专属脚手架转向**共享基础设施**：

- 记忆存储、skill 库、协议层成为跨 Agent 共享资源
- Agent 专业化并复用公共基础设施，实现集体改进
- 引发所有权、标准化、访问控制、问责、制度治理等问题

### 3. 外部化能力评测

需要开发外部化质量的度量：

- 检索有用性
- skill 复用率
- 协议鲁棒性
- harness 可治理性
- 上下文效率
- 故障恢复
- 整体系统可靠性

### 4. 安全治理

外部化引入新的系统级风险：

- **认知开销**：过多外部模块 → 上下文过载、路由复杂、协调成本
- **安全与完整性**：外部制品可能被投毒、过时、恶意、失对齐（记忆投毒、不安全 skill 组合）
- **治理即基础设施**：治理不能是事后想法，必须内建于权限、协议、可观测性、审批门、审计日志、策略编码

### 5. 扩展外部化前沿

超越 Memory/Skills/Protocols 的更多认知负担：

- **规划与目标管理**：目标分解、计划维护、重规划、优先级管理
- **评估与验证**：正确性检查、验证器、测试 harness、证明制品、验收标准
- **编排逻辑本身**：使控制逻辑可检查、可复用、可适应、可治理
- **多模态外部化**：视觉、音频、具身状态、空间表征、传感器流

### 6. 从数字 Agent 到具身外部化

论文类比数字 Agent 与具身认知：

- 未来架构可能分离"大脑"（高层推理规划）和"小脑"（低层控制执行）
- 具身系统面临相同核心问题：状态持久化、过程复用、受治理交互、运行时约束

---

## 对 qwen-code 的启示

### qwen-code 在外部化框架中的定位

qwen-code 是一个**以编码为中心的 Agent Harness**，在论文的四层框架中已有广泛覆盖：

### 已做的外部化维度

| 外部化维度                  | qwen-code 对应实现                                                         | 覆盖程度  |
| --------------------------- | -------------------------------------------------------------------------- | --------- |
| **Memory — 工作上下文**     | 会话内的文件状态、终端输出、工具调用历史                                   | ✅ 充分   |
| **Memory — 个性化记忆**     | `~/.qwen/memories/` 文件系统（user/feedback/project/reference 四类）       | ✅ 有特色 |
| **Memory — 语义知识**       | AGENTS.md / QWEN.md 项目上下文、RAG 式文件读取                             | ✅ 基本   |
| **Memory — 情景经验**       | 会话内轨迹；但跨会话情景记忆有限                                           | ⚠️ 部分   |
| **Skills — 规约与发现**     | Skill 系统（`/bugfix`、`/feat-dev`、`/review` 等），有名称、描述、触发条件 | ✅ 充分   |
| **Skills — 渐进披露**       | Skill 描述在 system-reminder 中仅展示摘要，调用时才加载完整指令            | ✅ 有     |
| **Skills — 执行绑定**       | Skill 绑定到工具（shell、文件编辑、搜索、Agent 子进程）                    | ✅ 充分   |
| **Protocols — Agent-Tool**  | 工具 schema（JSON Schema 参数定义）、MCP 协议支持                          | ✅ 充分   |
| **Protocols — Agent-User**  | 审批模式（approval mode）、ask_user_question 工具                          | ✅ 基本   |
| **Protocols — Agent-Agent** | 子 Agent 系统（test-engineer、Explore、fork）、背景 Agent 通知             | ✅ 有     |
| **Harness — 控制流**        | 多轮循环、子 Agent 编排、背景/前台模式、worktree 隔离                      | ✅ 充分   |
| **Harness — 沙箱**          | Docker 沙箱、worktree 隔离                                                 | ✅ 有     |
| **Harness — 人类监督**      | 审批门（yolo/auto/manual 模式）、工具调用确认                              | ✅ 充分   |
| **Harness — 可观测性**      | 工具调用日志、Agent 完成通知                                               | ⚠️ 基本   |
| **Harness — 配置与策略**    | settings.json、权限系统、.qwenignore                                       | ✅ 有     |
| **Harness — 上下文预算**    | 文件截断、搜索限制、Agent 上下文继承控制（fork_turns）                     | ✅ 有     |

### 尚未充分外部化的维度

| 维度                     | 现状                                                          | 论文启示                                                  |
| ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------- |
| **跨会话情景记忆**       | 依赖文件系统记忆（`memories/`），但缺少结构化的轨迹存储和检索 | 论文建议将执行轨迹作为可检索的先例，支持反思和 skill 蒸馏 |
| **Skill 蒸馏与自动获取** | Skill 均为人工编写（authored），无从轨迹自动蒸馏 skill 的机制 | 论文的 distilled/discovered 获取模式是重要方向            |
| **Skill 组合与版本管理** | Skill 之间无显式组合机制或版本控制                            | 论文强调组合风险（不安全组合、过时）需要治理              |
| **记忆层级与遗忘**       | 记忆是扁平文件，无分层（热/冷）、无自动整合/遗忘              | 论文的层级记忆架构（提取→整合→遗忘→晋升）可参考           |
| **结构化可观测性**       | 有基本日志，但缺少结构化轨迹、中间状态快照、评估信号          | 论文将可观测性列为 harness 六大设计维度之一               |
| **外部化评测**           | 无系统度量来评估记忆检索有用性、skill 复用率、上下文效率      | 论文指出这是开放研究方向                                  |
| **自演化能力**           | Harness 配置是静态的，不会从执行经验中自动改进                | 论文将自演化 harness 列为首要未来方向                     |

### 架构理解上的启示

1. **qwen-code 的 AGENTS.md 机制**本质上是一种**语义记忆外部化**——将项目惯例、构建命令、代码规范从"模型应该知道"转化为"模型可以读取"。这正好对应论文的核心论点：从 recall 到 recognition。

2. **qwen-code 的 Skill 系统**（`/bugfix`、`/feat-dev`、`/review`）是**过程知识外部化**的实例——将"如何修 bug"、"如何做 feature"的隐性知识编码为显式的、可复用的操作指南。论文会将其归类为 "authored skill with progressive disclosure"。

3. **qwen-code 的子 Agent 架构**（test-engineer、Explore、fork）体现了**协议外部化**——Agent 间的交互不是即兴的，而是有结构化的启动参数、完成通知、上下文继承控制。

4. **论文的"上下文预算管理"维度**直接对应 qwen-code 面临的实际挑战：AGENTS.md + memories + skill 描述 + 工具 schema + 文件内容都在竞争有限的上下文窗口。论文建议的"渐进披露"和"策划快照而非完整历史"是 qwen-code 已在使用的策略。

5. **最大的改进空间**在论文强调的"模块耦合"：qwen-code 的 memory（memories/）、skills（/commands）、protocols（tool schemas）目前是相对独立运作的。论文建议它们应该更紧密地耦合——例如，skill 执行轨迹应自动反馈到 memory，memory 检索应影响 skill 选择，协议事件应触发记忆更新。

---

## 参考链接

- 综述论文：https://arxiv.org/abs/2604.08224
- 论文 HTML 全文：https://arxiv.org/html/2604.08224
- LatentSkill：https://arxiv.org/abs/2606.06087
- Skills on the Fly：https://arxiv.org/abs/2605.16986
- From Soliloquy to Agora：https://arxiv.org/abs/2604.25847
- 相关综述 "Code as Agent Harness"（不同团队）：https://arxiv.org/abs/2605.18747
- 相关论文 "Self-Harness: Harnesses That Improve Themselves"：https://arxiv.org/abs/2606.09498
- 相关论文 "HarnessForge: Joint Harness and Policy Evolution"：https://arxiv.org/abs/2606.01779
