/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectLiveSnapshot, type LiveSnapshotInput } from './live-snapshot.js';
import { ToolCallDecision } from './tool-call-decision.js';
import {
  recordFlightEvent,
  recordLatencySample,
  updateSystemHealth,
  resetFlightDeck,
} from './flight-deck.js';
import type {
  SessionMetrics,
  ModelMetrics,
  ModelMetricsCore,
} from './uiTelemetry.js';

vi.mock('node:fs');
vi.mock('node:os', () => ({
  default: { homedir: () => '/tmp/test-home' },
}));

const NOW = 1_000_000_000_000;

function makeModel(overrides: Partial<ModelMetrics> = {}): ModelMetrics {
  return {
    api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
    tokens: { prompt: 0, candidates: 0, total: 0, cached: 0, thoughts: 0 },
    bySource: {},
    ...overrides,
  };
}

function makeSource(
  overrides: Partial<ModelMetricsCore> = {},
): ModelMetricsCore {
  return {
    api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
    tokens: { prompt: 0, candidates: 0, total: 0, cached: 0, thoughts: 0 },
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        [ToolCallDecision.ACCEPT]: 0,
        [ToolCallDecision.REJECT]: 0,
        [ToolCallDecision.MODIFY]: 0,
        [ToolCallDecision.AUTO_ACCEPT]: 0,
      },
      byName: {},
    },
    files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<LiveSnapshotInput> = {},
): LiveSnapshotInput {
  return {
    metrics: makeMetrics(),
    lastPromptTokenCount: 0,
    lastCachedTokenCount: 0,
    contextWindowSize: 128_000,
    sessionStartTime: NOW - 65_000,
    sessionId: 'abc123',
    now: NOW,
    ...overrides,
  };
}

