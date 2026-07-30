# OpenKruise Agents — Agent 沙箱运维基础设施

## 基本信息

| 项目              | 详情                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| **项目名称**      | OpenKruise Agents（Kruise Agents）                                        |
| **GitHub**        | https://github.com/openkruise/agents                                      |
| **Stars / Forks** | ~252 stars / ~111 forks（2026-07 数据）                                   |
| **API 仓库**      | https://github.com/openkruise/agents-api                                  |
| **流量安全组件**  | https://github.com/openkruise/agentio（基于 Istio 的 Agent 流量安全控制） |
| **API Group**     | `agents.kruise.io/v1alpha1`                                               |
| **母项目**        | OpenKruise（CNCF 孵化项目，Kubernetes 大规模应用管理）                    |
| **核心维护者**    | 张振（阿里云资深工程师、博士）                                            |
| **已发布版本**    | v0.1.0 → v0.2.0 → v0.3.0                                                  |
| **官方文档**      | https://openkruise.io/kruiseagents/introduction                           |
| **兼容标准**      | E2B API / SDK、Kubernetes SIG Agent-Sandbox                               |

### 张振简介

张振是阿里云资深工程师、博士，曾主导阿里巴巴集团云原生迁移工程和阿里云 Serverless 平台建设。目前联合负责阿里云智能体沙箱平台技术研发。他是 OpenKruise Agents 项目核心维护者，多次 KubeCon 演讲者，LFX 和 GSoC 导师。

他在 2026 Agent Harness 研讨会上的报告主题是 **"从跑得起管得住：使用 OpenKruise Agents 破解 OpenClaw 日常运维难题"**，聚焦 AI Agent 沙箱的 Day-2 运维挑战。

> **注：** 在公开的 KubeCon 日程（KubeCon NA 2025、KubeCon China 2025）中未能检索到张振以 OpenKruise Agents 为主题的演讲条目。他的 KubeCon 演讲可能集中在更早期的 OpenKruise 核心项目或其他云原生主题上。

---

## 核心问题

### Day-2 运维挑战

AI Agent（如 OpenClaw、Claude Code、Code Interpreter）在 Kubernetes 上运行时，面临的不是"能不能跑起来"的问题，而是"能不能管得住"的问题。张振的报告标题精确概括了这一痛点。具体挑战包括：

**1. 沙箱故障与生命周期管理**

- Agent 沙箱是长时运行的有状态环境（包含用户工作区、文件系统、内存状态），不是无状态微服务
- 沙箱崩溃后需要恢复用户数据，不能简单重启
- 沙箱有复杂的状态机：Pending → Running → Paused → Resuming → Upgrading → Recycling → Terminating
- 需要管理沙箱的优先级、回收计数、关闭时间、暂停时间等生命周期参数

**2. 成本控制**

- Agent 沙箱可能长时间空闲（用户离开后沙箱仍在运行）
- GPU 沙箱成本极高，空闲即浪费
- 需要自动休眠（pause）和检查点（checkpoint）机制来节约资源
- 需要资源池化（warm pool）来加速沙箱创建，避免冷启动

**3. 版本兼容性**

- Agent 工具链快速迭代，沙箱镜像需要频繁升级
- 升级不能丢失用户数据（文件系统可写层）
- 需要支持原地更新（in-place update）和检查点恢复（checkpoint-restore）两种升级策略
- 批量升级需要滚动策略（maxUnavailable）和生命周期钩子（preUpgrade/postUpgrade）

**4. 安全隔离**

- Agent 执行任意代码，是不可信工作负载
- 需要 L3/L4 网络隔离（限制出入站流量）
- 需要 L7 HTTP 策略（按域名、路径、方法控制出站请求）
- API Key 不能暴露给沙箱内的 Agent，需要在网关层注入
- MCP 工具调用需要访问控制（白名单/黑名单）

**5. 多租户与会话管理**

- 多个用户共享沙箱集群，需要身份和会话隔离
- 流量路由需要按用户/会话分发到正确的沙箱
- 需要减少对 Kubernetes Service 的依赖（Service 不适合大规模动态沙箱场景）

---

## 架构设计

### 整体定位

OpenKruise Agents 是 OpenKruise（CNCF 孵化项目）的子项目，专门为 AI Agent 工作负载设计。它在 Kubernetes 之上构建了一套完整的沙箱生命周期管理层，核心理念是：

