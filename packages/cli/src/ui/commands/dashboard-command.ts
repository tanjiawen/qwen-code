/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType, type DashboardSnapshot } from '../types.js';
import {
  getRecentHookExecutions,
  getHookAggregateStats,
  DEFAULT_TOKEN_LIMIT,
  type ModelMetrics,
} from '@qwen-code/qwen-code-core';

function buildSnapshot(context: CommandContext): DashboardSnapshot {
  const stats = context.session.stats;
  const metrics = stats.metrics;

  let promptTokens = 0;
  let candidateTokens = 0;
  let totalTokens = 0;
  let cachedTokens = 0;
  let totalLatency = 0;
  let totalRequests = 0;

  for (const model of Object.values(metrics.models) as ModelMetrics[]) {
    promptTokens += model.tokens.prompt;
    candidateTokens += model.tokens.candidates;
    totalTokens += model.tokens.total;
    cachedTokens += model.tokens.cached;
    totalLatency += model.api.totalLatencyMs;
    totalRequests += model.api.totalRequests;
  }

  const elapsedSeconds = Math.floor(
    (Date.now() - stats.sessionStartTime.getTime()) / 1000,
  );

  const throughput = elapsedSeconds > 0 ? candidateTokens / elapsedSeconds : 0;

  const toolSuccessRate =
    metrics.tools.totalCalls > 0
      ? metrics.tools.totalSuccess / metrics.tools.totalCalls
      : 1;

  const topTools = Object.entries(metrics.tools.byName)
    .sort((a, b) => b[1]!.count - a[1]!.count)
    .slice(0, 5)
    .map(([name, s]) => ({ name, count: s!.count }));

  const hookStats = getHookAggregateStats();
  const recentHooks = getRecentHookExecutions(5).map((r) => ({
    event: r.event as string,
    timestamp: r.timestamp,
    durationMs: r.durationMs,
    hookCount: r.hookCount,
    blocked: r.blocked,
  }));

  const contextWindowSize =
    context.services.config?.getContentGeneratorConfig().contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;

  // Rough cost estimate: $3/M input + $15/M output (typical frontier pricing)
  const estimatedCost = (promptTokens * 3 + candidateTokens * 15) / 1_000_000;

  return {
    sessionStartTime: stats.sessionStartTime.getTime(),
    elapsedSeconds,
    tokens: {
      prompt: promptTokens,
      candidates: candidateTokens,
      total: totalTokens,
      cached: cachedTokens,
      contextWindowSize,
    },
    performance: {
      avgLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
      throughputTokensPerSec: throughput,
      toolSuccessRate,
      totalRequests,
    },
    tools: {
      totalCalls: metrics.tools.totalCalls,
      totalSuccess: metrics.tools.totalSuccess,
      totalFail: metrics.tools.totalFail,
      topTools,
    },
    files: {
      linesAdded: metrics.files.totalLinesAdded,
      linesRemoved: metrics.files.totalLinesRemoved,
    },
    hooks: {
      totalFired: hookStats.totalFired,
      totalBlocked: hookStats.totalBlocked,
      byEvent: hookStats.byEvent,
      recent: recentHooks,
    },
    cost: {
      estimatedSessionUsd: estimatedCost,
    },
  };
}

export const dashboardCommand: SlashCommand = {
  name: 'dashboard',
  description:
    'Show a full session dashboard with tokens, performance, tools, cost, and hooks.',
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive'] as const,
  action: async (context: CommandContext) => {
    const snapshot = buildSnapshot(context);
    context.ui.addItem(
      {
        type: MessageType.DASHBOARD,
        snapshot,
      },
      Date.now(),
    );
  },
};
