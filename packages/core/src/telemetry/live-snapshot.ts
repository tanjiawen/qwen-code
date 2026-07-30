/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionMetrics, ModelMetrics } from './uiTelemetry.js';
import { ToolCallDecision } from './tool-call-decision.js';
import {
  getLatencyPercentiles,
  getDailyCost,
  getSystemHealth,
  getRecentFlightEvents,
  estimateCostUsd,
  type FlightEvent,
} from './flight-deck.js';

/**
 * Where a derived number comes from. The UI renders a marker next to any value
 * that is not directly measured so a reader always knows what is real, what is
 * a rough estimate, and what is an indirect proxy. Phase 1 only produces
 * `measured` and `estimated`; later phases add `proxy` for grounding signals.
 */
export type MetricProvenance = 'measured' | 'estimated' | 'proxy';

export interface ModelSlice {
  model: string;
  requests: number;
  errors: number;
  promptTokens: number;
  candidateTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  avgLatencyMs: number;
}

export interface SubagentSlice {
  source: string;
  requests: number;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export interface ToolSlice {
  name: string;
  count: number;
  success: number;
  fail: number;
  avgDurationMs: number;
}

export interface LiveSnapshot {
  timestamp: number;
  sessionId: string;
  elapsedSeconds: number;

  context: {
    usedTokens: number;
    windowSize: number;
    usedPercent: number;
    cachedTokens: number;
    freeTokens: number;
    provenance: MetricProvenance;
  };

  tokens: {
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    thoughts: number;
  };

  models: ModelSlice[];
  subagents: SubagentSlice[];

  tools: {
    totalCalls: number;
    success: number;
    fail: number;
    successRate: number;
    avgDurationMs: number;
    decisions: {
      accept: number;
      reject: number;
      modify: number;
      autoAccept: number;
    };
    top: ToolSlice[];
  };

  skills: {
    totalCalls: number;
    success: number;
    fail: number;
  };

  files: {
    linesAdded: number;
    linesRemoved: number;
  };

  latency: {
    ttftMs: number | null;
    lastTtftMs: number | null;
    generationThroughput: number | null;
    p50: number;
    p95: number;
    p99: number;
    sampleCount: number;
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
  };

  cost: {
    sessionUsd: number;
    dailyUsd: number;
    provenance: MetricProvenance;
  };

  health: {
    apiConnected: boolean;
    rateLimitPercent: number;
    retryCount: number;
    diskOk: boolean;
  };

