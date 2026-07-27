# 设计文档 #1：Skills 升级为程序性知识编码

> 优先级：P0  
> 预期收益：减少流程错误 10%+（参考 DataFlow-Harness 实验：83.3% → 93.3%）  
> 难度：中  
> 影响范围：`packages/core/src/skills/`、`packages/core/src/core/prompts.ts`

## 1. 问题陈述

DataFlow-Harness 的核心实验结论：

> "给 Agent 一套完整的平台工具，并不等于它会使用这套平台。它知道'有哪些积木'，却未必知道先搭哪一块、哪些块能连在一起。"

Qwen Code 当前的 Skills 系统主要是 **prompt 模板**——告诉 Agent "你可以做 X"，但不编码"做 X 时必须按什么顺序、不能跳过什么步骤"。

**缺失的两类知识**（DataFlow-Skills 的定义）：

1. **Procedural Blueprints**：算子选择模式、步骤顺序、参数配置经验
2. **Compositional Constraints**：步骤间的依赖规则、互斥约束、不可跳过的检查

## 2. 设计方案

### 2.1 扩展 Skill Schema

在现有 SkillConfig 基础上新增 `blueprint` 和 `constraints` 字段：

```typescript
// packages/core/src/skills/types.ts

interface SkillConfig {
  // === 现有字段（保持不变）===
  name: string;
  description: string;
  trigger?: string; // 触发条件
  content?: string; // prompt 内容

  // === 新增字段（optional，向后兼容）===

  /** 程序性蓝图：编码"做这件事的正确步骤顺序" */
  blueprint?: ProceduralBlueprint;

  /** 组合约束：编码"步骤间的依赖和互斥规则" */
  constraints?: CompositionalConstraint[];
}

interface ProceduralBlueprint {
  /** 步骤列表（有序） */
  steps: BlueprintStep[];

  /** 是否强制按顺序执行（false = 建议顺序，true = 硬约束） */
  strictOrder?: boolean;

  /** 完成条件：所有步骤执行完后如何验证 */
  completionCheck?: string;
}

interface BlueprintStep {
  /** 步骤描述 */
  description: string;

  /** 关联的工具名（可选，用于自动追踪进度） */
  tool?: string;

  /** 该步骤的前置条件 */
  requires?: string;

  /** 该步骤是否可以跳过 */
  skippable?: boolean;

  /** 跳过条件（当 skippable=true 时） */
  skipCondition?: string;
}

interface CompositionalConstraint {
  /** 约束类型 */
  type: 'ordering' | 'exclusion' | 'mandatory' | 'redundancy';

  /** 约束描述（注入 prompt 的自然语言） */
  description: string;

  /** ordering: 工具 A 必须在工具 B 之前 */
  ordering?: { before: string; after: string; sameFile?: boolean };

  /** exclusion: 工具 A 和 B 不能在同一轮对同一文件使用 */
  exclusion?: { tools: string[]; sameFile?: boolean };

  /** mandatory: 某工具在特定条件下必须被调用 */
  mandatory?: { tool: string; condition: string };

  /** redundancy: 检测重复调用 */
  redundancy?: {
    tool: string;
    sameArgs: boolean;
    window: number;
    message: string;
  };
}
```

### 2.2 示例：code-review Skill 升级

```yaml
# .qwen/skills/code-review.md（改进后）
---
name: code-review
description: 对指定文件或 PR 进行代码审查
trigger: '用户要求 review、审查、检查代码'

blueprint:
  strictOrder: true
  steps:
    - description: '读取目标文件完整内容'
      tool: read_file
      requires: '必须知道要审查哪个文件'
    - description: '搜索相关引用和依赖'
      tool: grep_search
      skippable: true
      skipCondition: '文件是独立的，无外部引用'
    - description: '检查 git diff 了解最近变更'
      tool: run_shell_command
      skippable: true
      skipCondition: '用户没有指定审查变更'
    - description: '基于读取的内容进行分析，不能凭空推断'
      tool: null # 纯推理步骤
    - description: '输出审查结果，按严重程度排序'
      tool: null
  completionCheck: '审查结果必须引用具体行号，不能泛泛而谈'

constraints:
  - type: ordering
    description: '必须先 read_file 再进行分析，不能跳过读取直接评论'
    ordering: { before: 'read_file', after: 'edit' }
  - type: mandatory
    description: "审查完成后必须给出具体修改建议，不能只说'看起来不错'"
    mandatory:
      { tool: null, condition: '审查发现 >= 1 个问题时必须给出修改建议' }
  - type: redundancy
    description: '不要重复读取同一文件'
    redundancy:
      {
        tool: 'read_file',
        sameArgs: true,
        window: 5,
        message: '你已经在本次审查中读过这个文件，内容未变',
      }
---
你是一个代码审查专家。审查时关注：正确性 > 安全性 > 性能 > 风格。
...（原有 prompt 内容保持不变）
```