> **将 AI Agent 沙箱视为一种 Kubernetes 原生工作负载类型，用声明式 API 管理其全生命周期。**

### 组件架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户 / Agent 框架                      │
│         (E2B SDK / Kubernetes SDK / okactl CLI)          │
└────────────┬──────────────────────────┬──────────────────┘
             │ E2B API                  │ K8s CRD API
             ▼                          ▼
┌────────────────────┐    ┌────────────────────────────────┐
│   sandbox-manager  │    │     kruise-agents-controller    │
│  (E2B 兼容 API 层)  │    │  (Kubernetes Operator 控制面)   │
│  - 沙箱创建/删除     │    │  - SandboxSet Controller        │
│  - 模板管理         │    │  - Sandbox Controller           │
│  - API Key 管理     │    │  - SandboxClaim Controller      │
│  - 团队/命名空间隔离  │    │  - Checkpoint Controller        │
└────────┬───────────┘    │  - Commit Controller            │
         │                │  - SandboxUpdateOps Controller  │
         │                │  - SecurityProfile Controller   │
         │                │  - TrafficPolicy Controller     │
         │                └──────────┬─────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   sandbox-gateway                        │
│  (数据面入口网关，独立于 manager)                          │
│  - 路径路由: /kruise/{ns}--{sandbox}/{port}/{path}       │
│  - 会话保持                                             │
│  - TLS 终止                                             │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│              traffic-extension (Envoy ext-proc)           │
│  - L7 HTTP 出站策略执行                                   │
│  - SecurityProfile 规则匹配                               │
│  - API Key / Token 注入                                  │
│  - 审计日志                                              │
│  - MCP 工具访问控制                                       │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                    agentio (可选)                         │
│  (基于 Istio 的零信任流量安全控制)                         │
│  - 出入站流量治理                                         │
│  - 分布式追踪                                            │
│  - 访问日志                                              │
│  - 出站网关                                              │
└─────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                   Sandbox Pod 集群                        │
│  每个 Pod 可包含:                                        │
│  - 用户容器（Agent 运行环境）                              │
│  - agent-runtime sidecar（E2B envd 兼容）                │
│  - traffic-proxy sidecar（流量代理）                      │
│  - CSI mount sidecar（动态存储挂载）                      │
└─────────────────────────────────────────────────────────┘
```

### 与 OpenKruise 核心的关系

OpenKruise 核心项目提供了高级工作负载管理基础（CloneSet、Advanced StatefulSet、原地更新等），OpenKruise Agents 在此基础上构建了面向 Agent 场景的专用 CRD 和控制器。Agents 的原地更新能力复用了 OpenKruise 核心的 `apps.kruise.io/inplace-update-state` 注解机制。

---

## 关键能力

### 1. 资源池化与快速供给（Warm Pool）

**问题：** 冷启动一个沙箱 Pod 需要数十秒（拉镜像、调度、初始化），对交互式 Agent 不可接受。

**方案：** `SandboxSet` 维护一个预热沙箱池。

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: SandboxSet
metadata:
  name: code-interpreter-pool
spec:
  replicas: 10 # 保持 10 个空闲沙箱
  template:
    spec:
      containers:
        - name: sandbox
          image: code-interpreter:latest
  scaleStrategy:
    maxUnavailable: 2 # 扩容时最多 2 个不可用
  updateStrategy:
    maxUnavailable: 20% # 滚动更新时最多 20% 不可用
```

用户通过 `SandboxClaim` 从池中"认领"沙箱：

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: SandboxClaim
metadata:
  name: user-session-123
spec:
  templateName: code-interpreter-pool # 从哪个池认领
  replicas: 1
  shutdownTime: '2026-07-30T18:00:00Z' # 自动关闭时间
  claimTimeout: 1m # 认领超时
  createOnNoStock: true # 池子空了就新建
  envVars: # 注入环境变量
    USER_ID: '12345'
  inplaceUpdate: # 认领时原地更新
    image: code-interpreter:v2
    resources:
      requests:
        cpu: '4'
