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

const POLL_INTERVAL_MS = 1000;

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

/**
 * A compact progress panel shown during streaming. Displays the current
 * tool being executed, total tool call count, session elapsed time, and
 * the most recent 3 tool calls with their statuses.
 *
 * Phase 4 (simple version) — no DAG view or decision-point highlighting.
 */
export const ProgressPanel: React.FC = () => {
  const uiState = useUIState();
  const { sessionStats, pendingHistoryItems } = uiState;

  // Tick once per second to refresh elapsed time.
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
  const toolCallCount = sessionStats.metrics.tools.totalCalls;

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

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
    >
      <Text bold color={theme.text.accent}>
        Progress
      </Text>
      <Text>Current: {currentTool ?? 'idle'}</Text>
      <Text>Tools: {toolCallCount}</Text>
      <Text>Time: {formatElapsed(elapsedSeconds)}</Text>
      {lastThree.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Recent:</Text>
          {lastThree.map((t, i) => (
            <Text key={i}>
              {t.status === 'running' ? '●' : t.status === 'error' ? '✗' : '✓'}{' '}
              {t.name}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
