# 设计文档 #4：语义层约束（全局工具顺序/互斥规则）

> 优先级：P1  
> 预期收益：减少逻辑错误（Agent 做"结构合法但语义错误"的操作）  
> 难度：中  
> 依赖：#1 Skills 升级（复用约束检查基础设施）  
> 影响范围：`packages/core/src/core/coreToolScheduler.ts`、新增 `packages/core/src/core/semantic-constraints.ts`

## 1. 问题陈述

DataFlow-Harness 的核心边界："structural validity only, not semantic correctness"。

Qwen Code 的权限系统只检查：

- ✅ 工具调用结构合法（参数符合 schema）
- ✅ 权限通过（用户允许执行）
- ❌ 不检查语义正确性

**语义错误的例子**：

- Agent 没有 read_file 就直接 edit（可能基于记忆中的旧内容）
- Agent 对同一文件连续 write_file + edit（逻辑矛盾）
- Agent 修改代码后不运行测试就声称完成
- Agent 在 Plan Mode 中尝试写操作（已被权限拦截，但属于结构层）

## 2. 设计方案

### 2.1 全局语义约束注册表

与 #1 的 Skill 级约束不同，这里是**全局约束**——无论哪个 Skill 激活都生效：

```typescript
// packages/core/src/core/semantic-constraints.ts

interface GlobalSemanticConstraint {
  id: string;
  description: string;
  severity: 'error' | 'warning'; // error = 阻止执行, warning = 注入提醒
  check: (context: ConstraintContext) => ConstraintResult;
}

interface ConstraintContext {
  currentToolCall: ToolCallInfo;
  recentToolCalls: ToolCallInfo[]; // 最近 N 次调用
  readCache: ReadCache; // 文件读取缓存
  activeSkill: SkillConfig | null;
  approvalMode: ApprovalMode;
}

interface ConstraintResult {
  violated: boolean;
  message?: string;
  suggestion?: string;
}

// 全局约束注册表
const GLOBAL_CONSTRAINTS: GlobalSemanticConstraint[] = [
  {
    id: 'edit-requires-recent-read',
    description: '编辑文件前必须在最近 5 轮内读取过该文件',
    severity: 'warning',
    check: (ctx) => {
      if (
        ctx.currentToolCall.name !== 'edit' &&
        ctx.currentToolCall.name !== 'write_file'
      ) {
        return { violated: false };
      }
      const filePath = ctx.currentToolCall.params.file_path;
      const entry = ctx.readCache.getEntry(filePath);
      if (!entry) {
        return {
          violated: true,
          message: `你正在编辑 ${filePath}，但本次会话中未读取过该文件。建议先 read_file 确认当前内容。`,
          suggestion: '调用 read_file 获取最新内容后再编辑',
        };
      }
      // 检查是否在最近 5 轮内读取
      const turnsSinceRead = ctx.recentToolCalls.filter(
        (tc) => tc.name === 'read_file' && tc.params.file_path === filePath,
      ).length;
      if (turnsSinceRead === 0) {
        return {
          violated: true,
          message: `你上次读取 ${filePath} 已经是较早之前了，文件可能已变化。建议重新 read_file。`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'no-write-then-edit-same-file',
    description: '不能对同一文件先 write_file 再 edit（逻辑矛盾）',
    severity: 'error',
    check: (ctx) => {
      if (ctx.currentToolCall.name !== 'edit') return { violated: false };
      const filePath = ctx.currentToolCall.params.file_path;
      const lastWrite = ctx.recentToolCalls
        .slice(-3)
        .find(
          (tc) => tc.name === 'write_file' && tc.params.file_path === filePath,
        );
      if (lastWrite) {
        return {
          violated: true,
          message: `你刚刚用 write_file 覆写了 ${filePath}，现在又用 edit 编辑它。如果 write_file 的内容是正确的，不需要 edit；如果需要修改，请直接修改 write_file 的 content 参数。`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'redundant-read-detection',
    description: '检测对同一文件的重复读取（内容未变时）',
    severity: 'warning',
    check: (ctx) => {
      if (ctx.currentToolCall.name !== 'read_file') return { violated: false };
      const filePath = ctx.currentToolCall.params.file_path;
      const entry = ctx.readCache.getEntry(filePath);
      if (entry) {
        // 文件未变化时重复读取
        return {
          violated: true,
          message: `你已经在第 ${entry.turnId} 轮读取过 ${filePath}，且文件未被修改。无需重复读取。`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'edit-after-test-suggestion',
    description: '修改代码后建议运行测试',
    severity: 'warning',
    check: (ctx) => {
      // 在 Agent 声称完成时检查（通过 Stop hook 触发）
      // 这里只做标记，实际检查在 Stop hook 中
      return { violated: false };
    },
  },
];
```

### 2.2 集成到 coreToolScheduler

```typescript
// packages/core/src/core/coreToolScheduler.ts
// 在 preValidate 之后、execute 之前：

function checkGlobalConstraints(
  toolCall: ToolCallInfo,
  context: ConstraintContext,
): ConstraintViolation | null {
  for (const constraint of GLOBAL_CONSTRAINTS) {
    const result = constraint.check(context);
    if (result.violated) {
      if (constraint.severity === 'error') {
        // 阻止执行
        return { constraint, result, action: 'block' };
      } else {
        // 注入警告但不阻止（让 LLM 自行决定）
        return { constraint, result, action: 'warn' };
      }
    }
  }
  return null;
}
```

### 2.3 用户可配置

```jsonc
// settings.json
{
  "semanticConstraints": {
    "enabled": true,
    "rules": {
      "edit-requires-recent-read": "warning", // 可改为 "error" 或 "off"
      "no-write-then-edit-same-file": "error",
      "redundant-read-detection": "warning",
      "edit-after-test-suggestion": "warning",
    },
  },
}
```

### 2.4 与 #1 Skill 约束的关系

```
约束检查顺序：
  1. 全局约束（GLOBAL_CONSTRAINTS）— 始终生效
  2. Skill 约束（activeSkill.constraints）— Skill 激活时生效
  3. 两者取并集：任何一个违反都触发对应动作
```

## 3. 预期效果

| 约束                         | 拦截的错误类型        | 频率估计 |
| ---------------------------- | --------------------- | -------- |
| edit-requires-recent-read    | 基于过期/记忆内容编辑 | 高       |
| no-write-then-edit-same-file | 逻辑矛盾的连续操作    | 中       |
| redundant-read-detection     | 浪费 token 的重复读取 | 高       |
| edit-after-test-suggestion   | 修改后不验证          | 中       |

## 4. 测试计划

- 单元测试：每个约束的 check 函数
- 集成测试：模拟违反约束的工具调用序列 → 验证拦截/警告
- 回归测试：正常工具调用序列不被误拦截
