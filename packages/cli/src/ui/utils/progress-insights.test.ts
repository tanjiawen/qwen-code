/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { StreamingState, ToolCallStatus } from '../types.js';
import type {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../types.js';
import {
  toolVerbZh,
  describeTarget,
  buildThinkingChain,
  buildMemoryPanel,
  buildKnowledgeGraph,
  derivePhase,
  resolveTerminalPhase,
  PHASE_LABEL_ZH,
} from './progress-insights.js';

// ─── 工厂 ─────────────────────────────────────────────────────────────────────

function tool(
  partial: Partial<IndividualToolCallDisplay> & { name: string },
): IndividualToolCallDisplay {
  return {
    callId: partial.callId ?? `call-${partial.name}`,
    description: partial.description ?? '',
    status: partial.status ?? ToolCallStatus.Success,
    resultDisplay: undefined,
    confirmationDetails: undefined,
    ...partial,
  };
}

function toolGroup(tools: IndividualToolCallDisplay[]): HistoryItemWithoutId {
  return { type: 'tool_group', tools };
}

// ─── 中文动词映射 ─────────────────────────────────────────────────────────────

describe('toolVerbZh', () => {
  it('把已知 displayName 映射为中文动词', () => {
    expect(toolVerbZh('ReadFile')).toBe('读取');
    expect(toolVerbZh('Edit')).toBe('编辑');
    expect(toolVerbZh('Grep')).toBe('搜索内容');
    expect(toolVerbZh('Shell')).toBe('执行命令');
  });

  it('覆盖历史显示名', () => {
    expect(toolVerbZh('SearchFiles')).toBe('搜索内容');
    expect(toolVerbZh('FindFiles')).toBe('查找文件');
    expect(toolVerbZh('Task')).toBe('派发子代理');
  });

  it('未命中时回退到“调用”', () => {
    expect(toolVerbZh('SomeUnknownTool')).toBe('调用');
  });
});

describe('describeTarget', () => {
  it('从描述里提取文件基名', () => {
    expect(describeTarget('Read 5 lines from /a/b/read-file.ts')).toBe(
      'read-file.ts',
    );
    expect(describeTarget("Searched for 'foo' in /src/utils")).toBe('utils');
  });

  it('没有路径时截断描述', () => {
    expect(describeTarget('npm run build')).toBe('npm run build');
    const long = 'x'.repeat(40);
    expect(describeTarget(long)).toBe(`${'x'.repeat(28)}…`);
  });

  it('空描述返回空串', () => {
    expect(describeTarget(undefined)).toBe('');
    expect(describeTarget('  ')).toBe('');
  });
});

// ─── 思考链 ───────────────────────────────────────────────────────────────────

describe('buildThinkingChain', () => {
  it('按顺序串起思考、动作、发现、记忆', () => {
    const history: HistoryItemWithoutId[] = [
      { type: 'gemini_thought', text: '**分析布局**', durationMs: 1500 },
      toolGroup([tool({ name: 'ReadFile', description: 'Read /src/App.tsx' })]),
      {
        type: 'tool_use_summary',
        summary: 'Searched in auth/',
        precedingToolUseIds: [],
      },
      { type: 'memory_saved', writtenCount: 2 },
    ];

    const chain = buildThinkingChain(history, []);
    expect(chain.map((s) => s.kind)).toEqual([
      'thought',
      'action',
      'discovery',
      'memory',
    ]);
    expect(chain[0]!.label).toBe('思考：分析布局');
    expect(chain[0]!.detail).toBe('1.5s');
    expect(chain[1]!.label).toBe('读取 App.tsx');
    expect(chain[2]!.label).toBe('Searched in auth/');
    expect(chain[3]!.label).toBe('保存记忆 ×2');
  });

  it('在途项中正在执行的工具标记为 active', () => {
    const pending: HistoryItemWithoutId[] = [
      toolGroup([
        tool({
          name: 'Shell',
          description: 'npm test',
          status: ToolCallStatus.Executing,
        }),
      ]),
    ];
    const chain = buildThinkingChain([], pending);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.active).toBe(true);
    expect(chain[0]!.label).toBe('执行命令 npm test');
  });

  it('失败的工具标记 failed', () => {
    const chain = buildThinkingChain(
      [toolGroup([tool({ name: 'Edit', status: ToolCallStatus.Error })])],
      [],
    );
    expect(chain[0]!.failed).toBe(true);
  });

  it('只保留最近 maxSteps 条', () => {
    const history: HistoryItemWithoutId[] = Array.from({ length: 20 }, (_, i) =>
      toolGroup([tool({ name: 'ReadFile', callId: `c${i}` })]),
    );
    const chain = buildThinkingChain(history, [], 12);
    expect(chain).toHaveLength(12);
  });

  it('空思考文本被跳过', () => {
    const chain = buildThinkingChain(
      [{ type: 'gemini_thought', text: '   ' }],
      [],
    );
    expect(chain).toHaveLength(0);
  });
});

// ─── 系统记忆面板 ─────────────────────────────────────────────────────────────