```

认领流程：

1. 控制器从 SandboxSet 池中找到可用沙箱
2. 打上用户标签、注入环境变量
3. 可选执行原地更新（换镜像、调 CPU）
4. 可选动态挂载存储卷
5. 等待沙箱就绪（默认 30s 超时）
6. SandboxClaim 进入 Completed 状态，60 分钟后自动清理（沙箱不受影响）

### 2. 自动休眠与检查点（成本节约）

**问题：** 用户离开后沙箱空转，GPU 沙箱每小时成本数美元。

**方案：** Sandbox 支持 `pauseTime`（自动暂停时间）和 `paused`（手动暂停）字段。

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: Sandbox
spec:
  pauseTime: '2026-07-30T12:00:00Z' # 到此时间自动暂停
  paused: false
  persistentContents: # 恢复时保留什么
    - ip # 保留 IP 地址
    - memory # 保留内存状态
    - filesystem # 保留文件系统
```

暂停流程（从 Sandbox 状态机可见）：

1. `Pausing` → 开始暂停流程
2. `CheckpointCreating` → 创建检查点（如果 persistentContents 包含 memory/filesystem）
3. `CheckpointSucceeded` → 检查点创建成功
4. `DeletePod` → 删除 Pod（释放计算资源）
5. `PauseSucceed` → 暂停完成，沙箱进入 `Paused` 阶段

恢复流程：

1. 设置 `paused: false`
2. `CreatePod` → 从检查点恢复创建 Pod
3. `ResumePod` → 恢复 Pod 运行
4. 沙箱回到 `Running` 阶段

`Checkpoint` CRD 管理检查点的生命周期：

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: Checkpoint
spec:
  sandboxName: my-sandbox
  podName: my-sandbox-pod
  keepRunning: true # 检查点后是否继续运行
  persistentContents:
    - memory
    - filesystem
  ttlAfterFinished: 30d # 检查点保留 30 天
status:
  phase: Succeeded
  checkpointId: cp-abc123
  podTemplateDelta: ... # Pod 模板差异（Strategic Merge Patch）
```

`podTemplateDelta` 是一个关键设计：它记录了暂停时 Pod 与基础模板之间的差异（如 sidecar 注入、动态挂载等），恢复时用这个 delta 重建完全一致的 Pod。

### 3. 网络隔离

网络隔离分为两层：

**L3/L4 层：TrafficPolicy / GlobalTrafficPolicy**

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: TrafficPolicy
metadata:
  name: sandbox-egress-policy
spec:
  priority: 1000
  selector:
    matchLabels:
      app: agent-sandbox
  egress:
    rules:
      - action: allow
        to:
          - fqdn: 'api.openai.com'
          - fqdn: '*.github.com'
        ports:
          - protocol: TCP
            port: 443
      - action: reject # 默认拒绝所有其他出站
```

- `TrafficPolicy` 是命名空间级别的
- `GlobalTrafficPolicy` 是集群级别的（平台管理员设置全局护栏）
- 按 `priority` 排序评估，第一个匹配的 allow/reject 生效
- 如果 Pod 被任何策略选中，该方向未匹配的流量默认拒绝
- Peer 支持四种类型：CIDR、FQDN（DNS 解析 + TTL 刷新）、Kubernetes Service、Workload（Pod 标签选择器）
- 与 Kubernetes 原生 NetworkPolicy 是叠加关系，不替代

**L7 层：SecurityProfile**

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: SecurityProfile
metadata:
  name: agent-security
spec:
  selector:
    matchLabels:
      app: agent-sandbox
  rules:
    - match:
        - domains: ['*.openai.com']
          paths:
            - type: Prefix
              value: /v1/
      actions:
        tokenTransformation:
          type: ApiKey
          credentialRef:
            kind: Secret
            name: openai-api-key
          apiKey:
            targetHeader: Authorization
            valueTemplate: 'Bearer {{.ApiKey}}'
    - match:
        - domains: ['*'] # 其他所有域名
      actions:
        block:
          statusCode: 403
          body: 'Access denied by security policy'
