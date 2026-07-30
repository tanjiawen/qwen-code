/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordFlightEvent,
  getRecentFlightEvents,
  clearFlightEvents,
  recordLatencySample,
  getLatencyPercentiles,
  clearLatencySamples,
  getSystemHealth,
  updateSystemHealth,
  resetFlightDeck,
  estimateCostUsd,
  type FlightEvent,
} from './flight-deck.js';

vi.mock('node:fs');
vi.mock('node:os', () => ({
  default: { homedir: () => '/tmp/test-home' },
}));

function makeEvent(type: FlightEvent['type'], label: string): FlightEvent {
  return { type, label, timestamp: Date.now() };
}

describe('flight-deck', () => {
  beforeEach(() => {
    resetFlightDeck();
  });

  describe('event timeline', () => {
    it('records and retrieves events', () => {
      recordFlightEvent(makeEvent('tool_call', 'grep'));
      recordFlightEvent(makeEvent('thinking', 'reasoning'));

      const events = getRecentFlightEvents(10);
      expect(events).toHaveLength(2);
      expect(events[0]!.label).toBe('grep');
      expect(events[1]!.label).toBe('reasoning');
    });

    it('caps at 50 entries (ring buffer)', () => {
      for (let i = 0; i < 60; i++) {
        recordFlightEvent(makeEvent('tool_call', `tool-${i}`));
      }
      const events = getRecentFlightEvents(100);
      expect(events).toHaveLength(50);
      expect(events[0]!.label).toBe('tool-10');
      expect(events[49]!.label).toBe('tool-59');
    });

    it('returns last N events', () => {
      for (let i = 0; i < 10; i++) {
        recordFlightEvent(makeEvent('tool_call', `tool-${i}`));
      }
      const events = getRecentFlightEvents(3);
      expect(events).toHaveLength(3);
      expect(events[0]!.label).toBe('tool-7');
    });

    it('clears events', () => {
      recordFlightEvent(makeEvent('tool_call', 'grep'));
      clearFlightEvents();
      expect(getRecentFlightEvents(10)).toHaveLength(0);
    });
  });

  describe('latency percentiles', () => {
    it('returns zeros when empty', () => {
      const p = getLatencyPercentiles();
      expect(p.p50).toBe(0);
      expect(p.p95).toBe(0);
      expect(p.p99).toBe(0);
      expect(p.sampleCount).toBe(0);
    });

    it('computes percentiles from samples', () => {
      for (let i = 1; i <= 100; i++) {
        recordLatencySample(i);
      }
      const p = getLatencyPercentiles();
      expect(p.p50).toBe(51);
      expect(p.p95).toBe(96);
      expect(p.p99).toBe(100);
      expect(p.sampleCount).toBe(100);
    });

    it('caps at 100 samples', () => {
      for (let i = 0; i < 120; i++) {
        recordLatencySample(i);
      }
      const p = getLatencyPercentiles();
      expect(p.sampleCount).toBe(100);
    });

    it('clears samples', () => {
      recordLatencySample(500);
      clearLatencySamples();
      expect(getLatencyPercentiles().sampleCount).toBe(0);
    });
  });

  describe('system health', () => {
    it('returns defaults', () => {
      const h = getSystemHealth();
      expect(h.apiConnected).toBe(true);
      expect(h.diskOk).toBe(true);
      expect(h.rateLimitPercent).toBe(0);
      expect(h.retryCount).toBe(0);
    });

    it('updates partially', () => {
      updateSystemHealth({ rateLimitPercent: 80, retryCount: 2 });
      const h = getSystemHealth();
      expect(h.rateLimitPercent).toBe(80);
      expect(h.retryCount).toBe(2);
      expect(h.apiConnected).toBe(true);
    });

    it('returns a copy (not mutable reference)', () => {
      const h = getSystemHealth();
      h.rateLimitPercent = 999;
      expect(getSystemHealth().rateLimitPercent).toBe(0);
    });
  });

  describe('estimateCostUsd', () => {
    it('prices input at $3/M and output at $15/M', () => {
      expect(estimateCostUsd(1_000_000, 0)).toBe(3);
      expect(estimateCostUsd(0, 1_000_000)).toBe(15);
      expect(estimateCostUsd(1_000_000, 1_000_000)).toBe(18);
    });

    it('returns 0 for no tokens', () => {
      expect(estimateCostUsd(0, 0)).toBe(0);
    });
  });

  describe('resetFlightDeck', () => {
    it('resets all state', () => {
      recordFlightEvent(makeEvent('tool_call', 'grep'));
      recordLatencySample(100);
      updateSystemHealth({ apiConnected: false });

      resetFlightDeck();

      expect(getRecentFlightEvents(10)).toHaveLength(0);
      expect(getLatencyPercentiles().sampleCount).toBe(0);
      expect(getSystemHealth().apiConnected).toBe(true);
    });
  });
});
