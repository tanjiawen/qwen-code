# Bayesian-Agent — 技能进化的贝叶斯后验信念

## 基本信息

- **作者/团队**：吴晓均（Xiaojun Wu）等，IDEA 研究院 / 港科大广州联培博士生，DataArcTech 团队
- **GitHub**：https://github.com/DataArcTech/Bayesian-Agent （75 stars，Python，v0.5）
- **论文**：_Bayesian-Agent: Posterior-Guided Skill Evolution for LLM Agent Harnesses_，arXiv:2606.08348
  - 作者列表：Xiaojun Wu, Cehao Yang, Honghao Liu, Xueyuan Lin, Wenjie Zhang, Zhichao Shi, Xuhui Jiang, Chengjin Xu, Jia Li, Jian Guo
- **相关项目**：
  - [Fengshenbang-LM](https://github.com/IDEA-CCNL/Fengshenbang-LM)（封神榜大模型，IDEA-CCNL 开源中文大模型生态，吴晓均为论文作者之一）
  - [Think-on-Graph](https://github.com/DataArcTech/ToG)（ICLR 2024，知识图谱上的 LLM 推理）
  - [Think-on-Graph 3.0](https://github.com/DataArcTech/ToG-3)（异构图上的多智能体双演化上下文检索 RAG）
  - [Golden-Touchstone](https://github.com/DataArcTech/Golden-Touchstone)（EMNLP 2025，中英双语金融 LLM 基准）
  - [SQL-R1](https://github.com/DataArcTech/SQL-R1)（NeurIPS 2025，强化学习训练 NL2SQL）
  - [ChartMoE](https://github.com/DataArcTech/ChartMoE)（ICLR 2025 Oral，图表理解混合专家）
  - Touchstone-GPT：未能在 GitHub 上找到对应仓库（可能为内部项目或已更名）

## 核心问题

### 传统 Skill Evolution 的根本缺陷

当前 LLM Agent 的技能演化（Skill Evolution）普遍采用**频率学派式的无状态修补**：

1. **成功率统计作为决策依据**：跑 N 次任务，统计某条 Skill/SOP 的成功率 `successes / total`，据此决定保留或丢弃。
2. **启发式反思（heuristic reflection）**：让模型自己"反思"哪里做错了，然后堆积 prompt 补丁。
3. **无校准的 prompt 累积（uncalibrated prompt accumulation）**：每次失败就加一条规则，规则越积越多，互相矛盾也不清理。

### 为什么成功率统计不够？

论文给出了明确的对比。频率学派估计量：

$$\hat{p}_{k,t}(z) = \frac{\sum_{e_i \in D_{k,t}} \mathbf{1}[y_i=1,\, g(e_i)=z]}{\sum_{e_i \in D_{k,t}} \mathbf{1}[g(e_i)=z]}$$

存在三个结构性问题：

| 问题                   | 说明                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **稀疏性**             | Agent 轨迹昂贵（每次执行消耗大量 token/时间），观测样本极少。3 次执行中 2 次成功 → 66%？还是 1 次成功 → 33%？频率估计在小样本下剧烈波动。 |
| **非 i.i.d.**          | 不同任务上下文（context）、不同失败模式（failure mode）、不同 token 开销的轨迹被混在一起统计，违反了频率估计的独立性假设。                |
| **无法区分噪声与信号** | 一次失败可能是环境抖动（API 超时），也可能是可复用的失败模式（输出格式错误）。频率统计把两者等同对待。                                    |

**核心洞察**：技能演化应该被视为**后验引导的 harness 优化（posterior-guided harness optimization）**，而不是无校准的 prompt 堆积。

## 贝叶斯方案设计

### 核心思想：Skill 即假设

Bayesian-Agent 把每条可复用的 Skill/SOP 视为一个**假设（hypothesis）** $h_k$：

> "在给定 prompt、上下文、harness 环境下，冻结模型使用这条 Skill 能否成功？"

形式化为：

$$p_{k,t} = P(y_t = 1 \mid M_\theta, C_t, h_k, z_t)$$

其中：

- $M_\theta$：冻结的基座模型（不改权重）
- $C_t = (P_t, R_t, A_t, V_t)$：推理环境（prompt/技能文本、检索/记忆上下文、工具/动作接口、验证器/反馈通道）
- $z_t = g(e_t)$：从验证轨迹提取的离散特征向量
- $y_t \in \{0, 1\}$：由**外部验证器**（benchmark grader）判定的二元结果，不是模型自评

### 先验设定

采用 **Laplace 平滑**（$\lambda = 1$）和 **均匀 Beta 先验**（$\alpha_0 = \beta_0 = 1$）：

- 类别先验：$P(\text{label}) = \frac{N_{\text{label}} + 1}{N_{\text{total}} + 2}$
- Beta-Bernoulli 先验：$p_k \sim \text{Beta}(1, 1)$（即均匀分布，对成功/失败无偏好）

**设计意图**：在观测极少时提供保守平滑，避免零计数导致的过度自信。

### 后验更新：特征条件分类贝叶斯

默认后端是 **feature-conditioned categorical Bayesian evidence model**（代码中称 `categorical_bayes`，旧名 `naive_bayes`）。

**证据特征向量**（5 个固定分类特征 + 可选元数据）：

| 特征             | 含义                                   |
| ---------------- | -------------------------------------- |
| `context`        | 任务族 / benchmark / harness 上下文    |
| `failure_mode`   | 验证器导出的可复用错误模式             |
| `token_bucket`   | token 消耗分桶（便宜成功 vs 昂贵搜索） |
| `turn_bucket`    | 交互轮次分桶（恢复循环 / 交互复杂度）  |
| `latency_bucket` | 延迟分桶（慢工具 / 慢 API）            |
| `metadata.*`     | harness 特定的短标量诊断（≤80 字符）   |

**更新公式**（Naive Bayes 条件独立假设）：

1. 平滑类别先验：

$$\pi_{k,t}(\ell) = \frac{N_{k,\ell} + \lambda}{\sum_{\ell'} N_{k,\ell'} + \lambda |\mathcal{Y}|}$$

2. 平滑特征似然：

$$\theta_{k,j,t}^{(\ell)}(v) = \frac{N_{k,j,\ell,v} + \lambda}{\sum_{v'} N_{k,j,\ell,v'} + \lambda |\mathcal{V}_{k,j,t} \cup \{v\}|}$$

3. 因式化似然得分（log 空间计算）：

$$\tilde{p}_{k,t}(\ell \mid z) = \pi_{k,t}(\ell) \prod_{j=1}^{m} \theta_{k,j,t}^{(\ell)}(z_j)$$

4. 归一化后验：

$$s_{k,t}(z) = \frac{\tilde{p}_{k,t}(1 \mid z)}{\tilde{p}_{k,t}(0 \mid z) + \tilde{p}_{k,t}(1 \mid z)}$$

同时保留 **Beta-Bernoulli 共轭后验**用于审计和保守检查：

$$\alpha_{k,t} = 1 + \sum \mathbf{1}[y_i = 1], \quad \beta_{k,t} = 1 + \sum \mathbf{1}[y_i = 0]$$

### 四种操作 + explore 的决策逻辑

策略是**有序规则链**（ordered policy），按优先级从高到低评估，返回第一个匹配的动作：

$$\pi(B_k) = \begin{cases} \text{explore}, & |D_k| = 0 \\ \text{retire}, & \beta_k \ge 4 \;\wedge\; s_k < 0.45 \\ \text{patch}, & \max_r F_k(r) \ge 2 \\ \text{split}, & |\mathcal{C}_k| \ge 3 \;\wedge\; |D_k| \ge 4 \\ \text{compress}, & |D_k| \ge 3 \;\wedge\; s_k \ge 0.72 \\ \text{explore}, & \text{otherwise} \end{cases}$$

| 操作         | 触发条件                          | 语义                                  | 置信度                             |
| ------------ | --------------------------------- | ------------------------------------- | ---------------------------------- |
| **explore**  | 无观测 / 后验不确定               | 证据不足，继续收集，不做改写          | 0.1 / 0.35                         |
| **retire**   | $\beta \ge 4$ 且 $p < 0.45$       | 失败证据压倒性，移除有害 Skill        | $\min(0.95, \beta/(\alpha+\beta))$ |
| **patch**    | 同一失败模式出现 $\ge 2$ 次       | 将重复失败转化为可执行的修复补丁      | 0.75                               |
| **split**    | $\ge 3$ 个上下文且 $\ge 4$ 次观测 | 一条 SOP 覆盖了不兼容的任务族，需拆分 | 0.65                               |
| **compress** | $\ge 3$ 次观测且 $p \ge 0.72$     | 成功证据稳定，蒸馏为更短更省的指令    | $p$                                |

**关键防过拟合机制**：单次失败只记录为审计证据，**不会**触发 patch——必须同一失败模式出现至少 2 次才激活补丁。

### 模型侧 vs 审计侧的分离

- **模型看到的**：可执行的 guardrails 和 failure-mode patches（自然语言指令）
- **人类审计看到的**：后验数值、Beta 参数、失败模式计数、token/延迟统计

模型永远看不到原始概率数字。

## 关键源码解读

### 信念状态数据结构（`belief.py` → `SkillBelief`）

```python
@dataclass
class SkillBelief:
    skill_id: str                          # Skill 标识
    algorithm: str = "categorical_bayes"   # 后端算法
    alpha: float = 1.0                     # Beta-Bernoulli 成功计数
    beta: float = 1.0                      # Beta-Bernoulli 失败计数
    categorical_bayes: CategoricalBayesState  # 分类贝叶斯模型状态
    contexts: Dict[str, int] = {}          # 按上下文的观测计数
    failure_modes: Dict[str, int] = {}     # 失败模式计数
    evidence: List[Dict] = []              # 证据事件（上限 100 条）
    observations: int = 0                  # 总观测数
    mean_tokens: float = 0.0               # token 运行均值
    mean_input_tokens: float = 0.0
    mean_output_tokens: float = 0.0
    mean_elapsed_seconds: float = 0.0      # 延迟运行均值
    last_updated: str = ""                 # 时间戳
```

### 证据数据结构（`evidence.py` → `TrajectoryEvidence`）

```python
@dataclass
class TrajectoryEvidence:
    task_id: str           # 任务实例 ID
    skill_id: str          # 使用的 Skill ID
    context: str           # benchmark / 任务上下文
    outcome: str           # "success" / "failure"（外部验证器判定）
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    turns: int = 0
    elapsed_seconds: float = 0.0
    failure_mode: str = "" # 验证器导出的失败模式
    summary: str = ""
    metadata: Dict = {}    # 短标量元数据
    created_at: str = ""
```

### 后验更新实现（`belief.py` → `SkillBelief.update`）

```python
def update(self, event: TrajectoryEvidence) -> "SkillBelief":
    outcome = event.outcome.strip().lower()
    # 1. Beta-Bernoulli 计数更新
    if outcome == "success":
        self.alpha += 1.0
    elif outcome in {"failure", "failed", "error"}:
        self.beta += 1.0
    # 2. 分类贝叶斯特征计数更新（委托）
    if is_categorical_bayes(self.algorithm):
        self.categorical_bayes.update(event)
    # 3. 上下文 / 失败模式计数
    self.contexts[context] = self.contexts.get(context, 0) + 1
    if event.failure_mode:
        self.failure_modes[event.failure_mode] = ...
    # 4. 运行均值更新（Welford 风格）
    self.mean_tokens += (event.total_tokens - self.mean_tokens) / n
    # 5. 证据存储（滑动窗口，上限 100）
    self.evidence.append(event.to_dict())
    self.evidence = self.evidence[-MAX_EVIDENCE:]
```

### 分类贝叶斯核心（`categorical_bayes.py` → `CategoricalBayesState`）

```python
@dataclass
class CategoricalBayesState:
    alpha: float = 1.0          # Laplace 平滑参数
    class_counts: Dict[str, int]       # {"success": N, "failure": N}
    feature_counts: Dict[str, Dict[str, Dict[str, int]]]  # [label][feature][value]
    feature_vocab: Dict[str, Dict[str, int]]              # [feature][value] → 全局计数
    observations: int = 0

    def predict_proba(self, features=None) -> Dict[str, float]:
        logs = {}
        for label in ["success", "failure"]:
            logs[label] = math.log(self.class_probability(label))
            for name, value in sorted(features.items()):
                logs[label] += math.log(
                    self.feature_probability(name, value, label))
        # log-sum-exp 归一化
        max_log = max(logs.values())
        scores = {l: math.exp(v - max_log) for l, v in logs.items()}
        total = sum(scores.values())
        return {l: s / total for l, s in scores.items()}
```

### 策略决策（`policy.py` → `RewritePolicy.decide`）

```python
def decide(self, belief: SkillBelief) -> RewriteDecision:
    p = belief.success_probability
    if belief.observations == 0:
        return RewriteDecision("explore", "no verified evidence yet", 0.1)
    if belief.beta >= 4 and p < 0.45:
        return RewriteDecision("retire", "posterior failures dominate", ...)
    if belief.failure_modes and max(belief.failure_modes.values()) >= 2:
        return RewriteDecision("patch", "failures cluster around a recurring mode", 0.75)
    if len(belief.contexts) >= 3 and belief.observations >= 4:
        return RewriteDecision("split", "evidence spans multiple contexts", 0.65)
    if belief.observations >= 3 and p >= 0.72:
        return RewriteDecision("compress", "success evidence is stable", p)
    return RewriteDecision("explore", "posterior remains uncertain", 0.35)
```

### 与传统成功率统计的代码对比

| 维度     | 频率学派                          | Bayesian-Agent                                                                    |
| -------- | --------------------------------- | --------------------------------------------------------------------------------- |
| 信念表示 | 单个浮点数 `successes / total`    | `SkillBelief` 对象：Beta 参数 + 分类贝叶斯状态 + 失败模式 + 上下文分布 + 成本统计 |
| 更新     | `count += 1`                      | 多维证据特征提取 → 分类计数更新 → Beta 计数更新 → 运行均值更新                    |
| 决策     | `if rate < threshold: delete`     | 有序策略链：explore → retire → patch → split → compress                           |
| 小样本   | 剧烈波动（1/1 = 100%, 1/2 = 50%） | Laplace 平滑 + Beta 先验保守估计                                                  |
| 失败处理 | 统一计入失败                      | 区分失败模式，同一模式 ≥2 次才触发 patch                                          |
| 上下文   | 忽略                              | 按 context 分桶，≥3 个上下文触发 split                                            |
| 成本     | 不考虑                            | token/延迟/轮次作为证据特征参与后验                                               |

## 实验结果

使用 `deepseek-v4-flash`，增量修复模式：

| Benchmark           | 修复前 | 修复后 | 提升  |
| ------------------- | ------ | ------ | ----- |
| SOP-Bench           | 80%    | 95%    | +15pp |
| Lifelong AgentBench | 90%    | 100%   | +10pp |
| RealFin-Bench       | 45%    | 65%    | +20pp |

支持的后端：Bayesian-Agent native、GenericAgent、mini-swe-agent、Claude Code。

论文明确报告了正面、负面、饱和和案例研究四类结果，未隐瞒负面案例。

## 与 qwen-code SKILL.md 的对比

### 现状：硬编码规则

qwen-code 的 SKILL.md 是纯文本规则文件，例如：

```markdown
## Constraints

- 改签名前必须 grep 所有调用点
- 测试必须从包目录运行，不能从根目录
- 不要创建文档文件除非明确要求
```

这些规则是**二值的**（存在/不存在）、**无状态的**（不记录执行效果）、**不可演化的**（只能人工编辑）。

### 具体场景分析

> 规则："改签名前必须 grep 所有调用点"
> 3 次执行中 2 次有效（避免了遗漏调用点），1 次多余（改动是纯新增，无调用点）

**SKILL.md 的处理**：规则原封不动。下次继续无条件 grep，即使上下文已经表明这是一次纯新增。

**Bayesian-Agent 的处理**：

1. **证据记录**：3 条 `TrajectoryEvidence`，其中 2 条 `outcome=success, failure_mode=""`，1 条 `outcome=success, failure_mode="unnecessary_grep"`（或类似标注）
2. **后验更新**：
   - Beta 状态：$\alpha = 1 + 3 = 4$，$\beta = 1 + 0 = 1$（全部成功，无失败）
   - 分类贝叶斯：`context=pure_addition` 特征下，`failure_mode=unnecessary_grep` 的似然上升
3. **策略决策**：$|D_k| = 3 \ge 3$，$s_k = 4/5 = 0.80 \ge 0.72$ → **compress**
4. **compress 结果**：将规则蒸馏为条件化版本：
   > "改签名前 grep 所有调用点（纯新增且无现有调用点时可跳过）"

如果失败模式更严重（例如 2 次 grep 导致超时），则 $\max_r F_k(r) = 2 \ge 2$ → **patch**，生成修复补丁而非简单保留。

### 关键差异总结

| 维度         | SKILL.md                 | Bayesian-Agent                                           |
| ------------ | ------------------------ | -------------------------------------------------------- |
| 规则表示     | 自然语言硬规则           | 带后验信念的假设                                         |
| 更新机制     | 人工编辑                 | 验证轨迹自动更新                                         |
| 上下文敏感   | 无                       | 按 context/failure_mode/token/turns/latency 条件化       |
| 失败处理     | 无记忆                   | 失败模式聚类，≥2 次触发 patch                            |
| 规则生命周期 | 只增不减（除非人工清理） | explore → patch → split → compress → retire 完整生命周期 |
| 防过拟合     | 无                       | 单次失败不改写，Laplace 平滑，保守策略链                 |

## 对 qwen-code 的启示

### 能否将 SKILL.md constraints 升级为带置信度的软规则？

**可行方向**：

1. **信念文件**：在 `.qwen/skills/` 下为每条 constraint 维护一个 JSON 信念状态（类似 `bayesian_skill_beliefs.json`），记录 alpha/beta、失败模式、上下文分布。
2. **证据采集**：每次 skill 执行后，由验证器（测试通过/失败、用户反馈）生成 `TrajectoryEvidence`，更新信念文件。
3. **条件化渲染**：`SkillContextBuilder` 根据当前任务上下文，只注入后验支持的 guardrails，而非全量规则。
4. **生命周期管理**：对 `success_probability < 0.45` 且 $\beta \ge 4$ 的规则自动标记为 `retired`，提示用户清理。

### 实现成本评估

| 层级                              | 工作量 | 说明                                                                                                                                                                                                  |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **最小可行**：Beta-Bernoulli 信念 | 低     | 每条规则维护 `(alpha, beta)` 两个数字，成功 +1 / 失败 +1。决策：$p < 0.45$ 且 $\beta \ge 4$ → 标记为可疑。约 100 行代码。                                                                             |
| **中等**：分类贝叶斯 + 失败模式   | 中     | 引入 `failure_mode` 和 `context` 分桶，实现 patch/split/compress 策略。需要验证器配合标注失败模式。约 500 行。                                                                                        |
| **完整**：跨 harness 演化层       | 高     | 完整的 `BayesianSkillRegistry` + `SkillContextBuilder` + 适配器。Bayesian-Agent 本身是标准库实现（无外部依赖），可以直接作为 Python 库集成，但 qwen-code 是 TypeScript 栈，需要移植或通过子进程调用。 |

### 关键约束

- **验证器是瓶颈**：Bayesian-Agent 的后验更新依赖**外部验证器**判定成功/失败，而非模型自评。qwen-code 的 skill 执行结果目前缺乏结构化的验证通道。
- **证据稀疏**：qwen-code 的 skill 执行频率远低于 benchmark 批量跑分，可能需要更长的积累周期。
- **标准库实现**：Bayesian-Agent 核心无外部依赖（纯 Python 标准库），移植到 TypeScript 的成本可控。

### 建议的渐进路径

1. **Phase 0**（零成本）：在 SKILL.md 中为每条 constraint 添加 `<!-- confidence: high/medium/low, evidence: N runs -->` 注释，人工维护。
2. **Phase 1**（低成本）：实现 Beta-Bernoulli 信念追踪，在 skill 执行后自动更新 `(alpha, beta)`，在 `/review` 时展示低置信度规则。
3. **Phase 2**（中等成本）：引入失败模式分类和上下文条件化，实现 patch/retire 自动化。
4. **Phase 3**（高成本）：完整的分类贝叶斯后端 + 跨 session 信念持久化 + 条件化 skill 渲染。

## 参考链接

- Bayesian-Agent GitHub：https://github.com/DataArcTech/Bayesian-Agent
- 论文 arXiv：https://arxiv.org/abs/2606.08348
- 论文 HTML 全文：https://arxiv.org/html/2606.08348
- Fengshenbang-LM：https://github.com/IDEA-CCNL/Fengshenbang-LM
- Think-on-Graph (ICLR 2024)：https://github.com/DataArcTech/ToG
- Think-on-Graph 3.0：https://github.com/DataArcTech/ToG-3
- Golden-Touchstone (EMNLP 2025)：https://github.com/DataArcTech/Golden-Touchstone
- SQL-R1 (NeurIPS 2025)：https://github.com/DataArcTech/SQL-R1
- ChartMoE (ICLR 2025 Oral)：https://github.com/DataArcTech/ChartMoE
- DataArcTech 组织：https://github.com/DataArcTech