```

SecurityProfile 由 `traffic-extension`（Envoy ext-proc 服务）执行：

- Envoy 拦截沙箱的出站 HTTP 请求
- 通过 gRPC 调用 traffic-extension
- traffic-extension 从 filter_state 提取 Pod 身份信息
- 匹配 SecurityProfile 规则链
- 执行动作（注入 Token、阻断、放行、审计等）

规则评估使用 **Default Continue** 语义：

- 所有匹配的规则按顺序执行
- 非终结动作（tokenTransformation、rateLimit、audit 等）叠加执行
- 终结动作（Block、Bypass、Forwarding）停止后续评估
- 同一规则内非终结动作的固定执行顺序：securityCheck → identityInjection → tokenTransformation → rateLimit → mirroring

### 4. API Key 注入

**核心设计原则：API Key 永远不进入沙箱。**

沙箱内的 Agent 发出请求时使用占位符（如 `Authorization: Bearer __OPENAI__`），traffic-extension 在网关层替换为真实 Key。

两种注入模式：

| 模式        | 说明                                  | 适用场景                     |
| ----------- | ------------------------------------- | ---------------------------- |
| `ApiKey`    | 替换请求头的值，支持 Go template      | OpenAI、Anthropic 等标准 API |
| `AliyunSTS` | 替换阿里云 AK/SK/STS 三元组并重算签名 | 阿里云 SDK 请求              |

凭证来源：

- `Secret`：同命名空间的 Kubernetes Secret（ApiKey 模式读 `apiKey` 字段，AliyunSTS 模式读 `accessKeyId`/`accessKeySecret`/`securityToken`）
- `CredentialProvider`：运行时从外部凭证提供者获取（如 agent-identity 服务）

失败策略（`failStrategy`）：

- `Block`（默认）：凭证获取失败则拒绝请求
- `Allow`：放行请求
- `Ignore`：静默跳过该动作

### 5. 零数据丢失平滑升级

支持两种升级策略：

**Recreate（重建）：**

1. 执行 `preUpgrade` 钩子（如备份工作区数据）
2. 删除旧 Pod
3. 创建新 Pod（使用新模板）
4. 执行 `postUpgrade` 钩子（如恢复工作区数据）

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: Sandbox
spec:
  upgradePolicy:
    type: Recreate
  lifecycle:
    preUpgrade:
      exec:
        command:
          ['/bin/bash', '-c', 'tar czf /backup/workspace.tar.gz /workspace']
      timeoutSeconds: 120
    postUpgrade:
      exec:
        command: ['/bin/bash', '-c', 'tar xzf /backup/workspace.tar.gz -C /']
      timeoutSeconds: 120
```

**CheckpointRestore（检查点恢复）：**

1. 对当前 Pod 创建检查点（保存可写层数据）
2. 删除旧 Pod
3. 从检查点恢复创建新 Pod
4. 镜像未变化的容器保留其可写层

**批量升级：SandboxUpdateOps**

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: SandboxUpdateOps
metadata:
  name: upgrade-all-sandboxes
spec:
  selector:
    matchLabels:
      app: agent-sandbox
  updateStrategy:
    type: CheckpointRestore
    maxUnavailable: 10% # 最多 10% 同时升级
  patch: |
    {"spec":{"containers":[{"name":"sandbox","image":"agent:v2"}]}}
  lifecycle:
    preUpgrade:
      exec:
        command: ['/bin/bash', '-c', 'save-workspace']
```

状态追踪：Pending → Updating → Completed / Failed，实时报告 updatedReplicas / updatingReplicas / failedReplicas。

**原地更新（In-place Update）：**

复用 OpenKruise 核心的原地更新能力，仅更新容器镜像或资源（CPU），不重建 Pod：

- 通过 `pod-template-hash` 标签追踪版本一致性
- 只有镜像或资源变化才触发原地更新
- 其他字段变化会报错："In-place upgrades only support modifying the image or resources."
- 更新期间受影响的容器终止并以新配置重启

### 6. 数据导出（Commit）

`Commit` CRD 将运行中沙箱的文件系统变更提交为新的容器镜像并推送到镜像仓库：

```yaml
apiVersion: agents.kruise.io/v1alpha1
kind: Commit
metadata:
  name: save-workspace
spec:
  podName: my-sandbox-pod
  containerName: sandbox
  image: registry.example.com/workspaces/user-123:latest
  registryAuth:
    secrets:
      - registry-credentials
  timeoutSeconds: 600
  ttl: 24h # Commit 资源 24 小时后自动清理
```

实现机制：

1. 控制器在目标 Pod 所在节点创建一个 Kubernetes Job
2. Job 执行 `nerdctl commit <containerID> <image>` 提交容器可写层
3. Job 执行 `nerdctl push <image>` 推送到镜像仓库
4. 可选的磁盘空间检查（根据可写层大小估算）
5. 凭证解析三级回退：显式 pushSecrets → 命名空间 Docker config Secret → ServiceAccount imagePullSecrets

提交后的镜像可用于创建新沙箱，实现工作区状态的持久化和迁移。

### 7. MCP 工具访问控制

SecurityProfile 支持对 MCP（Model Context Protocol）工具调用的细粒度访问控制：

```yaml
mcpToolPolicy:
  defaultAction: deny # 默认拒绝（白名单模式）
  unsupportedVersionAction: deny # 不支持的 MCP 版本也拒绝
  denyResponse:
    statusCode: 403
    body: 'Tool access denied'
  rules:
    - method: 'tools/call'
      toolNames: ['read_file', 'write_file', 'run_command']
      action: allow
    - method: 'tools/list'
      action: allow