describe('buildMemoryPanel', () => {
  it('取最近一次 context_usage 的记忆文件并按 token 排序', () => {
    const history: HistoryItemWithoutId[] = [
      {
        type: 'context_usage',
        modelName: 'm',
        totalTokens: 100,
        contextWindowSize: 1000,
        breakdown: {
          systemPrompt: 0,
          builtinTools: 0,
          mcpTools: 0,
          memoryFiles: 300,
          skills: 0,
          messages: 0,
          freeSpace: 0,
          autocompactBuffer: 0,
          thresholds: { warn: 0, auto: 0, hard: 0, effectiveWindow: 1000 },
          currentTier: 'safe',
        },
        builtinTools: [],
        mcpTools: [],
        memoryFiles: [
          { path: 'QWEN.md', tokens: 100 },
          { path: 'AGENTS.md', tokens: 200 },
        ],
        skills: [],
      },
    ];
    const panel = buildMemoryPanel(history);
    expect(panel.memoryTokens).toBe(300);
    expect(panel.files.map((f) => f.path)).toEqual(['AGENTS.md', 'QWEN.md']);
  });

  it('统计最近工具批次的记忆读写次数', () => {
    const g = (r: number, w: number): HistoryItemWithoutId => ({
      type: 'tool_group',
      tools: [],
      memoryReadCount: r,
      memoryWriteCount: w,
    });
    const panel = buildMemoryPanel([g(1, 0), g(2, 1)]);
    expect(panel.recentReads).toBe(3);
    expect(panel.recentWrites).toBe(1);
  });

  it('无 context_usage 时归零', () => {
    const panel = buildMemoryPanel([]);
    expect(panel.memoryTokens).toBe(0);
    expect(panel.files).toEqual([]);
  });
});

// ─── 类知识图谱 ───────────────────────────────────────────────────────────────

describe('buildKnowledgeGraph', () => {
  it('从工具描述提取文件节点并聚合触及工具', () => {
    const history: HistoryItemWithoutId[] = [
      toolGroup([tool({ name: 'ReadFile', description: 'Read /src/foo.ts' })]),
      toolGroup([tool({ name: 'Edit', description: 'Edited /src/foo.ts' })]),
      toolGroup([tool({ name: 'ReadFile', description: 'Read /src/bar.ts' })]),
    ];
    const graph = buildKnowledgeGraph(history);
    expect(graph.totalFiles).toBe(2);
    expect(graph.nodes[0]!.node).toBe('foo.ts');
    expect(graph.nodes[0]!.count).toBe(2);
    expect(graph.nodes[0]!.tools.sort()).toEqual(['Edit', 'ReadFile']);
  });

  it('按触及次数降序排列', () => {
    const history: HistoryItemWithoutId[] = [
      toolGroup([tool({ name: 'ReadFile', description: 'Read /a/one.ts' })]),
      toolGroup([tool({ name: 'ReadFile', description: 'Read /a/two.ts' })]),
      toolGroup([tool({ name: 'Edit', description: 'Edit /a/two.ts' })]),
    ];
    const graph = buildKnowledgeGraph(history);
    expect(graph.nodes.map((n) => n.node)).toEqual(['two.ts', 'one.ts']);
  });

  it('无路径的描述不产生节点', () => {
    const graph = buildKnowledgeGraph([
      toolGroup([tool({ name: 'Shell', description: 'npm run build' })]),
    ]);
    expect(graph.nodes).toEqual([]);
    expect(graph.totalFiles).toBe(0);
  });
});

// ─── 生命周期 ─────────────────────────────────────────────────────────────────

describe('derivePhase', () => {
  const base = {
    elapsedSeconds: 10,
    hasExecutingTool: false,
  };

  it('等待确认优先', () => {
    expect(
      derivePhase({
        ...base,
        streamingState: StreamingState.WaitingForConfirmation,
      }),
    ).toBe('waiting');
  });

  it('非响应态视为已完成', () => {
    expect(derivePhase({ ...base, streamingState: StreamingState.Idle })).toBe(
      'completed',
    );
  });

  it('工具执行超时视为停滞', () => {
    expect(
      derivePhase({
        ...base,
        streamingState: StreamingState.Responding,
        hasExecutingTool: true,
        executingForMs: 25_000,
      }),
    ).toBe('stalled');
  });

  it('回合刚开始视为启动中', () => {
    expect(
      derivePhase({
        ...base,
        streamingState: StreamingState.Responding,
        elapsedSeconds: 1,
      }),
    ).toBe('starting');
  });

  it('正常响应视为进行中', () => {
    expect(
      derivePhase({
        ...base,
        streamingState: StreamingState.Responding,
      }),
    ).toBe('running');
  });
});

describe('resolveTerminalPhase', () => {
  it('循环检测优先于中断', () => {
    expect(
      resolveTerminalPhase({ interrupted: true, loopDetected: true }),
    ).toBe('broke');
  });

  it('用户中断', () => {
    expect(
      resolveTerminalPhase({ interrupted: true, loopDetected: false }),
    ).toBe('interrupted');
  });

  it('正常完成', () => {
    expect(
      resolveTerminalPhase({ interrupted: false, loopDetected: false }),
    ).toBe('completed');
  });
});

describe('PHASE_LABEL_ZH', () => {
  it('每个阶段都有中文标签', () => {
    expect(PHASE_LABEL_ZH.starting).toBe('启动中');
    expect(PHASE_LABEL_ZH.stalled).toBe('停滞');
    expect(PHASE_LABEL_ZH.broke).toBe('已跳出');
    expect(Object.keys(PHASE_LABEL_ZH)).toHaveLength(7);
  });
});
