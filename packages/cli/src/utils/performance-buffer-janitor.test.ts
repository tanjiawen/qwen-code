/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'node:perf_hooks';
import { vi } from 'vitest';
import {
  _resetPerformanceBufferJanitorForTest,
  initPerformanceBufferJanitor,
} from './performance-buffer-janitor.js';

function seedEntries(): void {
  performance.mark('janitor-test-mark');
  performance.measure('janitor-test-measure', 'janitor-test-mark');
}

describe('performance-buffer-janitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetPerformanceBufferJanitorForTest();
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    _resetPerformanceBufferJanitorForTest();
    performance.clearMarks();
    performance.clearMeasures();
    vi.useRealTimers();
  });

  it('clears accumulated marks and measures on the interval', () => {
    initPerformanceBufferJanitor();
    seedEntries();
    expect(performance.getEntriesByType('mark').length).toBeGreaterThan(0);
    expect(performance.getEntriesByType('measure').length).toBeGreaterThan(0);

    vi.advanceTimersByTime(60_000);

    expect(performance.getEntriesByType('mark')).toHaveLength(0);
    expect(performance.getEntriesByType('measure')).toHaveLength(0);
  });

  it('does not clear entries before the first interval elapses', () => {
    initPerformanceBufferJanitor();
    seedEntries();

    vi.advanceTimersByTime(59_000);

    expect(performance.getEntriesByType('mark').length).toBeGreaterThan(0);
    expect(performance.getEntriesByType('measure').length).toBeGreaterThan(0);
  });

  it('is idempotent — a second init does not start another timer', () => {
    const clearMeasuresSpy = vi.spyOn(performance, 'clearMeasures');
    initPerformanceBufferJanitor();
    initPerformanceBufferJanitor();

    vi.advanceTimersByTime(60_000);

    expect(clearMeasuresSpy).toHaveBeenCalledTimes(1);
    clearMeasuresSpy.mockRestore();
  });

  it('reset stops the interval', () => {
    initPerformanceBufferJanitor();
    _resetPerformanceBufferJanitorForTest();
    seedEntries();

    vi.advanceTimersByTime(120_000);

    expect(performance.getEntriesByType('mark').length).toBeGreaterThan(0);
    expect(performance.getEntriesByType('measure').length).toBeGreaterThan(0);
  });
});
