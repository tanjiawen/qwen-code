# 源码调研补充：设计文档修正与精确插入点

> 基于 2026-07-27 源码调研结果，对各设计文档的修正和精确定位

## 关键发现：已有基础设施

调研发现 Qwen Code **已经实现了**部分我们设计中假设需要新建的基础设施：

| 我们设计中假设需要新建    | 实际已存在                   | 文件                                                           |
| ------------------------- | ---------------------------- | -------------------------------------------------------------- |
| ReadCache（文件读取缓存） | ✅ `FileReadCache` 类        | `packages/core/src/services/fileReadCache.ts`（413行）         |
| edit 预读校验             | ✅ `priorReadEnforcement.ts` | `packages/core/src/tools/priorReadEnforcement.ts`（331行）     |
| 字符串规范化匹配          | ✅ `editHelper.ts`           | `packages/core/src/utils/editHelper.ts`（478行）               |
| system-reminder 注入通道  | ✅ 两个注入点                | `client.ts` L2441 + `coreToolScheduler.ts` L4386               |
| 循环检测框架              | ✅ `LoopDetectionService`    | `packages/core/src/services/loopDetectionService.ts`（1000行） |

---

## 对 #2 edit 预校验的修正

### 原设计假设

> 需要新建 preValidate 函数，在 coreToolScheduler 中插入预校验阶段

### 修正后的精确方案

**已有基础设施**：

- `priorReadEnforcement.ts` 的 `checkPriorRead()` — 已验证模型是否合法读过文件
- `editHelper.ts` 的 `findMatchedSlice()` — 已有精确匹配 + 行级 trimEnd 规范化
- `editHelper.ts` 的 `LINE_COMPARISON_PASSES` — 逐级放宽的比较管道
- `editHelper.ts` 的 `UNICODE_EQUIVALENT_MAP` — Unicode 等价字符替换

**缺失的部分**（需要新增）：

1. **Fuzzy match 回退**：在 `findMatchedSlice()` 返回 null 后，添加基于行级相似度的模糊匹配
2. **最近匹配建议**：在 `edit.ts` 的 `occurrences === 0` 分支（约 L275），返回最接近的文本片段
3. **mtime 变更检查**：利用已有的 `FileReadCache.check(stats)` 返回的 `'stale'` 状态

**精确插入点**：

```
packages/core/src/utils/editHelper.ts
  └── findMatchedSlice() 函数末尾（约 L310）
      └── 在所有 LINE_COMPARISON_PASSES 都失败后
          └── 新增：fuzzyMatchFallback(content, oldString)

packages/core/src/tools/edit.ts
  └── calculateEdit() 方法中 occurrences === 0 分支（约 L275）
      └── 新增：调用 fuzzyMatchFallback 获取建议
      └── 新增：调用 fileReadCache.check() 检查 staleness
      └── 修改：错误消息中包含 closestMatch 建议

packages/core/src/tools/priorReadEnforcement.ts
  └── checkPriorRead() 方法
      └── 已有：验证是否读过文件
      └── 新增：如果读过但 fileReadCache 返回 'stale'，返回 FILE_CHANGED 错误
```

---

## 对 #3 文件变更感知的修正

### 原设计假设

> 需要新建 ReadCache 类

### 修正后的精确方案

**已有基础设施**：`FileReadCache` 类（`packages/core/src/services/fileReadCache.ts`）

```typescript
// 已有的核心接口
export class FileReadCache {
  private readonly byInode = new Map<string, FileReadEntry>();
  static readonly MAX_ENTRIES = 4096;  // 比我们设计的 50 大得多！

  check(stats: fs.Stats): 'fresh' | 'stale' | 'unknown';
  recordRead(absPath: string, stats: fs.Stats, opts: {...}): void;
}

export interface FileReadEntry {
  inodeKey: string;       // `${dev}:${ino}` 级别
  realPath: string;
  mtimeMs: number;
  sizeBytes: number;
  lastReadAt?: number;
  lastWriteAt?: number;   // 已有写入追踪！
  lastReadWasFull: boolean;
  lastReadCacheable: boolean;
  readResidentInHistory: boolean;
}
```

**已有的快速路径**：read_file 工具在 `cache.check(stats) === 'fresh'` 时返回 `file_unchanged` 占位符。

**缺失的部分**（需要新增）：

1. **变更通知注入**：当 `cache.check(stats) === 'stale'` 时，在 system-reminder 中注入通知
2. **批量 staleness 检查**：在 LLM 调用前，检查所有缓存文件的 staleness

**精确插入点**：

```
packages/core/src/core/client.ts
  └── sendMessageStream() 方法中 systemReminders 组装处（约 L2441-2500）
      └── 新增：调用 fileReadCache.getStalePaths() 获取过期文件列表
      └── 新增：生成 <system-reminder> 文件变更通知

packages/core/src/services/fileReadCache.ts
  └── 新增方法：getStalePaths(): Promise<string[]>
      └── 遍历 byInode，对每个 entry 做 fs.stat + 比较 mtime/size
      └── 返回 stale 的文件路径列表
```

