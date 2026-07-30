/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Event Timeline ───────────────────────────────────────────────────────────

export type FlightEventType =
  | 'tool_call'
  | 'thinking'
  | 'user_input'
  | 'task_complete'
  | 'error';

export interface FlightEvent {
  type: FlightEventType;
  label: string;
  timestamp: number;
  durationMs?: number;
}

const MAX_EVENTS = 50;
const eventBuffer: FlightEvent[] = [];

export function recordFlightEvent(event: FlightEvent): void {
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENTS) {
    eventBuffer.shift();
  }
}

export function getRecentFlightEvents(count = 8): FlightEvent[] {
  return eventBuffer.slice(-count);
}

export function clearFlightEvents(): void {
  eventBuffer.length = 0;
}

// ─── Latency Percentiles ──────────────────────────────────────────────────────

const MAX_LATENCY_SAMPLES = 100;
const latencySamples: number[] = [];

export function recordLatencySample(ms: number): void {
  latencySamples.push(ms);
  if (latencySamples.length > MAX_LATENCY_SAMPLES) {
    latencySamples.shift();
  }
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
}

export function getLatencyPercentiles(): LatencyPercentiles {
  if (latencySamples.length === 0) {
    return { p50: 0, p95: 0, p99: 0, sampleCount: 0 };
  }
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    p50: sorted[Math.floor(n * 0.5)]!,
    p95: sorted[Math.min(Math.floor(n * 0.95), n - 1)]!,
    p99: sorted[Math.min(Math.floor(n * 0.99), n - 1)]!,
    sampleCount: n,
  };
}

export function clearLatencySamples(): void {
  latencySamples.length = 0;
}

// ─── Daily Cost ───────────────────────────────────────────────────────────────

const INPUT_COST_PER_MILLION = 3;
const OUTPUT_COST_PER_MILLION = 15;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens * INPUT_COST_PER_MILLION +
      outputTokens * OUTPUT_COST_PER_MILLION) /
    1_000_000
  );
}

interface DailyCostFile {
  date: string;
  totalUsd: number;
}

function getDailyCostPath(): string {
  return path.join(os.homedir(), '.qwen', 'daily-cost.json');
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

let cachedDailyCost: DailyCostFile | null = null;

function loadDailyCost(): DailyCostFile {
  const today = todayStr();
  if (cachedDailyCost && cachedDailyCost.date === today) {
    return cachedDailyCost;
  }
  try {
    const raw = fs.readFileSync(getDailyCostPath(), 'utf-8');
    const parsed = JSON.parse(raw) as DailyCostFile;
    if (parsed.date === today) {
      cachedDailyCost = parsed;
      return parsed;
    }
  } catch {
    // File missing or corrupt — start fresh
  }
  cachedDailyCost = { date: today, totalUsd: 0 };
  return cachedDailyCost;
}

export function recordCost(usd: number): void {
  const record = loadDailyCost();
  record.totalUsd += usd;
  cachedDailyCost = record;
  try {
    const dir = path.dirname(getDailyCostPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getDailyCostPath(), JSON.stringify(record), 'utf-8');
  } catch {
    // Best-effort persistence
  }
}

export function getDailyCost(): number {
  return loadDailyCost().totalUsd;
}

// ─── System Health ────────────────────────────────────────────────────────────

export interface SystemHealth {
  rateLimitPercent: number;
  retryCount: number;
  apiConnected: boolean;
  diskOk: boolean;
}

let systemHealth: SystemHealth = {
  rateLimitPercent: 0,
  retryCount: 0,
  apiConnected: true,
  diskOk: true,
};

export function updateSystemHealth(partial: Partial<SystemHealth>): void {
  systemHealth = { ...systemHealth, ...partial };
}

export function getSystemHealth(): SystemHealth {
  return { ...systemHealth };
}

export function resetFlightDeck(): void {
  clearFlightEvents();
  clearLatencySamples();
  cachedDailyCost = null;
  systemHealth = {
    rateLimitPercent: 0,
    retryCount: 0,
    apiConnected: true,
    diskOk: true,
  };
}
