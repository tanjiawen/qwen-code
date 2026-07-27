# 设计文档 #5：纠正记忆（用户否定→短期约束注入）

> 优先级：P1  
> 预期收益：避免 Agent 重复犯同一错误  
> 难度：中  
> 影响范围：`packages/core/src/core/client.ts`、新增 `packages/core/src/services/correction-memory.ts`

## 1. 问题陈述

当用户说"不对，应该用 X 而不是 Y"或"不要这样做"时，Agent 在当前轮次会修正，但在后续轮次中可能再次犯同样的错误——因为纠正信息没有被持久化到上下文中。

DataFlow-WebUI 的设计：用户修改 → Agent 下一轮自动感知。Qwen Code 需要将用户的**否定性反馈**转化为短期约束。

## 2. 设计方案

### 2.1 纠正检测器

```typescript
// packages/core/src/services/correction-memory.ts

interface Correction {
  id: string;
  timestamp: number;
  /** 用户原始纠正语句 */
  userMessage: string;
  /** 提取的约束规则 */
  rule: CorrectionRule;
  /** 有效期（轮次数） */
  ttl: number;
  /** 剩余有效轮次 */
  remainingTurns: number;
}

interface CorrectionRule {
  /** 约束类型 */
  type:
    | 'avoid_tool'
    | 'prefer_tool'
    | 'avoid_pattern'
    | 'prefer_pattern'
    | 'custom';

  /** avoid_tool: 不要使用某工具 */
  avoidTool?: string;

  /** prefer_tool: 优先使用某工具 */
  preferTool?: string;

  /** avoid_pattern: 不要做某种操作模式 */
  avoidPattern?: string;

  /** prefer_pattern: 应该做某种操作模式 */
  preferPattern?: string;

  /** custom: 自由文本约束 */
  customRule?: string;

  /** 适用范围 */
  scope: 'file' | 'directory' | 'global';
  scopeTarget?: string; // 文件路径或目录
}

// 纠正检测：从用户消息中识别否定性反馈
const CORRECTION_PATTERNS = [
  // 中文
  /不对[，,]?\s*(.+)/,
  /不要(.+)/,
  /别(.+)/,
  /错了[，,]?\s*(.+)/,
  /应该用(.+)而不是(.+)/,
  /不是(.+)，是(.+)/,
  /停止(.+)/,
  /不要再(.+)/,
  // 英文
  /no[,.]?\s*(.+)/i,
  /don'?t\s+(.+)/i,
  /stop\s+(.+)/i,
  /wrong[,.]?\s*(.+)/i,
  /use\s+(.+)\s+instead/i,
  /not\s+(.+)[,.]?\s*(.+)/i,
];

function detectCorrection(userMessage: string): CorrectionRule | null {
  for (const pattern of CORRECTION_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match) {
      return extractRule(match, userMessage);
    }
  }
  return null;
}

function extractRule(
  match: RegExpMatchArray,
  fullMessage: string,
): CorrectionRule {
  const text = match[1]?.trim() || '';

  // 启发式提取：识别工具名
  const toolNames = [
    'read_file',
    'write_file',
    'edit',
    'run_shell_command',
    'grep_search',
    'glob',
    'agent',
  ];
  const mentionedTool = toolNames.find((t) => text.includes(t));

  if (fullMessage.match(/不要|别|don'?t|stop|不要再/)) {
    if (mentionedTool) {
      return { type: 'avoid_tool', avoidTool: mentionedTool, scope: 'global' };
    }
    return { type: 'avoid_pattern', avoidPattern: text, scope: 'global' };
  }

  if (fullMessage.match(/应该用|use.*instead|不是.*是/)) {
    if (mentionedTool) {
      return {
        type: 'prefer_tool',
        preferTool: mentionedTool,
        scope: 'global',
      };
    }
    return { type: 'prefer_pattern', preferPattern: text, scope: 'global' };
  }

  return { type: 'custom', customRule: text, scope: 'global' };
}
```

### 2.2 纠正记忆管理器

