/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeSnapshot,
  readLastSnapshot,
  clearSnapshot,
  isSnapshotRecent,
  formatSnapshotForPrompt,
  type SessionSnapshot,
} from './session-snapshot.js';
import { generateSnapshotSummary } from './session-snapshot-summary.js';

function makeSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    version: 1,
    sessionId: 'test-session-123',
    timestamp: '2026-07-30T23:54:00.000Z',
    projectRoot: '/tmp/project',
    git: { branch: 'main', lastCommit: 'abc1234 feat: test', dirtyFiles: 2 },
    task: {
      todos: [
        { content: '实现功能', status: 'completed' },
        { content: '写测试', status: 'pending' },
      ],
      lastUserPrompt: '帮我实现这个功能',
    },
    files: { modified: ['/tmp/project/src/index.ts'] },
    metrics: {
      turnCount: 5,
      totalTokens: 12000,
      elapsedSeconds: 300,
      toolCalls: 8,
    },
    summary: null,
    ...overrides,
  };
}

describe('session-snapshot', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snapshot-test-'));
    filePath = join(tmpDir, 'last-snapshot.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeSnapshot / readLastSnapshot', () => {
    it('round-trips a snapshot through disk', () => {
      const snapshot = makeSnapshot();
      writeSnapshot(filePath, snapshot);
      const loaded = readLastSnapshot(filePath);
      expect(loaded).toEqual(snapshot);
    });

    it('returns null for missing file', () => {
      expect(readLastSnapshot(join(tmpDir, 'nope.json'))).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      writeSnapshot(filePath, makeSnapshot());
      writeFileSync(filePath, 'not json{{{', 'utf-8');
      expect(readLastSnapshot(filePath)).toBeNull();
    });

    it('returns null for wrong version', () => {
      const snapshot = makeSnapshot({ version: 99 as unknown as 1 });
      writeSnapshot(filePath, snapshot);
      expect(readLastSnapshot(filePath)).toBeNull();
    });
  });

  describe('clearSnapshot', () => {
    it('removes the file', () => {
      writeSnapshot(filePath, makeSnapshot());
      clearSnapshot(filePath);
      expect(readLastSnapshot(filePath)).toBeNull();
    });

    it('does not throw for missing file', () => {
      expect(() => clearSnapshot(join(tmpDir, 'nope.json'))).not.toThrow();
    });
  });

  describe('isSnapshotRecent', () => {
    it('returns true for fresh snapshot', () => {
      const now = new Date('2026-07-30T23:54:00.000Z').getTime();
      const snapshot = makeSnapshot();
      expect(isSnapshotRecent(snapshot, 72, now + 1000)).toBe(true);
    });

    it('returns false for expired snapshot', () => {
      const now = new Date('2026-07-30T23:54:00.000Z').getTime();
      const snapshot = makeSnapshot();
      // 73 hours later
      expect(isSnapshotRecent(snapshot, 72, now + 73 * 3600_000)).toBe(false);
    });

    it('returns false for future timestamp', () => {
      const now = new Date('2026-07-30T23:54:00.000Z').getTime();
      const snapshot = makeSnapshot();
      expect(isSnapshotRecent(snapshot, 72, now - 1000)).toBe(false);
    });
  });

  describe('formatSnapshotForPrompt', () => {
    it('includes summary when present', () => {
      const snapshot = makeSnapshot({ summary: '上次在做快照功能' });
      const text = formatSnapshotForPrompt(snapshot);
      expect(text).toContain('上次在做快照功能');
      expect(text).toContain('分支 main');
    });

    it('shows pending todos', () => {
      const text = formatSnapshotForPrompt(makeSnapshot());
      expect(text).toContain('写测试');
      expect(text).not.toContain('实现功能');
    });

    it('shows no pending when all completed', () => {
      const snapshot = makeSnapshot({
        task: {
          todos: [{ content: 'done', status: 'completed' }],
          lastUserPrompt: '',
        },
      });
      const text = formatSnapshotForPrompt(snapshot);
      expect(text).toContain('无未完成任务');
    });

    it('includes file basenames', () => {
      const text = formatSnapshotForPrompt(makeSnapshot());
      expect(text).toContain('index.ts');
    });
  });
});

describe('session-snapshot-summary', () => {
  it('generates a summary via the generator', async () => {
    const generator = {
      generate: async () => '这个会话在实现快照功能，已完成核心模块。',
    };
    const result = await generateSnapshotSummary(makeSnapshot(), generator);
    expect(result).toBe('这个会话在实现快照功能，已完成核心模块。');
  });

  it('returns null on timeout', async () => {
    const generator = {
      generate: () => new Promise<string>(() => {}), // never resolves
    };
    const result = await generateSnapshotSummary(makeSnapshot(), generator, 50);
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    const generator = {
      generate: async () => {
        throw new Error('API down');
      },
    };
    const result = await generateSnapshotSummary(makeSnapshot(), generator);
    expect(result).toBeNull();
  });

  it('truncates long summaries to 500 chars', async () => {
    const generator = {
      generate: async () => 'x'.repeat(1000),
    };
    const result = await generateSnapshotSummary(makeSnapshot(), generator);
    expect(result!.length).toBe(500);
  });
});
