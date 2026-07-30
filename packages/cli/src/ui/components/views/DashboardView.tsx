/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { DashboardSnapshot } from '../../types.js';

const BAR_WIDTH = 24;
const FILLED = '\u2588';
const EMPTY = '\u2591';

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m${s}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

const Panel: React.FC<{
  title: string;
  children: React.ReactNode;
  width?: string;
}> = ({ title, children, width }) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={theme.text.secondary}
    paddingX={1}
    width={width}
  >
    <Text bold color={theme.text.accent}>
      {title}
    </Text>
    {children}
  </Box>
);

const TokenPanel: React.FC<{ snapshot: DashboardSnapshot }> = ({
  snapshot,
}) => {
  const { tokens } = snapshot;
  const pct =
    tokens.contextWindowSize > 0
      ? Math.min(tokens.total / tokens.contextWindowSize, 1)
      : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;

  let barColor = theme.status.success;
  if (pct > 0.8) barColor = theme.status.error;
  else if (pct > 0.6) barColor = theme.status.warning;

  return (
    <Panel title="⛽ Token Budget">
      <Text>
        <Text color={barColor}>{FILLED.repeat(filled)}</Text>
        <Text color={theme.text.secondary}>{EMPTY.repeat(empty)}</Text>
      </Text>
      <Text>
        {formatTokens(tokens.total)} / {formatTokens(tokens.contextWindowSize)}{' '}
        ({Math.round(pct * 100)}%)
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          prompt: {formatTokens(tokens.prompt)} output:{' '}
          {formatTokens(tokens.candidates)}
        </Text>
        <Text dimColor>
          cached: {formatTokens(tokens.cached)} (
          {tokens.total > 0
            ? Math.round((tokens.cached / tokens.total) * 100)
            : 0}
          % hit)
        </Text>
      </Box>
    </Panel>
  );
};

const PerformancePanel: React.FC<{ snapshot: DashboardSnapshot }> = ({
  snapshot,
}) => {
  const { performance } = snapshot;
  return (
    <Panel title="📊 Performance">
      <Box flexDirection="column">
        <Text>
          <Text dimColor>avg latency </Text>
          {(performance.avgLatencyMs / 1000).toFixed(2)}s
        </Text>
        <Text>
          <Text dimColor>throughput </Text>
          {performance.throughputTokensPerSec.toFixed(1)} tok/s
        </Text>
        <Text>
          <Text dimColor>tool success </Text>
          <Text
            color={
              performance.toolSuccessRate >= 0.9
                ? theme.status.success
                : theme.status.warning
            }
          >
            {Math.round(performance.toolSuccessRate * 100)}%
          </Text>
        </Text>
        <Text>
          <Text dimColor>API requests </Text>
          {performance.totalRequests}
        </Text>
      </Box>
    </Panel>
  );
};

const ToolsPanel: React.FC<{ snapshot: DashboardSnapshot }> = ({
  snapshot,
}) => {
  const { tools } = snapshot;
  return (
    <Panel title="🔧 Tools">
      <Text>
        {tools.totalCalls} calls{' '}
        <Text color={theme.status.success}>{tools.totalSuccess}✓</Text>{' '}
        {tools.totalFail > 0 && (
          <Text color={theme.status.error}>{tools.totalFail}✗</Text>
        )}
      </Text>
      {tools.topTools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {tools.topTools.map((t: { name: string; count: number }) => (
            <Text key={t.name} dimColor>
              {t.name.padEnd(16)} {t.count}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          +{snapshot.files.linesAdded} / -{snapshot.files.linesRemoved} lines
        </Text>
      </Box>
    </Panel>
  );
};

const CostPanel: React.FC<{ snapshot: DashboardSnapshot }> = ({ snapshot }) => (
  <Panel title="💰 Cost">
    <Text bold>${snapshot.cost.estimatedSessionUsd.toFixed(4)}</Text>
    <Text dimColor>this session</Text>
    <Box marginTop={1}>
      <Text dimColor>uptime {formatElapsed(snapshot.elapsedSeconds)}</Text>
    </Box>
  </Panel>
);

const HookPanel: React.FC<{ snapshot: DashboardSnapshot }> = ({ snapshot }) => {
  const { hooks } = snapshot;
  const eventEntries = Object.entries(hooks.byEvent) as Array<[
    string,
    { count: number; blocked: number },
  ]>;

  return (
    <Panel title="🪝 Hooks">
      <Text>
        {hooks.totalFired} fired{' '}
        {hooks.totalBlocked > 0 && (
          <Text color={theme.status.warning}>
            ({hooks.totalBlocked} blocked)
          </Text>
        )}
      </Text>
      {eventEntries.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {eventEntries.map(([event, stats]) => (
            <Text key={event} dimColor>
              {event.padEnd(20)} {stats.count}
              {stats.blocked > 0 ? ` (${stats.blocked}⛔)` : ''}
            </Text>
          ))}
        </Box>
      )}
      {hooks.recent.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Recent:</Text>
          {hooks.recent.map(
            (
              r: {
                event: string;
                timestamp: number;
                durationMs: number;
                hookCount: number;
                blocked: boolean;
              },
              i: number,
            ) => (
              <Text key={i}>
                <Text
                  color={
                    r.blocked ? theme.status.warning : theme.text.secondary
                  }
                >
                  {r.blocked ? '⛔' : '✓'}
                </Text>{' '}
                <Text dimColor>{formatTime(r.timestamp)}</Text> {r.event}{' '}
                <Text dimColor>({r.durationMs}ms)</Text>
              </Text>
            ),
          )}
        </Box>
      )}
    </Panel>
  );
};

export const DashboardView: React.FC<{ snapshot: DashboardSnapshot }> = ({
  snapshot,
}) => (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          ⚡ AGENT DASHBOARD
        </Text>
        <Text dimColor>
          session: {formatElapsed(snapshot.elapsedSeconds)} uptime
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <TokenPanel snapshot={snapshot} />
          <PerformancePanel snapshot={snapshot} />
        </Box>
        <Box marginTop={1}>
          <ToolsPanel snapshot={snapshot} />
          <CostPanel snapshot={snapshot} />
        </Box>
        <Box marginTop={1}>
          <HookPanel snapshot={snapshot} />
        </Box>
      </Box>
    </Box>
  );
