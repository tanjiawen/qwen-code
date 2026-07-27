# 设计文档 #2：edit 预校验（Request-Validate-Commit 协议）

> 优先级：P0  
> 预期收益：减少 15-20% 的无效工具调用轮次  
> 难度：低  
> 影响范围：`packages/core/src/tools/edit/`、`packages/core/src/core/coreToolScheduler.ts`

## 1. 问题陈述

当前 edit 工具的执行流程：

```
LLM 发出 edit(old_string, new_string)
  → coreToolScheduler 权限检查 ✅
  → edit.execute() 尝试匹配 old_string
  → 匹配失败 → 返回错误 "old_string not found in file"
  → LLM 收到错误 → 重新 read_file → 再次 edit
  → 浪费 1-2 轮 LLM 调用（约 3-5 秒 + token 成本）
```

**DataFlow-Harness 的启示**：在 typed mutations 模式下，Schema 不兼容的连接在**提交前**就被挡住，避免了无效执行。Qwen Code 的 edit 工具应该在执行前做预校验。

## 2. 设计方案

### 2.1 新增预校验阶段

在 `coreToolScheduler` 的工具执行流程中，在权限检查之后、实际执行之前，插入一个 **pre-validation** 阶段：

```
当前流程：
  schema 校验 → 权限检查 → execute()

改进流程：
  schema 校验 → 权限检查 → preValidate() → execute()
                                    │
                                    ├── 通过 → 继续执行
                                    └── 失败 → 返回结构化建议（不执行）
```

### 2.2 edit 工具的 preValidate 实现

