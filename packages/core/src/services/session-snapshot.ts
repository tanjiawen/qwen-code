/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ─── Data Model ──────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  version: 1;
  sessionId: string;
  timestamp: string;
  projectRoot: string;
  git: {
    branch: string;
    lastCommit: string;
    dirtyFiles: number;
  };
  task: {
    todos: Array<{ content: string; status: string }>;
    lastUserPrompt: string;
  };
  files: {
    modified: string[];
  };
  metrics: {
    turnCount: number;
    totalTokens: number;
    elapsedSeconds: number;
    toolCalls: number;
  };
  summary: string | null;
}

export interface SessionSnapshotConfig {
  enabled: boolean;
  llmSummary: boolean;
  maxAgeHours: number;
}

export const DEFAULT_SNAPSHOT_CONFIG: SessionSnapshotConfig = {
  enabled: true,
  llmSummary: true,
  maxAgeHours: 72,
};

// ─── Read / Write ────────────────────────────────────────────────────────────

export function writeSnapshot(
  filePath: string,
  snapshot: SessionSnapshot,
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export function readLastSnapshot(filePath: string): SessionSnapshot | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as SessionSnapshot;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSnapshot(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Already gone — fine.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isSnapshotRecent(
  snapshot: SessionSnapshot,
  maxAgeHours: number,
  now = Date.now(),
): boolean {
  const age = now - new Date(snapshot.timestamp).getTime();
  return age >= 0 && age < maxAgeHours * 3600_000;
}

export function formatSnapshotForPrompt(snapshot: SessionSnapshot): string {
  const ts = new Date(snapshot.timestamp);
  const dateStr = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;

  const lines: string[] = [
    `--- 上次会话快照 (${dateStr}, 分支 ${snapshot.git.branch}) ---`,
  ];

  if (snapshot.summary) {
    lines.push(`摘要：${snapshot.summary}`);
  }

  const pending = snapshot.task.todos.filter((t) => t.status !== 'completed');
  if (pending.length > 0) {
    lines.push(`待办：${pending.map((t) => t.content).join('；')}`);
  } else {
    lines.push('待办：无未完成任务');
  }

  if (snapshot.files.modified.length > 0) {
    const names = snapshot.files.modified
      .slice(0, 8)
      .map((f) => f.split(/[\\/]/).pop() ?? f);
    lines.push(`修改文件：${names.join(', ')}`);
  }

  if (snapshot.task.lastUserPrompt) {
    lines.push(`最后指令：${snapshot.task.lastUserPrompt}`);
  }

  lines.push('---');
  return lines.join('\n');
}
