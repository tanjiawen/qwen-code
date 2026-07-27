# Harness 改进设计文档：从 DataFlow-Harness 借鉴的工程约束增强

> 状态：Draft  
> 日期：2026-07-27  
> 灵感来源：DataFlow-Harness (arXiv 2607.16617)、AgentScope 2.0、OpenDev 论文

## 动机

DataFlow-Harness 的实验证明了一个反直觉的结论：给 Agent 更多工具自由度，通过率反而下降 8.4%；加入程序性知识（Skills）和结构化约束（typed mutations + RVC 协议）后，通过率回升 10%，成本降 72.5%。

Qwen Code 当前的工具系统和权限模型已解决"结构合法性"问题，但缺少"语义正确性"层面的约束。本设计文档提出 7 项改进，将 DataFlow-Harness 的核心思想融入 Qwen Code。

## 改进项总览

| #   | 改进项                         | 优先级 | 预期收益             | 难度 | 依赖 |
| --- | ------------------------------ | ------ | -------------------- | ---- | ---- |
| 1   | Skills 升级为程序性知识编码    | P0     | 减少流程错误 10%+    | 中   | 无   |
| 2   | edit 预校验（RVC 协议）        | P0     | 减少无效轮次 15-20%  | 低   | 无   |
| 3   | 文件变更感知（mtime 注入）     | P1     | 避免基于过期内容操作 | 低   | 无   |
| 4   | 语义层约束（工具顺序/互斥）    | P1     | 减少逻辑错误         | 中   | #1   |
| 5   | 纠正记忆（用户否定→短期约束）  | P1     | 避免重复犯错         | 中   | 无   |
| 6   | 工具调用缓存（重复 read 检测） | P2     | 减少 token 浪费      | 低   | #3   |
| 7   | TUI 任务进度可视化             | P2     | 提升可审计性         | 高   | 无   |

## 设计原则

1. **渐进式增强**：每项改进独立可用，不破坏现有行为
2. **向后兼容**：新字段均为 optional，旧 Skill/配置无需修改
3. **可观测性**：每项约束的触发都有 telemetry 事件
4. **可关闭**：每项改进可通过 settings.json 单独禁用

## 文档结构

```
docs/design/harness-improvements/
├── README.md                          ← 你在这里（总览）
├── 01-skills-procedural-knowledge.md  ← P0: Skills 升级
├── 02-edit-prevalidation-rvc.md       ← P0: edit 预校验
├── 03-file-change-awareness.md        ← P1: 文件变更感知
├── 04-semantic-constraints.md         ← P1: 语义层约束
├── 05-correction-memory.md            ← P1: 纠正记忆
├── 06-tool-call-cache.md             ← P2: 工具调用缓存
└── 07-tui-progress-visualization.md   ← P2: TUI 可视化
```

## 与现有架构的关系

```
现有架构                          改进后的架构
┌─────────────────┐              ┌─────────────────┐
│   Skills        │              │   Skills        │
│  (prompt 模板)   │     →        │  (程序性知识)     │
│                 │              │  + Blueprint     │
│                 │              │  + Constraints   │
└─────────────────┘              └─────────────────┘

┌─────────────────┐              ┌─────────────────┐
│ coreToolScheduler│              │ coreToolScheduler│
│  schema 校验     │     →        │  + RVC 协议      │
│  权限检查        │              │  + 语义预校验    │
│  执行            │              │  + 缓存检查      │
└─────────────────┘              └─────────────────┘

┌─────────────────┐              ┌─────────────────┐
│ system-reminder │              │ system-reminder │
│  日期/plan/memory│     →        │  + 文件变更通知  │
│                 │              │  + 纠正约束      │
│                 │              │  + 重复操作警告  │
└─────────────────┘              └─────────────────┘
```

## 实施顺序建议

```
Phase 1（1-2 周）：#2 edit 预校验 + #3 文件变更感知
  → 低风险、高收益、独立可用

Phase 2（2-3 周）：#1 Skills 升级 + #4 语义约束
  → 需要设计新的 Skill schema，但向后兼容

Phase 3（3-4 周）：#5 纠正记忆 + #6 工具缓存
  → 依赖 Phase 1 的文件变更感知基础设施

Phase 4（可选）：#7 TUI 可视化
  → 独立的前端工作，不阻塞后端改进
```