### 2.3 约束注入机制

当 Skill 被激活时，其 `blueprint` 和 `constraints` 被编译为 system-reminder 注入：

```typescript
// packages/core/src/skills/constraint-injector.ts

function compileSkillConstraints(skill: SkillConfig): string {
  const parts: string[] = [];

  if (skill.blueprint) {
    parts.push('## 执行蓝图（必须遵循的步骤顺序）');
    skill.blueprint.steps.forEach((step, i) => {
      const marker = step.skippable ? '[可跳过]' : '[必须]';
      parts.push(`${i + 1}. ${marker} ${step.description}`);
      if (step.requires) parts.push(`   前置条件：${step.requires}`);
    });
  }

  if (skill.constraints?.length) {
    parts.push('\n## 组合约束（违反将导致错误）');
    skill.constraints.forEach((c) => {
      parts.push(`- ${c.description}`);
    });
  }

  return parts.join('\n');
}
```

### 2.4 运行时约束检查

在 `coreToolScheduler` 中，工具执行前检查是否违反当前激活 Skill 的约束：

```typescript
// packages/core/src/core/semantic-constraint-checker.ts

function checkConstraints(
  toolCall: ToolCall,
  activeSkill: SkillConfig | null,
  recentToolCalls: ToolCall[], // 最近 N 次工具调用
): ConstraintViolation | null {
  if (!activeSkill?.constraints) return null;

  for (const constraint of activeSkill.constraints) {
    switch (constraint.type) {
      case 'ordering':
        // 检查是否违反了顺序约束
        if (toolCall.name === constraint.ordering?.after) {
          const hasBefore = recentToolCalls.some(
            (tc) => tc.name === constraint.ordering?.before,
          );
          if (!hasBefore) {
            return {
              violated: constraint,
              message: `违反顺序约束：${constraint.description}`,
            };
          }
        }
        break;

      case 'redundancy':
        // 检查是否重复调用
        if (toolCall.name === constraint.redundancy?.tool) {
          const recentSame = recentToolCalls
            .slice(-constraint.redundancy.window)
            .filter(
              (tc) =>
                tc.name === toolCall.name &&
                (constraint.redundancy.sameArgs
                  ? sameArgs(tc, toolCall)
                  : true),
            );
          if (recentSame.length > 0) {
            return {
              violated: constraint,
              message: constraint.redundancy.message,
            };
          }
        }
        break;
    }
  }
  return null;
}
```

### 2.5 向后兼容

- 现有 Skill 文件无需修改（`blueprint` 和 `constraints` 均为 optional）
- 没有 blueprint 的 Skill 行为与当前完全一致
- 约束检查可通过 settings 全局关闭：`"skills": { "constraintEnforcement": false }`

## 3. 预期效果

| 场景                      | 当前行为         | 改进后行为                 |
| ------------------------- | ---------------- | -------------------------- |
| Agent 跳过 read 直接 edit | 执行后可能匹配错 | 约束检查拦截 + 提示先 read |
| Agent 重复读同一文件      | 浪费 token       | redundancy 约束警告        |
| Agent 审查代码时凭空推断  | 产出不准确的评论 | blueprint 强制先 read      |
| Agent 修改后不测试        | 可能引入 bug     | mandatory 约束提醒测试     |

## 4. 测试计划

- 单元测试：constraint-checker 的各种约束类型
- 集成测试：激活 code-review Skill → 验证 Agent 遵循 blueprint 顺序
- 回归测试：无 blueprint 的旧 Skill 行为不变

## 5. 与 #4 语义约束的关系

本设计中的 `constraints` 字段是 Skill 级别的约束。设计文档 #4 将定义**全局级别**的语义约束（不依赖特定 Skill 激活），两者互补：

- Skill constraints：特定任务流程的约束
- Global constraints：所有场景通用的约束（如 "edit 前必须 read"）
