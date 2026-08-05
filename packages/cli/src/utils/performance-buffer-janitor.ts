/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Periodically clears Node's performance mark/measure entry buffers.
 *
 * Why: react-reconciler's development build calls `performance.mark()` /
 * `performance.measure()` on every component render, and Node retains every
 * entry in a global buffer until it is explicitly cleared. The bundled CLI
 * avoids this (esbuild defines NODE_ENV=production, tree-shaking the dev
 * build), but `npm run dev` intentionally runs with NODE_ENV=development, so
 * a long interactive session accumulates hundreds of thousands of entries
 * (~1KB each) and eventually OOMs the process. Nothing in the CLI reads
 * these entries back (startupProfiler uses performance.now() only), so
 * clearing them is safe.
 */

import { performance } from 'node:perf_hooks';

const CLEAR_INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | undefined;

export function initPerformanceBufferJanitor(): void {
  if (timer) return;
  timer = setInterval(() => {
    performance.clearMarks();
    performance.clearMeasures();
  }, CLEAR_INTERVAL_MS);
  timer.unref?.();
}

/** Test-only: stop the interval so module state doesn't leak across cases. */
export function _resetPerformanceBufferJanitorForTest(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
