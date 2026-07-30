/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamingState, ToolCallStatus } from '../types.js';
import type {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../types.js';

// ─── 中文动词映射 ─────────────────────────────────────────────────────────────
// 思考链里的工具动作显示为中文动词。键是工具的 displayName（见 core 的
// ToolDisplayNames），同时覆盖若干历史显示名。未命中时回退到“调用”。

const TOOL_VERB_ZH: Record<string, string> = {
  Edit: '编辑',
  WriteFile: '写入',
  ReadFile: '读取',
  ZoomImage: '放大图像',
  Grep: '搜索内容',
  SearchFiles: '搜索内容',
  Glob: '查找文件',
  FindFiles: '查找文件',
  Shell: '执行命令',
  TodoList: '更新任务',
  TodoWrite: '更新任务',
  SaveMemory: '保存记忆',
  Agent: '派发子代理',
  Task: '派发子代理',
  Skill: '调用技能',
  ExitPlanMode: '提交计划',
  EnterPlanMode: '进入计划',
  WebFetch: '抓取网页',
  WebSearch: '网络搜索',
  ImageGen: '生成图像',
  ListFiles: '列出目录',
  ReadFolder: '列出目录',
  Lsp: '语言服务',
  AskUserQuestion: '询问用户',
  Monitor: '监控输出',
  NotebookEdit: '编辑笔记本',
  ToolSearch: '检索工具',
  ReadMcpResource: '读取资源',
  EnterWorktree: '进入工作树',
  ExitWorktree: '退出工作树',
  Workflow: '工作流',
  Artifact: '生成产物',
  RecordArtifact: '记录产物',
  Goal: '更新目标',
  UpdateGoal: '更新目标',
  SendMessage: '发送消息',
  CreateSubSession: '创建子会话',
  ListAgents: '列出代理',
  TaskStop: '停止任务',
};

export function toolVerbZh(displayName: string): string {
  return TOOL_VERB_ZH[displayName] ?? '调用';
}

// ─── 小工具 ───────────────────────────────────────────────────────────────────

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

/** 取描述里第一个出现的文件路径；没有则截断描述文本。 */
export function describeTarget(description: string | undefined): string {
  const desc = description?.trim();
  if (!desc) return '';
  const match = desc.match(/(?:[\w./~-]+)?[\\/][\w./~-]+/);
  if (match) return baseName(match[0]);
  return desc.length > 28 ? `${desc.slice(0, 28)}…` : desc;
}

// ─── 思考链 ───────────────────────────────────────────────────────────────────

export type ChainStepKind = 'thought' | 'action' | 'discovery' | 'memory';

export interface ChainStep {
  kind: ChainStepKind;
  /** 中文标签，如“读取 read-file.ts”“思考：分析布局”。 */
  label: string;
  /** 次要说明（工具 displayName / 思考描述），可为空。 */
  detail?: string;
  ts?: number;
  /** 正在执行（来自在途项）。 */
  active?: boolean;
  /** 失败的动作。 */
  failed?: boolean;
}

const CHAIN_ICONS: Record<ChainStepKind, string> = {
  thought: '🧠',
  action: '🔧',
  discovery: '💡',
  memory: '📝',
};

export function chainIcon(kind: ChainStepKind): string {
  return CHAIN_ICONS[kind];
}

/** 剥掉思考主题里成对的 markdown 粗体标记（`**主题**`）。 */
function stripThoughtMarkers(text: string): string {
  return text.replace(/\*\*/g, '').trim();
}

function stepFromTool(tool: IndividualToolCallDisplay): ChainStep {
  const failed = tool.status === ToolCallStatus.Error;
  const target = describeTarget(tool.description);
  return {
    kind: 'action',
    label: `${toolVerbZh(tool.name)}${target ? ` ${target}` : ''}`,
    detail: tool.name,
    active: tool.status === ToolCallStatus.Executing,
    failed,
  };
}

/**
 * 把历史项与在途项串成一条有序思考链：思考 → 动作 → 发现（工具批次摘要）→
 * 记忆写入。在途项中正在执行的工具标记为 active。只保留最近 maxSteps 条。
 */
export function buildThinkingChain(
  history: readonly HistoryItemWithoutId[],
  pending: readonly HistoryItemWithoutId[],
  maxSteps = 12,
): ChainStep[] {
  const steps: ChainStep[] = [];

  const pushFromItems = (items: readonly HistoryItemWithoutId[]) => {
    for (const item of items) {
      switch (item.type) {
        case 'tool_group':
          for (const tool of item.tools) steps.push(stepFromTool(tool));
          break;
        case 'gemini_thought': {
          const subject = item.text ? stripThoughtMarkers(item.text) : '';
          if (subject) {
            steps.push({
              kind: 'thought',
              label: `思考：${subject.length > 24 ? `${subject.slice(0, 24)}…` : subject}`,
              detail: item.durationMs
                ? `${(item.durationMs / 1000).toFixed(1)}s`
                : undefined,
            });
          }
          break;
        }
        case 'tool_use_summary':
          if (item.summary?.trim()) {
            steps.push({ kind: 'discovery', label: item.summary.trim() });
          }
          break;
        case 'memory_saved':
          steps.push({
            kind: 'memory',
            label: `${item.verb === 'Updated' ? '更新' : '保存'}记忆 ×${item.writtenCount}`,
          });
          break;
        default:
          break;
      }
    }
  };

  pushFromItems(history);
  pushFromItems(pending);

  return steps.slice(-maxSteps);
}

// ─── 系统记忆面板 ─────────────────────────────────────────────────────────────

export interface MemoryPanel {
  /** 加载进上下文的记忆文件总 token（来自最近一次 /context 统计）。 */
  memoryTokens: number;
  files: Array<{ path: string; tokens: number }>;
  recentReads: number;
  recentWrites: number;
}

/**
 * 汇总系统记忆：最近一次 context_usage 里的记忆文件清单，加上最近若干个
 * 工具批次对托管记忆文件的读写次数。
 */
export function buildMemoryPanel(
  history: readonly HistoryItemWithoutId[],
  maxFiles = 6,
  recentGroups = 12,
): MemoryPanel {
  let memoryTokens = 0;
  let files: Array<{ path: string; tokens: number }> = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item?.type === 'context_usage') {
      memoryTokens = item.breakdown.memoryFiles;
      files = [...item.memoryFiles]
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, maxFiles);
      break;
    }
  }

  let recentReads = 0;
  let recentWrites = 0;
  let seen = 0;
  for (let i = history.length - 1; i >= 0 && seen < recentGroups; i--) {
    const item = history[i];
    if (item?.type !== 'tool_group') continue;
    seen++;
    recentReads += item.memoryReadCount ?? 0;
    recentWrites += item.memoryWriteCount ?? 0;
  }

  return { memoryTokens, files, recentReads, recentWrites };
}

