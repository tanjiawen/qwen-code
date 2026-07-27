# 设计文档 #6：工具调用缓存（重复 read 检测）

> 优先级：P2  
> 预期收益：减少 5-10% 的 token 浪费  
> 难度：低  
> 依赖：#3 ReadCache 基础设施  
> 影响范围：`packages/core/src/tools/read-file/`、`packages/core/src/core/coreToolScheduler.ts`

## 1. 问题陈述

Agent 经常在同一轮或相邻轮次中重复读取同一文件（内容未变），浪费 token 和延迟。DataFlow-Harness 通过 typed mutations 避免了无效操作，Qwen Code 可以通过缓存检测来减少重复读取。

## 2. 设计方案

### 2.1 基于 ReadCache 的重复检测

复用 #3 的 ReadCache，在 read_file 执行前检查缓存：

```typescript
// packages/core/src/tools/read-file/read-file.ts

async execute(params: ReadFileParams): Promise<ToolResult> {
  const filePath = params.file_path;

  // 检查缓存
  const cached = readCache.getEntry(filePath);
  if (cached) {
    const { stale, currentMtime } = await readCache.checkStaleness(filePath);

    if (!stale) {
      // 文件未变化，返回缓存内容 + 提示
      return {
        content: cached.content,
        metadata: {
          fromCache: true,
          message: `[缓存] 文件 ${filePath} 自上次读取（第 ${cached.turnId} 轮）后未被修改。如需强制刷新，请使用 offset/limit 参数指定不同范围。`,
        },
      };
    }
    // 文件已变化，正常读取并更新缓存
  }

  // 正常读取流程
  const content = await readFile(filePath, params);
  const stat = await fs.stat(filePath);
  readCache.record(filePath, content, stat.mtimeMs, currentTurnId);

  return { content: formatFileContent(content, params) };
}
```

### 2.2 配置项

```jsonc
{
  "tools": {
    "readFile": {
      "cacheHitBehavior": "return_cached_with_note", // 或 "always_fresh"
      "cacheNote": true, // 是否在缓存命中时附加提示
    },
  },
}
```

### 2.3 与 #4 redundancy 约束的关系

- #4 的 `redundant-read-detection` 约束在 coreToolScheduler 层面拦截（返回警告）
- #6 在 read_file 工具内部处理（返回缓存内容 + 提示）
- 两者互补：#4 让 LLM 知道不该重复读，#6 即使 LLM 仍然调用也不浪费 I/O

## 3. 预期效果

| 场景                 | 当前                      | 改进后               |
| -------------------- | ------------------------- | -------------------- |
| 同一轮读同一文件两次 | 两次磁盘 I/O + 两次 token | 第二次返回缓存       |
| 相邻轮读未变文件     | 重复 token 消耗           | 缓存命中 + 提示      |
| 文件已变化           | —                         | 正常读取（缓存失效） |

## 4. 测试计划

- 单元测试：缓存命中/失效/淘汰
- 集成测试：连续 read_file 同一文件 → 验证第二次返回缓存标记
