/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ToolCallStatus, StreamingState } from '../types.js';
import {
  selectLiveSnapshot,
  uiTelemetryService,
  DEFAULT_TOKEN_LIMIT,
  type MetricProvenance,
} from '@qwen-code/qwen-code-core';
import {
  buildThinkingChain,
  buildMemoryPanel,
  buildKnowledgeGraph,
  chainIcon,
  derivePhase,
  resolveTerminalPhase,
  PHASE_LABEL_ZH,
  type LifecyclePhase,
  type BetterHarnessSeverity,
} from '../utils/progress-insights.js';
import {
  useBetterHarnessPanel,
  useHarnessStatus,
} from '../hooks/use-better-harness-panel.js';
import { HarnessStatusBody } from './HarnessStatusBody.js';

const POLL_INTERVAL_MS = 1000;
const BAR_WIDTH = 14;
const FILLED = '\u2588'; // █
const EMPTY = '\u2591'; // ░

type RightMode = 'chain' | 'memory' | 'graph';
const MODE_CYCLE: RightMode[] = ['chain', 'memory', 'graph'];
const MODE_LABEL_ZH: Record<RightMode, string> = {
  chain: '思考链',
  memory: '系统记忆',
  graph: '知识图谱',
};

// Better Harness 第三列：终端宽于该值时三列并排，否则降级为下方整行。
const THREE_COLUMN_MIN_WIDTH = 110;
const SEVERITY_LABEL_ZH: Record<BetterHarnessSeverity, string> = {
  Critical: '严重',
  High: '高',
  Medium: '中',
  Low: '低',
};

// 五维短标签（2 字，4 可视列），避免在窄列里换行；未知 id 回退到面板 label。
const BH_DIMENSION_SHORT_ZH: Record<string, string> = {
  'task-understanding': '任务',
  'controlled-execution': '执行',
  'change-validation': '验证',
  'reliable-delivery': '交付',
  'learning-capture': '学习',
};

function bhDimensionLabel(id: string, label: string): string {
  return BH_DIMENSION_SHORT_ZH[id] ?? label.slice(0, 2);
}

function severityColor(severity: BetterHarnessSeverity): string {
  switch (severity) {
    case 'Critical':
      return theme.status.error;
    case 'High':
      return theme.status.warning;
    default:
      return theme.text.secondary;
  }
}

// ─── 格式化 ───────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

// ─── 数据来源标记 ─────────────────────────────────────────────────────────────
// 派生数值标注来源：measured 不加标记；estimated/proxy 加后缀，避免把估算当实测。

function provenanceGlyph(p: MetricProvenance): string {
  if (p === 'estimated') return '~';
  if (p === 'proxy') return '≈';
  return '';
}

const Provenance: React.FC<{ of: MetricProvenance }> = ({ of }) => {
  const glyph = provenanceGlyph(of);
  if (!glyph) return null;
  return <Text color={theme.status.warning}>{glyph}</Text>;
};

// ─── 基础元件 ─────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct > 80) return theme.status.error;
  if (pct > 60) return theme.status.warning;
  return theme.status.success;
}

const Bar: React.FC<{ pct: number; width?: number }> = ({
  pct,
  width = BAR_WIDTH,
}) => {
  const clamped = Math.max(0, Math.min(pct, 100));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color={pctColor(clamped)}>{FILLED.repeat(filled)}</Text>
      <Text color={theme.text.secondary}>{EMPTY.repeat(empty)}</Text>
    </Text>
  );
};

// 固定宽度标签列 + 数值的一行指标。
const Stat: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <Box>
    <Box width={7}>
      <Text dimColor>{label}</Text>
    </Box>
    <Box flexGrow={1}>
      <Text>{children}</Text>
    </Box>
  </Box>
);

// 生命周期阶段徽章。
function phaseColor(phase: LifecyclePhase): string {
  switch (phase) {
    case 'completed':
      return theme.status.success;
    case 'waiting':
    case 'starting':
    case 'stalled':
      return theme.status.warning;
    case 'interrupted':
    case 'broke':
      return theme.status.error;
    case 'running':
    default:
      return theme.text.link;
  }
}