```

---

## 关键源码/CRD 解读

### CRD 全景

OpenKruise Agents 定义了 **10 个 CRD**，API Group 为 `agents.kruise.io/v1alpha1`：

| CRD                     | 简称 | 作用域     | 核心职责                                   |
| ----------------------- | ---- | ---------- | ------------------------------------------ |
| **Sandbox**             | sbx  | Namespaced | 单个沙箱实例的完整生命周期                 |
| **SandboxSet**          | sbs  | Namespaced | 沙箱预热池（类似 ReplicaSet 管理空闲沙箱） |
| **SandboxClaim**        | sbc  | Namespaced | 从池中认领沙箱（类似 PVC 之于 PV）         |
| **SandboxTemplate**     | sbt  | Namespaced | 可复用的沙箱模板                           |
| **SandboxUpdateOps**    | suo  | Namespaced | 批量升级操作                               |
| **Checkpoint**          | cp   | Namespaced | 沙箱检查点（暂停/恢复的状态保存）          |
| **Commit**              | —    | Namespaced | 将沙箱可写层提交为镜像                     |
| **SecurityProfile**     | —    | Namespaced | L7 HTTP 安全策略（API Key 注入、访问控制） |
| **TrafficPolicy**       | tp   | Namespaced | L3/L4 网络策略                             |
| **GlobalTrafficPolicy** | gtp  | Cluster    | 集群级 L3/L4 网络策略                      |

### Sandbox 状态机

```
                    ┌──────────┐
                    │ Pending  │ ← 创建 / 从池中分配
                    └────┬─────┘
                         │ Pod 就绪
                         ▼
              ┌──────────────────┐
         ┌───▶│     Running      │◀───┐
         │    └──┬───┬───┬───┬───┘    │
         │       │   │   │   │        │
    resume│  pause│   │   │   │upgrade │
         │       ▼   │   │   ▼        │
         │  ┌────────┐│   │┌──────────┐│
         │  │ Paused ││   ││Upgrading ││
         │  └────────┘│   │└──────────┘│
         │       │    │   │        │   │
         └───────┘    │   │        └───┘
                      │   │
              recycle │   │ terminate
                      ▼   ▼
              ┌──────────┐ ┌─────────────┐
              │Recycling │ │ Terminating │
              └────┬─────┘ └─────────────┘
                   │ 回收完成 → 回到池中
                   ▼
              (回到 SandboxSet 池)

  终态: Succeeded / Failed
```

关键状态转换的 Condition 追踪：

- `Ready`：沙箱可服务
- `SandboxPaused`：所有容器已暂停
- `SandboxResumed`：沙箱已恢复
- `InplaceUpdate`：原地更新状态
- `Upgrading`：升级状态（含 PreUpgrade / UpgradePod / PostUpgrade / Checkpointing 子阶段）
- `RuntimeInitialized`：agent-runtime sidecar 初始化完成
- `Recycling`：回收进度

### 运行时 Sidecar 注入

Sandbox 通过 `spec.runtimes` 声明需要的 sidecar：

```yaml
spec:
  runtimes:
    - name: agent-runtime # E2B envd 兼容的运行时 sidecar
    - name: traffic-proxy # 流量代理 sidecar
    - name: csi # CSI 存储挂载 sidecar
