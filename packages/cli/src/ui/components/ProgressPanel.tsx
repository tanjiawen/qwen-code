/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { ToolCallStatus, StreamingState } from '../types.js';
import {
  getHookAggregateStats,
  getRecentFlightEvents,
  getLatencyPercentiles,
  getDailyCost,
  estimateCostUsd,
  getSystemHealth,
  type FlightEvent,
} from '@qwen-code/qwen-code-core';

const POLL_INTERVAL_MS = 1000;
const BAR_WIDTH = 14;
const FILLED = '\u2588';
const EMPTY = '\u2591';

type EventFilter = 'all' | 'tools' | 'thinking' | 'errors';
const FILTER_CYCLE: EventFilter[] = ['all', 'tools', 'thinking', 'errors'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return `${n}`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function eventIcon(event: FlightEvent): string {
  switch (event.type) {
    case 'tool_call':
      return '🔧';
    case 'thinking':
      return '🧠';
    case 'user_input':
      return '👤';
    case 'task_complete':
      return '✅';
    case 'error':
      return '❌';
    default:
      return '•';
  }
}

function eventTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TokenBar({
  used,
  total,
}: {
  used: number;
  total: number;
}): React.JSX.Element {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;

  let color = theme.status.success;
  if (pct > 0.8) color = theme.status.error;
  else if (pct > 0.6) color = theme.status.warning;

  return (
    <Text>
      <Text color={color}>{FILLED.repeat(filled)}</Text>
      <Text color={theme.text.secondary}>{EMPTY.repeat(empty)}</Text>
    </Text>
  );
}

function ToolBar({
  name,
  count,
  max,
}: {
  name: string;
  count: number;
  max: number;
}): React.JSX.Element {
  const width = 4;
  const filled = max > 0 ? Math.max(1, Math.round((count / max) * width)) : 0;
  const empty = width - filled;
  return (
    <Text>
      <Text dimColor> {name.slice(0, 6).padEnd(6)}</Text>
      <Text color={theme.text.accent}>{FILLED.repeat(filled)}</Text>
      <Text color={theme.text.secondary}>{EMPTY.repeat(empty)}</Text>
    </Text>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const ProgressPanel: React.FC = () => {
  const uiState = useUIState();
  const { columns } = useTerminalSize();
  const { sessionStats, pendingHistoryItems, currentModel } = uiState;

  const [, setTick] = useState(0);
  const [compact, setCompact] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [filterIdx, setFilterIdx] = useState(0);
  const compactRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Key bindings — active only during streaming
  useKeypress(
    (key) => {
      if (key.name === 'space') {
        // Pause/resume not directly available; toggle compact as visual pause
        setCompact((c) => {
          compactRef.current = !c;
          return !c;
        });
      } else if (key.name === 'd') {
        setShowDetail((d) => !d);
      } else if (key.name === 'f') {
        setFilterIdx((i) => (i + 1) % FILTER_CYCLE.length);
      } else if (key.name === 't') {
        setCompact((c) => {
          compactRef.current = !c;
          return !c;
        });
      }
    },
    { isActive: uiState.streamingState === StreamingState.Responding },
  );

  // ─── Data aggregation ─────────────────────────────────────────────────────

  const elapsedSeconds = Math.floor(
    (Date.now() - sessionStats.sessionStartTime.getTime()) / 1000,
  );

  const metrics = sessionStats.metrics;

  let totalTokens = 0;
  let totalOutput = 0;
  let promptTokens = 0;
  let candidateTokens = 0;
  for (const model of Object.values(metrics.models)) {
    totalTokens += model.tokens.total;
    totalOutput += model.tokens.candidates;
    promptTokens += model.tokens.prompt;
    candidateTokens += model.tokens.candidates;
  }

  const contextWindowSize =
    sessionStats.lastPromptTokenCount > 0
      ? Math.max(sessionStats.lastPromptTokenCount, 128000)
      : 128000;

  const throughput =
    elapsedSeconds > 0 ? (totalOutput / elapsedSeconds).toFixed(1) : '0.0';

  // Session cost from cumulative tokens; today's total is persisted by
  // recordCost() per API response, so it already includes this session.
  const sessionCost = estimateCostUsd(promptTokens, candidateTokens);
  const dailyCost = getDailyCost();

  // Tools
  const topTools = Object.entries(metrics.tools.byName)
    .sort((a, b) => b[1]!.count - a[1]!.count)
    .slice(0, 4);
  const maxToolCount = topTools.length > 0 ? topTools[0]![1]!.count : 1;

  // Event timeline
  const filter = FILTER_CYCLE[filterIdx]!;
  let events = getRecentFlightEvents(showDetail ? 12 : 6);
  if (filter === 'tools') events = events.filter((e) => e.type === 'tool_call');
  else if (filter === 'thinking')
    events = events.filter((e) => e.type === 'thinking');
  else if (filter === 'errors')
    events = events.filter((e) => e.type === 'error');

  // Latency
  const latency = getLatencyPercentiles();

  // System health
  const health = getSystemHealth();

  // Hooks
  const hookStats = getHookAggregateStats();

  // Current tool from pending items
  let currentTool: string | undefined;
  for (const item of pendingHistoryItems) {
    if (item.type !== 'tool_group') continue;
    for (const tool of item.tools) {
      if (tool.status === ToolCallStatus.Executing) {
        currentTool = tool.name;
      }
    }
  }

  // Task progress from stickyTodos
  const todos = uiState.stickyTodos;
  const totalTasks = todos?.length ?? 0;
  const doneTasks = todos?.filter((t) => t.status === 'completed').length ?? 0;

  // Session ID (truncated)
  const sessionId = sessionStats.sessionId
    ? sessionStats.sessionId.slice(0, 8)
    : '--------';

  // ─── Compact mode ─────────────────────────────────────────────────────────

  if (compact) {
    return (
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold color={theme.text.accent}>
          ⚡{' '}
        </Text>
        <Text dimColor>{formatElapsed(elapsedSeconds)}</Text>
        <Text> | </Text>
        <Text>{currentTool ?? 'idle'}</Text>
        <Text> | </Text>
        <TokenBar used={totalTokens} total={contextWindowSize} />
        <Text dimColor>
          {' '}
          {Math.round((totalTokens / contextWindowSize) * 100)}%
        </Text>
        <Text> | </Text>
        <Text dimColor>{throughput} tok/s</Text>
        <Text dimColor> [T] expand</Text>
      </Box>
    );
  }

  // ─── Full Flight Deck ─────────────────────────────────────────────────────

  const narrow = columns < 80;
  const leftWidth = narrow ? 0 : 16;
  const rightWidth = narrow ? 0 : 22;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan">
      {/* ─── Top Bar ─── */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={theme.text.accent}>
          ⚡ AGENT FLIGHT DECK
        </Text>
        <Text dimColor>[Session: {sessionId}]</Text>
        <Text>⏱ {formatElapsed(elapsedSeconds)}</Text>
        <Text
          color={
            health.apiConnected ? theme.status.success : theme.status.error
          }
        >
          {health.apiConnected ? '📡 CONNECTED' : '📡 OFFLINE'}
        </Text>
      </Box>

      <Box>
        {/* ─── Left Column: Attitude + Engines ─── */}
        {!narrow && (
          <Box
            flexDirection="column"
            width={leftWidth}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
          >
            <Text bold color={theme.text.accent}>
              [ATTITUDE]
            </Text>
            <Text> </Text>
            <Text color={theme.status.success}>● ACTIVE</Text>
            <Text dimColor>────────</Text>
            <Text> </Text>
            <Text dimColor>MODEL:</Text>
            <Text>{currentModel.slice(0, 12)}</Text>
            <Text dimColor>────────</Text>
            <Text> </Text>
            <Text dimColor>TASKS:</Text>
            <Text>
              {doneTasks}/{totalTasks} ✓
            </Text>
            <Text> </Text>
            <Text bold color={theme.text.accent}>
              [ENGINES]
            </Text>
            <Text> </Text>
            {topTools.map(([name, stats]) => (
              <ToolBar
                key={name}
                name={name}
                count={stats!.count}
                max={maxToolCount}
              />
            ))}
            {topTools.length === 0 && <Text dimColor> no tools yet</Text>}
          </Box>
        )}

        {/* ─── Center: Primary Flight Display ─── */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color={theme.text.accent}>
            [PRIMARY FLIGHT DISPLAY]
          </Text>
          <Text> </Text>
          {events.length > 0 ? (
            events.map((event, i) => (
              <Text key={i}>
                <Text dimColor>{eventTime(event.timestamp)} </Text>
                <Text>──▶ {eventIcon(event)} </Text>
                <Text>{event.label}</Text>
                {event.durationMs !== undefined && (
                  <Text dimColor>
                    {' '}
                    ({(event.durationMs / 1000).toFixed(1)}s)
                  </Text>
                )}
              </Text>
            ))
          ) : (
            <Text dimColor>
              {' '}
              {currentTool ? `──▶ 🔧 ${currentTool}` : 'awaiting events...'}
            </Text>
          )}
          {showDetail && (
            <>
              <Text> </Text>
              <Text dimColor>
                tools: {metrics.tools.totalCalls} calls |{' '}
                {metrics.tools.totalSuccess}✓ {metrics.tools.totalFail}✗
              </Text>
              <Text dimColor>
                hooks: {hookStats.totalFired} fired | {hookStats.totalBlocked}{' '}
                blocked
              </Text>
            </>
          )}
        </Box>

        {/* ─── Right Column: Fuel + Cost + Health ─── */}
        {!narrow && (
          <Box
            flexDirection="column"
            width={rightWidth}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
          >
            <Text bold color={theme.text.accent}>
              [FUEL GAUGE]
            </Text>
            <Text dimColor>TOKEN BUDGET</Text>
            <TokenBar used={totalTokens} total={contextWindowSize} />
            <Text>
              <Text dimColor>
                {' '}
                {Math.round((1 - totalTokens / contextWindowSize) * 100)}%
                REMAINING
              </Text>
            </Text>
            <Text dimColor>
              {' '}
              {formatTokens(totalTokens)} / {formatTokens(contextWindowSize)}
            </Text>
            <Text> </Text>
            <Text bold color={theme.text.accent}>
              [COST METER]
            </Text>
            <Text> ${sessionCost.toFixed(2)} SESSION</Text>
            <Text dimColor> ${dailyCost.toFixed(2)} TODAY</Text>
            <Text> </Text>
            <Text bold color={theme.text.accent}>
              [SYSTEM HEALTH]
            </Text>
            {health.rateLimitPercent > 60 && (
              <Text color={theme.status.warning}>
                {' '}
                ⚠ Rate limit {health.rateLimitPercent}%
              </Text>
            )}
            {health.retryCount > 0 && (
              <Text color={theme.status.warning}>
                {' '}
                ⚠ Retry #{health.retryCount}
              </Text>
            )}
            <Text
              color={
                health.apiConnected ? theme.status.success : theme.status.error
              }
            >
              {health.apiConnected ? ' ✔ API Connected' : ' ✘ API Offline'}
            </Text>
            <Text
              color={health.diskOk ? theme.status.success : theme.status.error}
            >
              {health.diskOk ? ' ✔ Disk OK' : ' ✘ Disk Error'}
            </Text>
          </Box>
        )}
      </Box>

      {/* ─── Bottom Bar: Performance ─── */}
      <Box justifyContent="space-between" paddingX={1} borderTop>
        <Text dimColor>
          LATENCY: p50: {formatMs(latency.p50)} │ p95: {formatMs(latency.p95)} │
          p99: {formatMs(latency.p99)}
        </Text>
        <Text dimColor>THROUGHPUT: {throughput} tok/s</Text>
      </Box>

      {/* ─── Control Bar ─── */}
      <Box paddingX={1} borderTop>
        <Text dimColor>
          [SPACE] Pause [D] Detail [F] Filter({filter}) [T] Toggle View
        </Text>
      </Box>
    </Box>
  );
};
