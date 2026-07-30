/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { ToolCallStatus } from '../types.js';
import { getHookAggregateStats } from '@qwen-code/qwen-code-core';

const POLL_INTERVAL_MS = 1000;
const BAR_WIDTH = 16;
const FILLED = '\u2588';
const EMPTY = '\u2591';

interface RecentTool {
  name: string;
  status: 'running' | 'done' | 'error';
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

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
      <Text dimColor> {Math.round(pct * 100)}%</Text>
    </Text>
  );
}

/**
 * Compact progress panel shown during streaming. Displays token usage bar,
 * current tool, throughput, session time, recent tools, and hook status.
 */
export const ProgressPanel: React.FC = () => {
  const uiState = useUIState();
  const { sessionStats, pendingHistoryItems } = uiState;

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = Math.floor(
    (Date.now() - sessionStats.sessionStartTime.getTime()) / 1000,
  );

  const metrics = sessionStats.metrics;
  const toolCallCount = metrics.tools.totalCalls;

  // Aggregate tokens across all models
  let totalTokens = 0;
  let totalOutput = 0;
  for (const model of Object.values(metrics.models)) {
    totalTokens += model.tokens.total;
    totalOutput += model.tokens.candidates;
  }

  const contextWindowSize =
    sessionStats.lastPromptTokenCount > 0
      ? Math.max(sessionStats.lastPromptTokenCount, 128000)
      : 128000;

  const throughput =
    elapsedSeconds > 0 ? (totalOutput / elapsedSeconds).toFixed(1) : '0.0';

  // Derive current tool and recent tools from pending history items.
  const recentTools: RecentTool[] = [];
  let currentTool: string | undefined;

  for (const item of pendingHistoryItems) {
    if (item.type !== 'tool_group') continue;
    for (const tool of item.tools) {
      if (tool.status === ToolCallStatus.Executing) {
        currentTool = tool.name;
        recentTools.push({ name: tool.name, status: 'running' });
      } else if (tool.status === ToolCallStatus.Error) {
        recentTools.push({ name: tool.name, status: 'error' });
      } else if (
        tool.status === ToolCallStatus.Success ||
        tool.status === ToolCallStatus.Canceled
      ) {
        recentTools.push({ name: tool.name, status: 'done' });
      }
    }
  }

  const lastThree = recentTools.slice(-3);

  // Hook status
  const hookStats = getHookAggregateStats();
  const hookBlocked = hookStats.totalBlocked > 0;

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
    >
      <Box justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          ⚡ Progress
        </Text>
        <Text dimColor>{formatElapsed(elapsedSeconds)}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text dimColor>ctx </Text>
          <TokenBar used={totalTokens} total={contextWindowSize} />
          <Text dimColor> {formatTokens(totalTokens)}</Text>
        </Text>
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text>
          <Text dimColor>tool </Text>
          {currentTool ?? 'idle'}
          <Text dimColor> ({toolCallCount})</Text>
        </Text>
        <Text>
          <Text dimColor>{throughput} tok/s</Text>
        </Text>
      </Box>

      {lastThree.length > 0 && (
        <Box marginTop={1}>
          {lastThree.map((t, i) => (
            <Text key={i} dimColor={t.status === 'done'}>
              {t.status === 'running'
                ? '● '
                : t.status === 'error'
                  ? '✗ '
                  : '✓ '}
              {t.name}{' '}
            </Text>
          ))}
        </Box>
      )}

      {hookStats.totalFired > 0 && (
        <Box marginTop={1}>
          <Text
            color={hookBlocked ? theme.status.warning : theme.status.success}
          >
            {hookBlocked ? '⚠' : '✓'}
          </Text>
          <Text dimColor>
            {' '}
            hooks: {hookStats.totalFired}
            {hookBlocked ? ` (${hookStats.totalBlocked} blocked)` : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
};