---

## 对 #4 语义约束的修正

### 原设计假设

> 在 coreToolScheduler 中新增 checkGlobalConstraints 函数

### 修正后的精确方案

**已有基础设施**：`LoopDetectionService` 的两层架构

```
Always-on 层（不可关闭）：
  ├── checkToolCallLoop（5次连续相同）
  ├── checkShellCommandStagnation（8次）
  └── checkTurnToolCallCap（100/1000）

Opt-in 启发式层（可配置关闭）：
  ├── checkGlobalDuplicate（6次）
  ├── checkAlternatingPattern（3个AB循环）
  ├── checkReadFileLoop（8/15窗口）
  ├── checkActionStagnation（8次）
  ├── checkContentLoop（10次）
  └── checkRepetitiveThoughts（3次）
```

**语义约束应该作为新的检测器添加到启发式层**：

```
packages/core/src/services/loopDetectionService.ts
  └── addAndCheckHeuristicLoops() 方法（约 L263）
      └── GeminiEventType.ToolCallRequest case（约 L275）
          └── 现有检测器调用列表后
              └── 新增：checkSemanticConstraints(toolCall, context)

  └── 类属性区域（约 L122-195）
      └── 新增：semanticConstraintState 跟踪字段
      └── 新增：readCache 引用（用于 edit-requires-recent-read 检查）
```

**与 coreToolScheduler 的关系**：

- LoopDetectionService 的检测结果是 `GeminiEventType.LoopDetected` 事件
- 语义约束的 `warning` 级别可以通过 system-reminder 注入（不阻止执行）
- 语义约束的 `error` 级别需要与 LoopDetected 事件一样阻止执行

---

## 对 #1 Skills 升级的修正

### 精确插入点

```
packages/core/src/skills/types.ts
  └── SkillConfig 接口
      └── 新增：blueprint?: ProceduralBlueprint
      └── 新增：constraints?: CompositionalConstraint[]

packages/core/src/skills/skill-load.ts
  └── parseSkillFrontmatter() 函数
      └── 新增：解析 blueprint 和 constraints YAML 字段

packages/core/src/skills/skill-manager.ts
  └── matchAndActivateByPaths() 方法（约 L480）
      └── 新增：激活 Skill 时编译 constraints 为运行时检查器
      └── 新增：维护 activeSkillConstraints 状态

packages/core/src/core/coreToolScheduler.ts
  └── reminderBlocks 收集逻辑（约 L4386-4472）
      └── 新增：如果 activeSkill 有 blueprint，注入进度追踪 reminder
      └── 新增：如果 activeSkill 有 constraints，在工具执行前检查
```

---

## 对 #5 纠正记忆的修正

### 精确插入点

```
packages/core/src/core/client.ts
  └── sendMessageStream() 方法
      └── 用户消息处理处（约 L2441）
          └── 新增：correctionMemory.processUserMessage(userText)
      └── systemReminders 组装处（约 L2493）
          └── 新增：correctionMemory.compileReminder() → push 到 systemReminders
      └── 每轮结束时
          └── 新增：correctionMemory.tick()

packages/core/src/services/
  └── 新增文件：correction-memory.ts（独立模块，无外部依赖）
```

---

## 总结：实施复杂度重新评估

| #   | 改进项       | 原评估 | 修正后评估 | 原因                                                   |
| --- | ------------ | ------ | ---------- | ------------------------------------------------------ |
| 2   | edit 预校验  | 低     | **极低**   | 已有 priorReadEnforcement + editHelper + FileReadCache |
| 3   | 文件变更感知 | 低     | **极低**   | FileReadCache 已有 stale 检测，只需添加通知注入        |
| 4   | 语义约束     | 中     | **低**     | LoopDetectionService 已有扩展框架                      |
| 1   | Skills 升级  | 中     | 中         | 需要新的 schema 解析 + 运行时检查                      |
| 5   | 纠正记忆     | 中     | **低**     | 独立模块，插入点明确                                   |
| 6   | 工具缓存     | 低     | **已实现** | FileReadCache 的 `file_unchanged` 快速路径已存在       |
| 7   | TUI 可视化   | 高     | 高         | 纯前端，无变化                                         |

**重大发现**：#6 工具调用缓存实际上**已经实现了**！`FileReadCache` 在 `check() === 'fresh'` 时返回 `file_unchanged` 占位符，避免了重复读取的 token 浪费。

---

## 建议的修订实施顺序

```
Phase 1（3-5 天，极低风险）
  #2 edit fuzzy match — 在 editHelper.ts 的 findMatchedSlice 后添加
  #3 文件变更通知 — 在 client.ts 的 systemReminders 中添加 stale 检查

Phase 2（1-2 周）
  #4 语义约束检测器 — 在 LoopDetectionService 中添加新检测器
  #5 纠正记忆 — 新建 correction-memory.ts + 插入 client.ts

Phase 3（2-3 周）
  #1 Skills schema 升级 — 扩展 types.ts + skill-load.ts + 运行时检查

Phase 4（可选）
  #7 TUI 可视化
```