```

控制器根据配置自动注入对应的 sidecar 容器到 Pod 中。

### 项目代码结构

```
openkruise/agents/
├── api/v1alpha1/           # CRD 类型定义（10 个 *_types.go）
├── client/                 # 生成的 Kubernetes 客户端
├── cmd/                    # 二进制入口（controller-manager、gateway 等）
├── config/                 # K8s 部署清单（CRD YAML、RBAC、Webhook）
├── pkg/                    # 核心实现（控制器、调谐器、Webhook）
├── proto/envd/             # agent-runtime 的 Protobuf 定义
├── sdk/customized_e2b/     # E2B 兼容 SDK
├── dockerfiles/            # 容器镜像构建
├── docs/
│   ├── proposals/          # 17 个设计提案（2025.12 - 2026.07）
│   ├── best-practices/     # 最佳实践（证书管理等）
│   ├── components/         # 组件文档（traffic-extension）
│   └── specs/              # 规格说明
├── examples/
│   ├── claude-code/        # Claude Code 沙箱示例
│   ├── code_interpreter/   # 代码解释器沙箱示例
│   ├── desktop/            # 桌面沙箱示例
│   └── openclaw/           # OpenClaw 沙箱示例
└── roadmap.md              # 2026 路线图
```

### 2026 路线图要点

| 领域         | 计划                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| **池管理**   | 原地 resize、自动扩缩容、模板滚动更新                                                 |
| **存储**     | 动态 OSS 挂载、免手动 CSI sidecar 配置                                                |
| **网络**     | 沙箱网关性能基准测试、轻量网络访问控制                                                |
| **运行时**   | E2B envd 兼容 sidecar、pause/checkpoint + 文件系统持久化、Kata/gVisor/Kuasar 最佳实践 |
| **调度**     | 集成 Koorindator 和 Volcano 快速调度                                                  |
| **API**      | 补全 E2B API（网络控制、签名下载、Team API）、发布 Java/Python SDK 到 Maven/PyPI      |
| **可观测性** | 控制面指标、分布式追踪、基准指南                                                      |
| **集成**     | OpenClaw 最佳实践、verl/roll 强化学习框架、桌面/移动场景、swe-bench                   |

---

## 对 qwen-code 的启示

### qwen-code Docker 沙箱 vs OpenKruise Agents K8s 沙箱

| 维度             | qwen-code（Docker 沙箱）         | OpenKruise Agents（K8s 沙箱）                        |
| ---------------- | -------------------------------- | ---------------------------------------------------- |
| **运行环境**     | 单机 Docker 容器                 | Kubernetes 集群 Pod                                  |
| **目标用户**     | 单个开发者本地使用               | 平台运营方管理大规模多租户                           |
| **隔离级别**     | Docker namespace/cgroup          | K8s namespace + 可选 Kata/gVisor                     |
| **网络控制**     | Docker 网络模式（bridge/host）   | L3/L4 TrafficPolicy + L7 SecurityProfile             |
| **API Key 安全** | 环境变量注入（Key 在容器内可见） | 网关层注入（Key 永远不进入沙箱）                     |
| **状态持久化**   | Docker volume / bind mount       | PVC + Checkpoint + Commit（镜像化）                  |
| **休眠/恢复**    | docker pause/unpause（内存保留） | Checkpoint CRD（内存 + 文件系统 + GPU 内存）         |
| **升级**         | 重建容器                         | 原地更新 / CheckpointRestore / 批量 SandboxUpdateOps |
| **扩缩容**       | 手动                             | SandboxSet 自动池化 + 自动扩缩容（规划中）           |
| **多租户**       | 不适用                           | 团队隔离 + 命名空间 + API Key 授权                   |
| **适用场景**     | CLI 工具、本地开发、CI/CD        | SaaS 平台、企业级 Agent 服务、RL 训练集群            |

### 可借鉴的设计理念

**1. "Key 不进沙箱"原则**

qwen-code 当前通过环境变量将 API Key 传入 Docker 沙箱。对于本地单用户场景这是可接受的，但如果 qwen-code 未来支持远程沙箱或多用户场景，OpenKruise Agents 的网关层 Key 注入模式（traffic-extension + SecurityProfile）是更安全的选择。Agent 发出的请求只包含占位符，真实 Key 在沙箱外部的代理层注入。

**2. 声明式生命周期管理**

qwen-code 的 Docker 沙箱生命周期是命令式的（启动、停止、删除）。OpenKruise Agents 的声明式模型（设置 `shutdownTime`、`pauseTime`，控制器自动执行）更适合长时间运行的场景。qwen-code 可以考虑在 Docker 沙箱上实现类似的 TTL 自动清理。

**3. 分层安全策略**

OpenKruise Agents 将安全分为三层：

- L3/L4 TrafficPolicy（IP/端口级）
- L7 SecurityProfile（HTTP 请求级）
- MCP ToolPolicy（工具调用级）

qwen-code 的权限系统（`allowedTools`、`sandbox.permissions`）在概念上类似 MCP ToolPolicy，但缺少网络层的控制。如果沙箱内的 Agent 可以发出任意 HTTP 请求，仅靠工具级权限是不够的。

**4. 检查点与状态保存**

qwen-code 的会话恢复目前依赖对话历史的序列化。OpenKruise Agents 的 Checkpoint 机制（保存完整内存 + 文件系统状态）提供了更强的恢复能力，但需要 CRIU 等内核级支持，在 Docker 桌面环境中实现较困难。Commit（将可写层提交为镜像）是一个更轻量的替代方案，qwen-code 可以用 `docker commit` 实现类似功能。

**5. 预热池模式**

对于需要频繁创建沙箱的场景（如 CI/CD 中的并行任务），OpenKruise Agents 的 SandboxSet 预热池 + SandboxClaim 认领模式可以显著降低冷启动延迟。qwen-code 如果支持并行子 Agent，可以考虑类似的沙箱池化策略。

### 适用场景判断

- **本地开发 / CLI 使用**：qwen-code 的 Docker 沙箱足够，无需 K8s 开销
- **企业级 Agent 平台**：OpenKruise Agents 是更合适的选择（多租户、安全、成本优化）
- **CI/CD 集成**：取决于规模——少量任务用 Docker，大规模并行用 K8s + OpenKruise Agents
- **RL 训练 / 大规模评估**：OpenKruise Agents 的池化、检查点、批量升级能力是刚需

---

## 参考链接

### GitHub 仓库

- OpenKruise Agents 主仓库：https://github.com/openkruise/agents
- API 定义仓库：https://github.com/openkruise/agents-api
- Agentio（流量安全）：https://github.com/openkruise/agentio
- OpenKruise 核心：https://github.com/openkruise/kruise

### 官方文档

- Kruise Agents 介绍：https://openkruise.io/kruiseagents/introduction
- OpenKruise 架构：https://openkruise.io/docs/next/core-concepts/architecture

### 关键源码文件

- Sandbox CRD：`api/v1alpha1/sandbox_types.go`
- SandboxSet CRD：`api/v1alpha1/sandboxset_types.go`
- SandboxClaim CRD：`api/v1alpha1/sandboxclaim_types.go`
- SecurityProfile CRD：`api/v1alpha1/securityprofile_types.go`
- TrafficPolicy CRD：`api/v1alpha1/trafficpolicy_types.go`
- Checkpoint CRD：`api/v1alpha1/checkpoint_types.go`
- Commit CRD：`api/v1alpha1/commit_types.go`
- SandboxUpdateOps CRD：`api/v1alpha1/sandboxupdateops_types.go`

### 设计提案（docs/proposals/）

- 原地更新：`20251218-sandbox-inplace-update.md`
- SandboxClaim CRD：`20251229-sandbox-claim-crd.md`
- SandboxSet 自动扩缩容：`20260106-sandboxset-autoscaler.md`
- 沙箱模板：`20260123-sandbox-template.md`
- Prometheus 指标：`20260422-sandbox-prometheus-metrics.md`
- 安全身份提供者：`20260427-security-identity-provider.md`
- 沙箱 Commit：`20260506-sandbox-commit.md`
- TrafficPolicy 与 SecurityProfile：`20260521-traffic-policy-and-security-profile.md`
- 动态沙箱域名：`20260527-dynamic-sandbox-domain.md`
- 动态 CSI 挂载：`20260608-dynamic-csi-mount.md`
- okactl CLI 工具：`20260615-okactl-cli-tool.md`
- 分布式追踪：`20260702-sandbox-otel-distributed-tracing-en.md`
- JWT 访问令牌验证：`20260713-traffic-access-token-jwt-verification.md`

### 组件文档

- traffic-extension（Envoy ext-proc）：`docs/components/traffic-extension.md`

### 示例

- Claude Code 沙箱：`examples/claude-code/`
- 代码解释器沙箱：`examples/code_interpreter/`
- 桌面沙箱：`examples/desktop/`
- OpenClaw 沙箱：`examples/openclaw/`

### 未能获取的信息

- 张振在 KubeCon 的具体演讲列表（在 KubeCon NA 2025 和 KubeCon China 2025 公开日程中未检索到以 OpenKruise Agents 为主题的条目）
- 阿里云技术博客上关于 OpenKruise Agents 的文章（Google 搜索未返回有效结果）
- 2026 Agent Harness 研讨会的具体演讲材料（该研讨会资料可能未公开发布）
- OpenKruise Agents 的实际生产规模数据（如阿里云内部部署的沙箱数量）