  events: FlightEvent[];
}

export interface LiveSnapshotInput {
  metrics: SessionMetrics;
  /** Real current context fill reported by the last API response. */
  lastPromptTokenCount: number;
  lastCachedTokenCount: number;
  contextWindowSize: number;
  sessionStartTime: number;
  sessionId?: string;
  eventCount?: number;
  /** Injectable clock for deterministic tests. */
  now?: number;
}

function toModelSlice(model: string, m: ModelMetrics): ModelSlice {
  return {
    model,
    requests: m.api.totalRequests,
    errors: m.api.totalErrors,
    promptTokens: m.tokens.prompt,
    candidateTokens: m.tokens.candidates,
    cachedTokens: m.tokens.cached,
    thoughtsTokens: m.tokens.thoughts,
    avgLatencyMs:
      m.api.totalRequests > 0 ? m.api.totalLatencyMs / m.api.totalRequests : 0,
  };
}

export function selectLiveSnapshot(input: LiveSnapshotInput): LiveSnapshot {
  const {
    metrics,
    lastPromptTokenCount,
    lastCachedTokenCount,
    contextWindowSize,
    sessionStartTime,
  } = input;
  const now = input.now ?? Date.now();

  let prompt = 0;
  let candidates = 0;
  let total = 0;
  let cached = 0;
  let thoughts = 0;
  let totalRequests = 0;
  let totalErrors = 0;

  const models: ModelSlice[] = [];
  const sourceAgg = new Map<
    string,
    { requests: number; prompt: number; candidates: number; total: number }
  >();

  for (const [name, m] of Object.entries(metrics.models)) {
    prompt += m.tokens.prompt;
    candidates += m.tokens.candidates;
    total += m.tokens.total;
    cached += m.tokens.cached;
    thoughts += m.tokens.thoughts;
    totalRequests += m.api.totalRequests;
    totalErrors += m.api.totalErrors;
    models.push(toModelSlice(name, m));

    for (const [source, s] of Object.entries(m.bySource)) {
      const bucket = sourceAgg.get(source) ?? {
        requests: 0,
        prompt: 0,
        candidates: 0,
        total: 0,
      };
      bucket.requests += s.api.totalRequests;
      bucket.prompt += s.tokens.prompt;
      bucket.candidates += s.tokens.candidates;
      bucket.total += s.tokens.total;
      sourceAgg.set(source, bucket);
    }
  }

  models.sort((a, b) => b.requests - a.requests);
  const subagents: SubagentSlice[] = [...sourceAgg.entries()]
    .map(([source, s]) => ({
      source,
      requests: s.requests,
      promptTokens: s.prompt,
      candidateTokens: s.candidates,
      totalTokens: s.total,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  // Context fill: the precise "how full is my context right now" is the last
  // API-reported prompt count against the window — not cumulative session
  // tokens. Before the first response there is no measurement yet.
  const windowSize = contextWindowSize > 0 ? contextWindowSize : 1;
  const hasContextMeasurement = lastPromptTokenCount > 0;
  const usedTokens = lastPromptTokenCount;
  const usedPercent = (usedTokens / windowSize) * 100;

  const generation = metrics.generation;
  const ttftMs =
    generation && generation.timedRequests > 0
      ? generation.totalTtftMs / generation.timedRequests
      : null;
  const generationThroughput =
    generation && generation.totalGenerationDurationMs > 0
      ? generation.totalThroughputOutputTokens /
        (generation.totalGenerationDurationMs / 1000)
      : null;

  const percentiles = getLatencyPercentiles();

  const tools = metrics.tools;
  const top: ToolSlice[] = Object.entries(tools.byName)
    .sort((a, b) => b[1]!.count - a[1]!.count)
    .slice(0, 5)
    .map(([name, s]) => ({
      name,
      count: s!.count,
      success: s!.success,
      fail: s!.fail,
      avgDurationMs: s!.count > 0 ? s!.durationMs / s!.count : 0,
    }));

  const skills = metrics.skills;

  return {
    timestamp: now,
    sessionId: input.sessionId ?? '',
    elapsedSeconds: Math.max(0, Math.floor((now - sessionStartTime) / 1000)),

    context: {
      usedTokens,
      windowSize,
      usedPercent,
      cachedTokens: lastCachedTokenCount,
      freeTokens: Math.max(0, windowSize - usedTokens),
      provenance: hasContextMeasurement ? 'measured' : 'estimated',
    },

    tokens: { prompt, candidates, total, cached, thoughts },

    models,
    subagents,

    tools: {
      totalCalls: tools.totalCalls,
      success: tools.totalSuccess,
      fail: tools.totalFail,
      successRate:
        tools.totalCalls > 0 ? tools.totalSuccess / tools.totalCalls : 1,
      avgDurationMs:
        tools.totalCalls > 0 ? tools.totalDurationMs / tools.totalCalls : 0,
      decisions: {
        accept: tools.totalDecisions[ToolCallDecision.ACCEPT],
        reject: tools.totalDecisions[ToolCallDecision.REJECT],
        modify: tools.totalDecisions[ToolCallDecision.MODIFY],
        autoAccept: tools.totalDecisions[ToolCallDecision.AUTO_ACCEPT],
      },
      top,
    },

    skills: {
      totalCalls: skills?.totalCalls ?? 0,
      success: skills?.totalSuccess ?? 0,
      fail: skills?.totalFail ?? 0,
    },

    files: {
      linesAdded: metrics.files.totalLinesAdded,
      linesRemoved: metrics.files.totalLinesRemoved,
    },

    latency: {
      ttftMs,
      lastTtftMs: generation?.last?.ttftMs ?? null,
      generationThroughput,
      p50: percentiles.p50,
      p95: percentiles.p95,
      p99: percentiles.p99,
      sampleCount: percentiles.sampleCount,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    },

    cost: {
      sessionUsd: estimateCostUsd(prompt, candidates),
      dailyUsd: getDailyCost(),
      provenance: 'estimated',
    },

    health: getSystemHealth(),

    events: getRecentFlightEvents(input.eventCount ?? 8),
  };
}