```typescript
class CorrectionMemory {
  private corrections: Correction[] = [];
  private defaultTtl = 10; // 默认 10 轮有效

  /** 从用户消息中检测并记录纠正 */
  processUserMessage(message: string, turnId: string): Correction | null {
    const rule = detectCorrection(message);
    if (!rule) return null;

    const correction: Correction = {
      id: `corr-${Date.now()}`,
      timestamp: Date.now(),
      userMessage: message,
      rule,
      ttl: this.defaultTtl,
      remainingTurns: this.defaultTtl,
    };

    this.corrections.push(correction);
    this.pruneExpired();
    return correction;
  }

  /** 每轮递减 TTL */
  tick(): void {
    for (const c of this.corrections) {
      c.remainingTurns--;
    }
    this.pruneExpired();
  }

  /** 编译为 system-reminder 注入文本 */
  compileReminder(): string | null {
    if (this.corrections.length === 0) return null;

    const rules = this.corrections.map((c) => {
      switch (c.rule.type) {
        case 'avoid_tool':
          return `- 不要使用 ${c.rule.avoidTool}（用户明确要求）`;
        case 'prefer_tool':
          return `- 优先使用 ${c.rule.preferTool}（用户明确要求）`;
        case 'avoid_pattern':
          return `- 不要：${c.rule.avoidPattern}`;
        case 'prefer_pattern':
          return `- 应该：${c.rule.preferPattern}`;
        case 'custom':
          return `- ${c.rule.customRule}`;
      }
    });

    return `<system-reminder>
## 用户纠正约束（必须遵循）
以下是用户在本次会话中明确给出的纠正，你必须遵循：
${rules.join('\n')}
这些约束在 ${this.corrections[0].remainingTurns} 轮内有效。
</system-reminder>`;
  }

  private pruneExpired(): void {
    this.corrections = this.corrections.filter((c) => c.remainingTurns > 0);
  }
}
```

### 2.3 集成到 client.ts

```typescript
// packages/core/src/core/client.ts
// 在 sendMessageStream 中：

// 1. 用户消息到达时，检测纠正
const correction = correctionMemory.processUserMessage(userMessage, turnId);

// 2. 每轮递减 TTL
correctionMemory.tick();

// 3. 组装 system-reminder 时，注入纠正约束
const correctionReminder = correctionMemory.compileReminder();
if (correctionReminder) {
  systemReminders.push(correctionReminder);
}
```

### 2.4 配置项

```jsonc
// settings.json
{
  "correctionMemory": {
    "enabled": true,
    "defaultTtl": 10, // 默认有效轮次
    "maxCorrections": 20, // 最多同时持有的纠正数
  },
}
```

## 3. 预期效果

| 场景                            | 当前行为                 | 改进后行为                       |
| ------------------------------- | ------------------------ | -------------------------------- |
| 用户说"不要用 shell 做这个"     | 当前轮修正，后续可能再犯 | 10 轮内 system-reminder 持续约束 |
| 用户说"应该用 grep 而不是 glob" | 当前轮修正               | 后续优先使用 grep                |
| 用户说"别改测试文件"            | 当前轮修正               | 后续 edit 测试文件时触发警告     |
| 纠正过期后                      | —                        | 自动移除，不再约束               |

## 4. 与 Memory 系统的区别

| 维度     | 纠正记忆             | 长期 Memory     |
| -------- | -------------------- | --------------- |
| 生命周期 | 短期（10 轮 TTL）    | 长期（跨会话）  |
| 触发     | 自动检测否定语句     | 模型主动写入    |
| 注入方式 | system-reminder      | system-reminder |
| 存储     | 内存（会话级）       | 文件系统        |
| 目的     | 防止当前会话重复犯错 | 跨会话知识积累  |

## 5. 测试计划

- 单元测试：纠正检测器的各种模式匹配
- 单元测试：TTL 递减和过期清理
- 集成测试：用户否定 → 验证后续轮次注入约束 → 验证过期后移除