const PhaseBadge: React.FC<{ phase: LifecyclePhase }> = ({ phase }) => (
  <Text bold color={phaseColor(phase)}>
    【{PHASE_LABEL_ZH[phase]}】
  </Text>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export const ProgressPanel: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const { sessionStats, pendingHistoryItems, history } = uiState;

  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [modeIdx, setModeIdx] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const isResponding = uiState.streamingState === StreamingState.Responding;

  useKeypress(
    (key) => {
      if (key.name === 't') setExpanded((v) => !v);
      else if (key.name === 'm') setModeIdx((i) => (i + 1) % MODE_CYCLE.length);
      else if (key.name === 'd') setShowDetail((v) => !v);
    },
    { isActive: isResponding },
  );

  // 当前正在执行的工具及其已执行时长（用于停滞判断）。
  let currentTool: string | undefined;
  let executingForMs = 0;
  for (const item of pendingHistoryItems) {
    if (item.type !== 'tool_group') continue;
    for (const t of item.tools) {
      if (t.status === ToolCallStatus.Executing) {
        currentTool = t.name;
        if (t.executionStartTime) {
          executingForMs = Date.now() - t.executionStartTime;
        }
      }
    }
  }

  // 生命周期：响应中实时推导；回合结束（Responding→Idle 跳变）时锁定终态。
  const prevRespondingRef = useRef(isResponding);
  const terminalPhaseRef = useRef<LifecyclePhase>('completed');
  if (prevRespondingRef.current && !isResponding) {
    terminalPhaseRef.current = resolveTerminalPhase({
      interrupted: uiState.ctrlCPressedOnce,
      loopDetected: uiState.loopDetectionConfirmationRequest !== null,
    });
  }
  prevRespondingRef.current = isResponding;

  const phase: LifecyclePhase = isResponding
    ? derivePhase({
        streamingState: uiState.streamingState,
        elapsedSeconds: Math.floor(
          (Date.now() - sessionStats.sessionStartTime.getTime()) / 1000,
        ),
        hasExecutingTool: currentTool !== undefined,
        executingForMs,
      })
    : terminalPhaseRef.current;

  // 新回合开始时自动展开。
  useEffect(() => {
    if (isResponding) setExpanded(true);
  }, [isResponding]);

  const contextWindowSize =
    config.getContentGeneratorConfig().contextWindowSize ?? DEFAULT_TOKEN_LIMIT;

  const snapshot = selectLiveSnapshot({
    metrics: sessionStats.metrics,
    lastPromptTokenCount: sessionStats.lastPromptTokenCount,
    lastCachedTokenCount: uiTelemetryService.getLastCachedContentTokenCount(),
    contextWindowSize,
    sessionStartTime: sessionStats.sessionStartTime.getTime(),
    sessionId: sessionStats.sessionId,
    eventCount: 8,
  });

  const { context, tokens, tools, latency, cost, health } = snapshot;

  // Better Harness 第三列：最近一次审计的五维分数 + findings 概览。
  const betterHarnessPanel = useBetterHarnessPanel(process.cwd());
  const harnessStatus = useHarnessStatus(process.cwd());

  // 思考链 / 记忆 / 图谱：仅在历史增长时重算。
  const historyLen = history.length;
  const lastItemId = historyLen > 0 ? history[historyLen - 1]!.id : -1;
  const chain = useMemo(
    () => buildThinkingChain(history, pendingHistoryItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyLen, lastItemId, pendingHistoryItems],
  );
  const memoryPanel = useMemo(
    () => buildMemoryPanel(history),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyLen, lastItemId],
  );
  const graph = useMemo(
    () => buildKnowledgeGraph(history),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyLen, lastItemId],
  );

  const todos = uiState.stickyTodos;
  const totalTasks = todos?.length ?? 0;
  const doneTasks = todos?.filter((t) => t.status === 'completed').length ?? 0;

  const sessionId = snapshot.sessionId
    ? snapshot.sessionId.slice(0, 8)
    : '--------';
  const ttft = latency.lastTtftMs ?? latency.ttftMs;
  const throughput = latency.generationThroughput;
  const mode = MODE_CYCLE[modeIdx]!;

  // ─── L0：常驻状态条（始终可见）─────────────────────────────────────────────

  const statusLine = (
    <Box paddingX={1}>
      <Text bold color={theme.text.accent}>
        ⚡{' '}
      </Text>
      <Text dimColor>{formatElapsed(snapshot.elapsedSeconds)}</Text>
      <Text dimColor> 上下文 </Text>
      <Bar pct={context.usedPercent} width={8} />
      <Text color={pctColor(context.usedPercent)}>
        {' '}
        {context.usedPercent.toFixed(0)}%
      </Text>
      <Provenance of={context.provenance} />
      <Text> </Text>
      <PhaseBadge phase={phase} />
      <Text dimColor> {currentTool ? '工具 ' : ''}</Text>
      <Text>{currentTool ?? ''}</Text>
      <Text dimColor> 首字 </Text>
      <Text>{ttft != null ? formatMs(ttft) : '–'}</Text>
      <Text dimColor> 吞吐 </Text>
      <Text>{throughput != null ? `${throughput.toFixed(0)}/秒` : '–'}</Text>
      <Text dimColor> 费用 </Text>
      <Text>${cost.sessionUsd.toFixed(2)}</Text>
      <Provenance of={cost.provenance} />
      <Text> </Text>
      <Text
        color={health.apiConnected ? theme.status.success : theme.status.error}
      >
        {health.apiConnected ? '📡✓' : '📡✗'}
      </Text>
    </Box>
  );

  if (!expanded) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray">
        {statusLine}
      </Box>
    );
  }

  // ─── 左列：双列压缩指标 ─────────────────────────────────────────────────────

  const modelLine =
    snapshot.models
      .slice(0, 2)
      .map(
        (m) =>
          `${m.model.slice(0, 14)} ${m.requests}次${m.errors > 0 ? ` ${m.errors}错` : ''}`,
      )
      .join(' · ') || '–';

  const agentLine =
    snapshot.subagents
      .slice(0, 2)
      .map((s) => `${s.source.slice(0, 10)} ${formatTokens(s.totalTokens)}`)
      .join(' · ') || '–';

  const metricsColumn = (
    <Box flexDirection="column" flexGrow={1}>
      <Stat label="上下文">
        <Bar pct={context.usedPercent} width={10} />
        <Text color={pctColor(context.usedPercent)}>
          {' '}
          {context.usedPercent.toFixed(0)}%
        </Text>
        <Provenance of={context.provenance} />
        <Text dimColor>
          {' '}
          {formatTokens(context.usedTokens)}/{formatTokens(context.windowSize)}
        </Text>
      </Stat>

      <Stat label="令牌">
        <Text dimColor>入 </Text>
        <Text>{formatTokens(tokens.prompt)}</Text>
        <Text dimColor> 出 </Text>
        <Text>{formatTokens(tokens.candidates)}</Text>
        {tokens.cached > 0 && (
          <>
            <Text dimColor> 缓存 </Text>
            <Text>{formatTokens(tokens.cached)}</Text>
          </>
        )}
      </Stat>

      <Stat label="模型">
        <Text>{modelLine}</Text>
      </Stat>

      <Stat label="代理">
        <Text>{agentLine}</Text>
      </Stat>

      <Stat label="工具">
        <Text>{tools.totalCalls}次</Text>
        <Text dimColor> · </Text>
        <Text color={pctColor(tools.successRate * 100)}>
          {formatPct(tools.successRate)}成
        </Text>
        <Text dimColor> · 均{formatMs(tools.avgDurationMs)}</Text>
      </Stat>

      <Stat label="审批">
        <Text dimColor>自动 </Text>
        <Text>{tools.decisions.autoAccept}</Text>
        <Text dimColor> 接受 </Text>
        <Text>{tools.decisions.accept}</Text>
        <Text dimColor> 改 </Text>
        <Text>{tools.decisions.modify}</Text>
        <Text dimColor> 拒 </Text>
        <Text
          color={tools.decisions.reject > 0 ? theme.status.warning : undefined}
        >
          {tools.decisions.reject}
        </Text>
      </Stat>

      <Stat label="延迟">
        <Text dimColor>首字 </Text>
        <Text>{ttft != null ? formatMs(ttft) : '–'}</Text>
        <Text dimColor> p50 </Text>
        <Text>{formatMs(latency.p50)}</Text>
        <Text dimColor> p95 </Text>
        <Text>{formatMs(latency.p95)}</Text>
      </Stat>

      <Stat label="费用">
        <Text>${cost.sessionUsd.toFixed(2)}</Text>
        <Provenance of={cost.provenance} />
        <Text dimColor> 本次 · ${cost.dailyUsd.toFixed(2)}</Text>
        <Provenance of={cost.provenance} />
        <Text dimColor> 今日</Text>
      </Stat>

      <Stat label="健康">
        {health.rateLimitPercent > 0 && (
          <Text color={theme.status.warning}>
            限流{health.rateLimitPercent}%{' '}
          </Text>
        )}
        {health.retryCount > 0 && (
          <Text color={theme.status.warning}>重试#{health.retryCount} </Text>
        )}
        <Text color={health.diskOk ? theme.status.success : theme.status.error}>
          磁盘{health.diskOk ? '✓' : '✗'}
        </Text>
        {(snapshot.files.linesAdded > 0 || snapshot.files.linesRemoved > 0) && (
          <Text dimColor>
            {' '}
            +{snapshot.files.linesAdded} -{snapshot.files.linesRemoved}
          </Text>
        )}
      </Stat>

      {totalTasks > 0 && (
        <Stat label="任务">
          <Text>
            {doneTasks}/{totalTasks} 完成
          </Text>
        </Stat>
      )}
    </Box>
  );

  // ─── 右列：思考链 / 记忆 / 图谱 ─────────────────────────────────────────────

  const rightColumn = (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Box>
        <Text bold color={theme.text.accent}>
          {MODE_LABEL_ZH[mode]}
        </Text>
        <Text dimColor> [M]切换</Text>
      </Box>

      {mode === 'chain' &&
        (chain.length > 0 ? (
          chain.map((step, i) => (
            <Text key={i} dimColor={!step.active && i < chain.length - 3}>
              {chainIcon(step.kind)}{' '}
              <Text
                bold={step.active}
                color={
                  step.active
                    ? theme.text.accent
                    : step.failed
                      ? theme.status.error
                      : undefined
                }
              >
                {step.label}
              </Text>
              {step.active ? ' ⟵' : ''}
              {step.detail && !step.active ? (
                <Text dimColor> · {step.detail}</Text>
              ) : (
                ''
              )}
            </Text>
          ))
        ) : (
          <Text dimColor>等待思考与动作…</Text>
        ))}

      {mode === 'memory' && (
        <>
          <Text>
            <Text dimColor>记忆占用 </Text>
            <Text>{formatTokens(memoryPanel.memoryTokens)}</Text>
            <Text dimColor>
              {' '}
              · 近期 读{memoryPanel.recentReads} 写{memoryPanel.recentWrites}
            </Text>
          </Text>
          {memoryPanel.files.length > 0 ? (
            memoryPanel.files.map((f) => (
              <Text key={f.path}>
                <Text color={theme.text.link}> {baseName(f.path)}</Text>
                <Text dimColor> {formatTokens(f.tokens)}</Text>
              </Text>
            ))
          ) : (
            <Text dimColor>暂无记忆文件统计（运行 /context 后显示）</Text>
          )}
        </>
      )}

      {mode === 'graph' && (
        <>
          <Text dimColor>文件 · 触及工具（共{graph.totalFiles}个）</Text>
          {graph.nodes.length > 0 ? (
            graph.nodes.map((n) => (
              <Text key={n.node}>
                <Text color={theme.text.link}> {n.node}</Text>
                <Text dimColor> ×{n.count}</Text>
                <Text color={theme.text.secondary}> [{n.tools.join(',')}]</Text>
              </Text>
            ))
          ) : (
            <Text dimColor>暂无文件活动</Text>
          )}
        </>
      )}
    </Box>
  );

  // ─── Better Harness 列：五维分数 + findings 概览 ────────────────────────────

  const bhSeverityBits = betterHarnessPanel
    ? (
        Object.keys(
          betterHarnessPanel.severityCounts,
        ) as BetterHarnessSeverity[]
      )
        .filter((severity) => betterHarnessPanel.severityCounts[severity] > 0)
        .map((severity) => (
          <Text key={severity}>
            <Text dimColor> </Text>
            <Text color={severityColor(severity)}>
              {SEVERITY_LABEL_ZH[severity]}
              {betterHarnessPanel.severityCounts[severity]}
            </Text>
          </Text>
        ))
    : [];

  const bhBody = betterHarnessPanel ? (
    <>
      {betterHarnessPanel.dimensions.map((dimension) => (
        <Box key={dimension.id}>
          <Box width={5}>
            <Text dimColor>
              {bhDimensionLabel(dimension.id, dimension.label)}
            </Text>
          </Box>
          <Bar pct={dimension.score} width={8} />
          <Text color={pctColor(dimension.score)}>
            {' '}
            {String(dimension.score).padStart(3)}
          </Text>
        </Box>
      ))}
      <Text>
        <Text dimColor>发现 </Text>
        <Text>{betterHarnessPanel.findingsTotal}</Text>
        {bhSeverityBits.length > 0 && <Text dimColor> ·</Text>}
        {bhSeverityBits}
      </Text>
      <Text dimColor>
        {betterHarnessPanel.auditedAt
          ? `审计 ${betterHarnessPanel.auditedAt.toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : '—'}
      </Text>
    </>
  ) : harnessStatus ? (
    <HarnessStatusBody status={harnessStatus} />
  ) : (
    <Text dimColor>未审计 · 运行 /better-harness</Text>
  );

  const bhHeader = (
    <Text bold color={theme.text.accent}>
      Better Harness
    </Text>
  );

  const betterHarnessColumn = (
    <Box flexDirection="column" flexGrow={1} width="34%" paddingLeft={1}>
      {bhHeader}
      {bhBody}
    </Box>
  );

  const betterHarnessRow = (
    <Box flexDirection="column" paddingTop={1}>
      {bhHeader}
      <Box>
        {betterHarnessPanel ? (
          betterHarnessPanel.dimensions.map((dimension) => (
            <Box key={dimension.id} paddingRight={2}>
              <Text dimColor>
                {bhDimensionLabel(dimension.id, dimension.label)}{' '}
              </Text>
              <Bar pct={dimension.score} width={6} />
              <Text color={pctColor(dimension.score)}>
                {' '}
                {String(dimension.score).padStart(3)}
              </Text>
            </Box>
          ))
        ) : (
          <Text dimColor>未审计 · 运行 /better-harness</Text>
        )}
      </Box>
      {betterHarnessPanel && (
        <Text>
          <Text dimColor>发现 </Text>
          <Text>{betterHarnessPanel.findingsTotal}</Text>
          {bhSeverityBits.length > 0 && <Text dimColor> ·</Text>}
          {bhSeverityBits}
        </Text>
      )}
    </Box>
  );

  const isWide = uiState.terminalWidth >= THREE_COLUMN_MIN_WIDTH;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      {/* 头部 */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={theme.text.accent}>
          智能体状态
        </Text>
        <Text dimColor>[{sessionId}]</Text>
        <Text
          color={
            health.apiConnected ? theme.status.success : theme.status.error
          }
        >
          {health.apiConnected ? '📡 已连接' : '📡 离线'}
        </Text>
      </Box>

      {statusLine}

      <Box paddingX={1} flexDirection={isWide ? 'row' : 'column'}>
        <Box flexGrow={1} width={isWide ? '33%' : '50%'}>
          {metricsColumn}
        </Box>
        <Box flexGrow={1} width={isWide ? '33%' : '50%'}>
          {rightColumn}
        </Box>
        {isWide ? betterHarnessColumn : betterHarnessRow}
      </Box>

      {/* 明细表（按需） */}
      {showDetail && (
        <Box flexDirection="column" paddingX={1} borderTop>
          {snapshot.models.length > 0 && (
            <Box flexDirection="column">
              <Text bold dimColor>
                模型
              </Text>
              {snapshot.models.map((m) => (
                <Text key={m.model}>
                  <Text color={theme.text.link}>
                    {m.model.slice(0, 20).padEnd(20)}
                  </Text>
                  <Text dimColor>
                    {String(m.requests).padStart(4)} 次 {m.errors} 错 入{' '}
                    {formatTokens(m.promptTokens)} 出{' '}
                    {formatTokens(m.candidateTokens)} 缓存{' '}
                    {formatTokens(m.cachedTokens)} 均 {formatMs(m.avgLatencyMs)}
                  </Text>
                </Text>
              ))}
            </Box>
          )}

          {tools.top.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>
                常用工具
              </Text>
              {tools.top.map((t) => (
                <Text key={t.name}>
                  <Text color={theme.text.link}>
                    {t.name.slice(0, 20).padEnd(20)}
                  </Text>
                  <Text dimColor>
                    {String(t.count).padStart(4)} {t.success}✓ {t.fail}✗ 均{' '}
                    {formatMs(t.avgDurationMs)}
                  </Text>
                </Text>
              ))}
            </Box>
          )}

          <Text dimColor>标记：~ 估算 · ≈ 间接信号</Text>
        </Box>
      )}

      {/* 控制条 */}
      <Box paddingX={1} borderTop>
        <Text dimColor>
          [T] {expanded ? '收起' : '展开'} [M] 切换右侧(
          {MODE_LABEL_ZH[mode]}) [D] 明细
        </Text>
      </Box>
    </Box>
  );
};

// 记忆面板里把路径缩短为基名。
function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}