// ─── 类知识图谱 ───────────────────────────────────────────────────────────────

export interface GraphNode {
  /** 文件基名。 */
  node: string;
  /** 触及过它的工具 displayName 集合。 */
  tools: string[];
  count: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  /** 参与过工具调用的文件总数（含被截断的）。 */
  totalFiles: number;
}

const PATH_RE = /(?:[\w./~-]+)?[\\/][\w./~-]+/g;

/**
 * 从工具描述里抽取文件路径作为节点，统计每个文件被哪些工具触及、触及几次，
 * 形成一个轻量的“文件—工具”关联图（ASCII 渲染，非力导向图）。
 */
export function buildKnowledgeGraph(
  history: readonly HistoryItemWithoutId[],
  maxNodes = 10,
): KnowledgeGraph {
  const map = new Map<string, { tools: Set<string>; count: number }>();

  for (const item of history) {
    if (item.type !== 'tool_group') continue;
    for (const tool of item.tools) {
      const desc = tool.description ?? '';
      const matches = desc.match(PATH_RE);
      if (!matches) continue;
      for (const raw of matches) {
        const name = baseName(raw);
        if (!name || name.length > 40) continue;
        const entry = map.get(name) ?? { tools: new Set<string>(), count: 0 };
        entry.tools.add(tool.name);
        entry.count++;
        map.set(name, entry);
      }
    }
  }

  const nodes: GraphNode[] = [...map.entries()]
    .map(([node, v]) => ({ node, tools: [...v.tools], count: v.count }))
    .sort((a, b) => b.count - a.count || a.node.localeCompare(b.node));

  return { nodes: nodes.slice(0, maxNodes), totalFiles: map.size };
}

// ─── 生命周期 ─────────────────────────────────────────────────────────────────

export type LifecyclePhase =
  | 'starting'
  | 'running'
  | 'waiting'
  | 'stalled'
  | 'completed'
  | 'interrupted'
  | 'broke';

export const PHASE_LABEL_ZH: Record<LifecyclePhase, string> = {
  starting: '启动中',
  running: '进行中',
  waiting: '等待确认',
  stalled: '停滞',
  completed: '已完成',
  interrupted: '已中断',
  broke: '已跳出',
};

export interface PhaseInput {
  streamingState: StreamingState;
  elapsedSeconds: number;
  /** 当前是否有工具正在执行。 */
  hasExecutingTool: boolean;
  /** 当前工具已执行时长（毫秒），无执行中工具时忽略。 */
  executingForMs?: number;
  /** 超过该毫秒数仍无执行中工具/无新进展视为停滞。 */
  stallMs?: number;
  /** 回合开始后多少秒内算“启动中”。 */
  startingWithinSeconds?: number;
}

/**
 * 推导运行期生命周期阶段。终态（completed/interrupted/broke）发生在回合结束
 * 后，由组件在 Responding→Idle 跳变时通过 resolveTerminalPhase 锁定。
 */
export function derivePhase(input: PhaseInput): LifecyclePhase {
  const {
    streamingState,
    elapsedSeconds,
    hasExecutingTool,
    executingForMs = 0,
    stallMs = 20_000,
    startingWithinSeconds = 3,
  } = input;

  if (streamingState === StreamingState.WaitingForConfirmation) {
    return 'waiting';
  }
  if (streamingState !== StreamingState.Responding) {
    return 'completed';
  }
  if (hasExecutingTool && executingForMs >= stallMs) {
    return 'stalled';
  }
  if (elapsedSeconds <= startingWithinSeconds) {
    return 'starting';
  }
  return 'running';
}

export interface TerminalSignals {
  /** 用户按了 Ctrl+C 中断。 */
  interrupted: boolean;
  /** 触发循环检测（agent 自己跳出了循环）。 */
  loopDetected: boolean;
}

/** 回合结束时根据信号锁定终态。 */
export function resolveTerminalPhase(signals: TerminalSignals): LifecyclePhase {
  if (signals.loopDetected) return 'broke';
  if (signals.interrupted) return 'interrupted';
  return 'completed';
}
