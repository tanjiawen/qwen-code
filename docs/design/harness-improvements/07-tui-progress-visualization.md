# 设计文档 #7：TUI 任务进度可视化

> 优先级：P2  
> 预期收益：提升可审计性，让用户一眼看出 Agent 是否在走弯路  
> 难度：高  
> 影响范围：`packages/cli/src/ui/`  
> 独立于其他改进，不阻塞后端工作

## 1. 问题陈述

DataFlow-WebUI 的 DAG 画布让工程师一眼看出流程错误。Qwen Code 的 TUI 当前是线性文本流，用户很难快速判断：

- Agent 当前的整体策略是什么？
- 它是不是在做无用功？
- 任务完成到哪一步了？

## 2. 设计方案

### 2.1 侧边栏进度面板

在 TUI 右侧（或 Ctrl+O 展开）显示结构化进度：

```
┌─────────────────────────────────────────────────────────┐
│  Agent 输出区域                        │ 📋 任务进度     │
│                                        │                 │
│  正在编辑 src/auth.ts...               │ ✅ 读取文件     │
│                                        │ ✅ 分析问题     │
│                                        │ 🔄 编辑代码     │
│                                        │ ⬜ 运行测试     │
│                                        │ ⬜ 验证结果     │
│                                        │                 │
│                                        │ 📊 工具调用: 5  │
│                                        │ ⏱️  耗时: 12s   │
│                                        │ 🔧 当前: edit   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据来源

```typescript
// packages/cli/src/ui/components/ProgressPanel.tsx

interface ProgressState {
  /** 来自 todo_write 的任务列表 */
  todos: TodoItem[];

  /** 最近工具调用摘要 */
  recentTools: {
    name: string;
    target?: string;
    status: 'running' | 'done' | 'error';
  }[];

  /** 当前激活的 Skill */
  activeSkill?: string;

  /** 语义约束触发记录 */
  constraintWarnings: string[];

  /** 统计 */
  stats: {
    toolCallCount: number;
    elapsedSeconds: number;
    tokenUsage: number;
  };
}
```

### 2.3 工具调用 DAG 视图（可选，高级功能）

按 Ctrl+G 切换为 DAG 视图，显示工具调用的依赖关系：

```
read_file(auth.ts) ──→ grep_search("login") ──→ edit(auth.ts) ──→ shell(npm test)
                                                        ↑
read_file(test.ts) ─────────────────────────────────────┘
```

### 2.4 决策点高亮

当 Agent 做了关键决策时（如选择方案 A 而非 B），在进度面板中高亮标注：

```
⚡ 决策: 选择 JWT 而非 Session（因为无状态需求）
⚡ 决策: 修改 auth.ts 而非 middleware.ts（因为逻辑归属）
```

## 3. 实现复杂度

这是纯前端工作，不涉及核心引擎修改。主要工作：

- 新增 `ProgressPanel` 组件
- 从 AppContainer 的 state 中提取进度数据
- 键盘快捷键绑定（Ctrl+O 切换面板）

## 4. 分期实施

- **Phase 1**：简单的工具调用计数器 + 当前工具名显示
- **Phase 2**：todo_write 进度条 + 最近工具列表
- **Phase 3**：DAG 视图 + 决策点高亮

## 5. 测试计划

- 组件测试：ProgressPanel 渲染
- 快照测试：各种状态下的 UI 截图