```typescript
// packages/core/src/tools/edit/edit-prevalidation.ts

interface EditPreValidationResult {
  valid: boolean;
  // 校验失败时的结构化反馈
  suggestion?: {
    type:
      | 'not_found'
      | 'multiple_matches'
      | 'whitespace_mismatch'
      | 'file_changed';
    message: string;
    // fuzzy match 建议
    closestMatch?: {
      lineStart: number;
      lineEnd: number;
      content: string;
      similarity: number; // 0-1
    };
    // 文件是否在上次 read 后被修改
    fileModifiedSinceRead?: boolean;
    lastReadTime?: number;
    currentMtime?: number;
  };
}

function preValidateEdit(params: {
  filePath: string;
  oldString: string;
  fileContent: string; // 当前文件内容
  lastReadMtime?: number; // 上次 read_file 时的 mtime
  currentMtime: number; // 当前 mtime
}): EditPreValidationResult {
  const { filePath, oldString, fileContent, lastReadMtime, currentMtime } =
    params;

  // 检查 1：文件是否在上次读取后被修改
  if (lastReadMtime && currentMtime > lastReadMtime) {
    return {
      valid: false,
      suggestion: {
        type: 'file_changed',
        message: `文件 ${filePath} 在上次读取后已被修改（可能由用户或外部进程）。请重新 read_file 获取最新内容后再编辑。`,
        fileModifiedSinceRead: true,
        lastReadTime: lastReadMtime,
        currentMtime,
      },
    };
  }

  // 检查 2：old_string 是否存在于文件中
  const matchCount = countOccurrences(fileContent, oldString);

  if (matchCount === 0) {
    // 尝试 fuzzy match
    const closest = findClosestMatch(fileContent, oldString);
    return {
      valid: false,
      suggestion: {
        type: closest ? 'whitespace_mismatch' : 'not_found',
        message: closest
          ? `old_string 未精确匹配，但在第 ${closest.lineStart}-${closest.lineEnd} 行找到相似内容（相似度 ${(closest.similarity * 100).toFixed(0)}%）。可能是空白字符差异。建议使用以下内容的精确副本：\n\`\`\`\n${closest.content}\n\`\`\``
          : `old_string 未在文件中找到。请确认：(1) 是否先调用了 read_file？(2) old_string 是否与文件内容完全一致（包括缩进和换行）？`,
        closestMatch: closest || undefined,
      },
    };
  }

  if (matchCount > 1) {
    return {
      valid: false,
      suggestion: {
        type: 'multiple_matches',
        message: `old_string 在文件中出现了 ${matchCount} 次。请提供更多上下文使其唯一，或设置 replace_all: true。`,
      },
    };
  }

  return { valid: true };
}
```

### 2.3 模糊匹配算法

```typescript
// 基于行级别的 Levenshtein 相似度
function findClosestMatch(
  fileContent: string,
  oldString: string,
  threshold: number = 0.7,
): {
  lineStart: number;
  lineEnd: number;
  content: string;
  similarity: number;
} | null {
  const fileLines = fileContent.split('\n');
  const targetLines = oldString.split('\n');
  const targetLen = targetLines.length;

  let bestScore = 0;
  let bestStart = -1;

  // 滑动窗口：在文件中找与 old_string 行数相同的窗口
  for (let i = 0; i <= fileLines.length - targetLen; i++) {
    const window = fileLines.slice(i, i + targetLen).join('\n');
    const score = lineSimilarity(window, oldString);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  if (bestScore >= threshold && bestStart >= 0) {
    return {
      lineStart: bestStart + 1,
      lineEnd: bestStart + targetLen,
      content: fileLines.slice(bestStart, bestStart + targetLen).join('\n'),
      similarity: bestScore,
    };
  }
  return null;
}

// 行级别相似度：忽略行尾空白后比较
function lineSimilarity(a: string, b: string): number {
  const linesA = a.split('\n').map((l) => l.trimEnd());
  const linesB = b.split('\n').map((l) => l.trimEnd());
  if (linesA.length !== linesB.length) return 0;

  let matchCount = 0;
  for (let i = 0; i < linesA.length; i++) {
    if (linesA[i] === linesB[i]) matchCount++;
    else if (linesA[i].trim() === linesB[i].trim()) matchCount += 0.8; // 仅缩进不同
  }
  return matchCount / linesA.length;
}
```

### 2.4 集成到 coreToolScheduler

```typescript
// packages/core/src/core/coreToolScheduler.ts
// 在 executeToolCalls 方法中，权限检查通过后、实际执行前插入：

// 现有代码位置：权限检查通过后
if (preValidationEnabled && tool.name === 'edit') {
  const fileContent = await readFileForValidation(tool.params.file_path);
  const currentMtime = await getFileMtime(tool.params.file_path);
  const lastReadMtime = readCache.getMtime(tool.params.file_path);

  const result = preValidateEdit({
    filePath: tool.params.file_path,
    oldString: tool.params.old_string,
    fileContent,
    lastReadMtime,
    currentMtime,
  });

  if (!result.valid) {
    // 不执行工具，直接返回结构化建议
    return {
      toolResult: {
        content: result.suggestion!.message,
        isError: true,
        metadata: { preValidationFailed: true, ...result.suggestion },
      },
    };
  }
}
```

### 2.5 配置项

```jsonc
// settings.json
{
  "tools": {
    "edit": {
      "preValidation": true, // 是否启用预校验
      "fuzzyMatchThreshold": 0.7, // 模糊匹配阈值
      "checkFileMtime": true, // 是否检查文件修改时间
    },
  },
}
```

## 3. 预期效果

| 场景                | 当前行为             | 改进后行为                    |
| ------------------- | -------------------- | ----------------------------- |
| old_string 不存在   | 执行后返回错误       | 预校验拦截 + fuzzy match 建议 |
| 文件被外部修改      | 执行后可能匹配错位置 | 预校验拦截 + 提示重新读取     |
| old_string 多次出现 | 执行后返回错误       | 预校验拦截 + 提示加上下文     |
| 空白字符差异        | 执行后返回错误       | 预校验拦截 + 显示最接近的匹配 |

**预期减少的无效轮次**：根据 DataFlow-Harness 的实验数据类比，edit 失败率约 15-20%，预校验可在执行前拦截 80%+ 的失败情况。

## 4. 测试计划

- 单元测试：`edit-prevalidation.test.ts`
  - 精确匹配通过
  - 不存在时返回 fuzzy match
  - 多次匹配时提示
  - 文件修改后拦截
  - 空白差异检测
- 集成测试：模拟 LLM 发出错误 edit → 验证预校验拦截 → 验证 LLM 收到建议后修正

## 5. 风险与缓解

| 风险             | 缓解措施                                   |
| ---------------- | ------------------------------------------ |
| 预校验增加延迟   | 文件读取可复用 readCache，mtime 检查 < 1ms |
| fuzzy match 误报 | 阈值 0.7 保守设置，只建议不自动修正        |
| 向后兼容         | `preValidation` 默认 true，可关闭          |
