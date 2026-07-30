/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookEventName } from './types.js';

export interface HookExecutionRecord {
  event: HookEventName;
  timestamp: number;
  durationMs: number;
  hookCount: number;
  blocked: boolean;
}

export interface HookAggregateStats {
  totalFired: number;
  totalBlocked: number;
  byEvent: Record<string, { count: number; blocked: number }>;
}

const MAX_RECORDS = 50;

const buffer: HookExecutionRecord[] = [];

export function recordHookExecution(record: HookExecutionRecord): void {
  buffer.push(record);
  if (buffer.length > MAX_RECORDS) {
    buffer.shift();
  }
}

export function getRecentHookExecutions(count = 10): HookExecutionRecord[] {
  return buffer.slice(-count);
}

export function getHookAggregateStats(): HookAggregateStats {
  const stats: HookAggregateStats = {
    totalFired: 0,
    totalBlocked: 0,
    byEvent: {},
  };
  for (const record of buffer) {
    stats.totalFired++;
    if (record.blocked) stats.totalBlocked++;
    const key = record.event as string;
    if (!stats.byEvent[key]) {
      stats.byEvent[key] = { count: 0, blocked: 0 };
    }
    stats.byEvent[key]!.count++;
    if (record.blocked) stats.byEvent[key]!.blocked++;
  }
  return stats;
}

export function clearHookExecutionLog(): void {
  buffer.length = 0;
}