describe('selectLiveSnapshot', () => {
  beforeEach(() => {
    resetFlightDeck();
  });

  describe('context precision', () => {
    it('uses lastPromptTokenCount against the window, not cumulative tokens', () => {
      const snap = selectLiveSnapshot(
        makeInput({ lastPromptTokenCount: 32_000, contextWindowSize: 128_000 }),
      );
      expect(snap.context.usedTokens).toBe(32_000);
      expect(snap.context.usedPercent).toBeCloseTo(25, 5);
      expect(snap.context.freeTokens).toBe(96_000);
      expect(snap.context.provenance).toBe('measured');
    });

    it('marks context estimated before the first API response', () => {
      const snap = selectLiveSnapshot(makeInput({ lastPromptTokenCount: 0 }));
      expect(snap.context.usedPercent).toBe(0);
      expect(snap.context.provenance).toBe('estimated');
    });

    it('exposes cached tokens for cache-hit insight', () => {
      const snap = selectLiveSnapshot(
        makeInput({ lastCachedTokenCount: 8_000 }),
      );
      expect(snap.context.cachedTokens).toBe(8_000);
    });
  });

  describe('token aggregation', () => {
    it('sums prompt/candidates/total/cached/thoughts across models', () => {
      const metrics = makeMetrics({
        models: {
          'model-a': makeModel({
            tokens: {
              prompt: 100,
              candidates: 50,
              total: 150,
              cached: 20,
              thoughts: 5,
            },
          }),
          'model-b': makeModel({
            tokens: {
              prompt: 200,
              candidates: 80,
              total: 280,
              cached: 30,
              thoughts: 10,
            },
          }),
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.tokens.prompt).toBe(300);
      expect(snap.tokens.candidates).toBe(130);
      expect(snap.tokens.total).toBe(430);
      expect(snap.tokens.cached).toBe(50);
      expect(snap.tokens.thoughts).toBe(15);
    });
  });

  describe('model slices', () => {
    it('sorts models by request count and computes avg latency', () => {
      const metrics = makeMetrics({
        models: {
          quiet: makeModel({
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          }),
          busy: makeModel({
            api: { totalRequests: 4, totalErrors: 1, totalLatencyMs: 800 },
          }),
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.models.map((m) => m.model)).toEqual(['busy', 'quiet']);
      const busy = snap.models[0]!;
      expect(busy.avgLatencyMs).toBe(200);
      expect(busy.errors).toBe(1);
    });
  });

  describe('subagent slices', () => {
    it('aggregates bySource across models and sorts by total tokens', () => {
      const metrics = makeMetrics({
        models: {
          'model-a': makeModel({
            bySource: {
              main: makeSource({
                tokens: {
                  prompt: 10,
                  candidates: 5,
                  total: 15,
                  cached: 0,
                  thoughts: 0,
                },
              }),
              researcher: makeSource({
                tokens: {
                  prompt: 100,
                  candidates: 50,
                  total: 150,
                  cached: 0,
                  thoughts: 0,
                },
              }),
            },
          }),
          'model-b': makeModel({
            bySource: {
              main: makeSource({
                tokens: {
                  prompt: 20,
                  candidates: 10,
                  total: 30,
                  cached: 0,
                  thoughts: 0,
                },
              }),
            },
          }),
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.subagents.map((s) => s.source)).toEqual([
        'researcher',
        'main',
      ]);
      const main = snap.subagents.find((s) => s.source === 'main')!;
      expect(main.totalTokens).toBe(45);
      expect(main.promptTokens).toBe(30);
    });
  });

  describe('tools', () => {
    it('computes success rate, avg duration, decision mapping, and top tools', () => {
      const metrics = makeMetrics();
      metrics.tools.totalCalls = 10;
      metrics.tools.totalSuccess = 8;
      metrics.tools.totalFail = 2;
      metrics.tools.totalDurationMs = 5_000;
      metrics.tools.totalDecisions[ToolCallDecision.ACCEPT] = 3;
      metrics.tools.totalDecisions[ToolCallDecision.AUTO_ACCEPT] = 5;
      metrics.tools.totalDecisions[ToolCallDecision.REJECT] = 1;
      metrics.tools.totalDecisions[ToolCallDecision.MODIFY] = 1;
      metrics.tools.byName = {
        read_file: {
          count: 6,
          success: 6,
          fail: 0,
          durationMs: 3_000,
          decisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
        },
        edit: {
          count: 4,
          success: 2,
          fail: 2,
          durationMs: 2_000,
          decisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
        },
      };
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.tools.successRate).toBeCloseTo(0.8, 5);
      expect(snap.tools.avgDurationMs).toBe(500);
      expect(snap.tools.decisions).toEqual({
        accept: 3,
        reject: 1,
        modify: 1,
        autoAccept: 5,
      });
      expect(snap.tools.top.map((t) => t.name)).toEqual(['read_file', 'edit']);
      expect(snap.tools.top[0]!.avgDurationMs).toBe(500);
    });

    it('defaults success rate to 1 when there are no calls', () => {
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.tools.successRate).toBe(1);
      expect(snap.tools.avgDurationMs).toBe(0);
    });
  });

  describe('latency', () => {
    it('derives TTFT and generation throughput from generation metrics', () => {
      const metrics = makeMetrics({
        generation: {
          timedRequests: 3,
          totalTtftMs: 300,
          totalGenerationDurationMs: 2_000,
          totalThroughputOutputTokens: 1_000,
          last: {
            model: 'm',
            ttftMs: 120,
            generationDurationMs: 700,
            outputTokens: 300,
          },
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.latency.ttftMs).toBeCloseTo(100, 5);
      expect(snap.latency.lastTtftMs).toBe(120);
      expect(snap.latency.generationThroughput).toBeCloseTo(500, 5);
    });

    it('returns null TTFT/throughput without timed generation', () => {
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.latency.ttftMs).toBeNull();
      expect(snap.latency.generationThroughput).toBeNull();
      expect(snap.latency.lastTtftMs).toBeNull();
    });

    it('reads percentiles from the flight-deck latency store', () => {
      for (const ms of [10, 20, 30, 40]) recordLatencySample(ms);
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.latency.sampleCount).toBe(4);
      expect(snap.latency.p50).toBeGreaterThan(0);
    });

    it('computes API error rate across models', () => {
      const metrics = makeMetrics({
        models: {
          m: makeModel({
            api: { totalRequests: 8, totalErrors: 2, totalLatencyMs: 0 },
          }),
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      expect(snap.latency.totalRequests).toBe(8);
      expect(snap.latency.totalErrors).toBe(2);
      expect(snap.latency.errorRate).toBeCloseTo(0.25, 5);
    });
  });

  describe('cost', () => {
    it('estimates session cost from rates and marks it estimated', () => {
      const metrics = makeMetrics({
        models: {
          m: makeModel({
            tokens: {
              prompt: 1_000_000,
              candidates: 1_000_000,
              total: 2_000_000,
              cached: 0,
              thoughts: 0,
            },
          }),
        },
      });
      const snap = selectLiveSnapshot(makeInput({ metrics }));
      // $3/M input + $15/M output
      expect(snap.cost.sessionUsd).toBeCloseTo(18, 5);
      expect(snap.cost.provenance).toBe('estimated');
    });
  });

  describe('health and events', () => {
    it('passes through system health', () => {
      updateSystemHealth({ apiConnected: false, retryCount: 2 });
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.health.apiConnected).toBe(false);
      expect(snap.health.retryCount).toBe(2);
    });

    it('reads recent flight events', () => {
      recordFlightEvent({ type: 'tool_call', label: 'grep', timestamp: NOW });
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.events).toHaveLength(1);
      expect(snap.events[0]!.label).toBe('grep');
    });
  });

  describe('session timing', () => {
    it('computes elapsed seconds from the injected clock', () => {
      const snap = selectLiveSnapshot(makeInput());
      expect(snap.elapsedSeconds).toBe(65);
      expect(snap.sessionId).toBe('abc123');
    });
  });
});
