# 设计文档 #3：文件变更感知（mtime 注入）

> 优先级：P1  
> 预期收益：避免基于过期内容操作，减少 edit 失败  
> 难度：低  
> 影响范围：`packages/core/src/tools/read-file/`、`packages/core/src/core/client.ts`

## 1. 问题陈述

当前 Qwen Code 中，Agent 读取文件后，如果用户在外部编辑器中修改了该文件，Agent 不知道文件已变化，可能基于过期内容做出错误编辑。

DataFlow-WebUI 的设计：用户在画布上修改 → Agent 下一轮自动读取最新状态。Qwen Code 需要类似的感知机制。

## 2. 设计方案

### 2.1 ReadCache：文件读取缓存

```typescript
// packages/core/src/tools/read-file/read-cache.ts

interface ReadCacheEntry {
  filePath: string;
  content: string;
  mtime: number; // 读取时的文件修改时间
  readTime: number; // 读取时的 wall clock
  turnId: string; // 在哪一轮读取的
}

class ReadCache {
  private cache = new Map<string, ReadCacheEntry>();
  private maxSize = 50; // 最多缓存 50 个文件

  record(
    filePath: string,
    content: string,
    mtime: number,
    turnId: string,
  ): void {
    this.cache.set(filePath, {
      filePath,
      content,
      mtime,
      readTime: Date.now(),
      turnId,
    });
    this.evictIfNeeded();
  }

  getEntry(filePath: string): ReadCacheEntry | undefined {
    return this.cache.get(filePath);
  }

  getMtime(filePath: string): number | undefined {
    return this.cache.get(filePath)?.mtime;
  }

  /** 检查文件是否在缓存记录后被修改 */
  async checkStaleness(
    filePath: string,
  ): Promise<{ stale: boolean; currentMtime?: number }> {
    const entry = this.cache.get(filePath);
    if (!entry) return { stale: false };

    const currentMtime = await getFileMtime(filePath);
    return { stale: currentMtime > entry.mtime, currentMtime };
  }

  /** 获取所有已缓存但已过期（被外部修改）的文件 */
  async getStaleFiles(): Promise<string[]> {
    const stale: string[] = [];
    for (const [path, entry] of this.cache) {
      const currentMtime = await getFileMtime(path);
      if (currentMtime > entry.mtime) stale.push(path);
    }
    return stale;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;
    // LRU 淘汰：移除最旧的条目
    const oldest = this.cache.keys().next().value;
    if (oldest) this.cache.delete(oldest);
  }
}
```

### 2.2 集成到 read_file 工具

```typescript
// packages/core/src/tools/read-file/read-file.ts
// 在 read_file 执行成功后，记录到 ReadCache：

async execute(params: ReadFileParams): Promise<ToolResult> {
  const content = await readFile(params.file_path);
  const stat = await fs.stat(params.file_path);

  // 记录到缓存
  readCache.record(params.file_path, content, stat.mtimeMs, currentTurnId);

  return { content: formatFileContent(content, params) };
}
```

### 2.3 变更感知注入

在 `client.ts` 的 `sendMessageStream` 中，每次 LLM 调用前检查文件变更：

```typescript
// packages/core/src/core/client.ts
// 在组装 system-reminder 时，添加文件变更通知：

async function buildFileChangeReminder(
  readCache: ReadCache,
): Promise<string | null> {
  const staleFiles = await readCache.getStaleFiles();
  if (staleFiles.length === 0) return null;

  const fileList = staleFiles.map((f) => `  - ${f}`).join('\n');
  return `<system-reminder>
以下文件在你上次读取后已被外部修改（用户编辑或其他进程）：
${fileList}
如果你需要编辑这些文件，必须先重新 read_file 获取最新内容。
基于过期内容的编辑可能导致 old_string 匹配失败或覆盖用户的修改。
</system-reminder>`;
}
```

### 2.4 与 edit 预校验的协同

ReadCache 同时服务于 #2（edit 预校验）和 #3（变更感知）：

```
read_file 执行 → 记录 mtime 到 ReadCache
                    │
                    ├── #3: 下一轮 LLM 调用前 → 检查 mtime → 注入 reminder
                    │
                    └── #2: edit 执行前 → 检查 mtime → 预校验拦截
```

### 2.5 配置项

```jsonc
// settings.json
{
  "tools": {
    "readFile": {
      "cacheEnabled": true, // 是否启用读取缓存
      "cacheMaxSize": 50, // 最大缓存文件数
      "staleCheckEnabled": true, // 是否启用变更感知
    },
  },
}
```

## 3. 预期效果

| 场景                      | 当前行为                      | 改进后行为                             |
| ------------------------- | ----------------------------- | -------------------------------------- |
| 用户在 VS Code 中改了文件 | Agent 不知道，基于旧内容 edit | system-reminder 通知 + edit 预校验拦截 |
| 另一个 Agent 修改了文件   | 当前 Agent 不知道             | 同上                                   |
| git checkout 切换分支     | 文件全部变化                  | 批量通知                               |
| 文件未变化                | —                             | 无额外开销（mtime 检查 < 1ms）         |

## 4. 性能考量

- `fs.stat()` 获取 mtime：~0.1ms/文件，50 个文件 = ~5ms
- 只在 LLM 调用前检查（不是每次工具调用），频率低
- 缓存大小限制 50 个文件，LRU 淘汰

## 5. 测试计划

- 单元测试：ReadCache 的记录/查询/淘汰/staleness 检测
- 集成测试：read_file → 外部修改文件 → 验证 reminder 注入
- 集成测试：read_file → 外部修改 → edit 预校验拦截
