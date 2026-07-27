/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { CorrectionMemory } from './correction-memory.js';

describe('CorrectionMemory', () => {
  let cm: CorrectionMemory;

  beforeEach(() => {
    cm = new CorrectionMemory({ defaultTtl: 3 });
  });

  describe('processUserMessage', () => {
    it('detects "不要用 X" pattern', () => {
      const result = cm.processUserMessage('不要用 shell 做这个');
      expect(result).not.toBeNull();
      expect(result!.rule.type).toBe('avoid_tool');
      expect(result!.rule.avoidTool).toBe('run_shell_command');
    });

    it('detects "别用 edit" pattern', () => {
      const result = cm.processUserMessage('别用 edit 工具');
      expect(result).not.toBeNull();
      expect(result!.rule.type).toBe('avoid_tool');
      expect(result!.rule.avoidTool).toBe('edit');
    });

    it('detects "don\'t use X" pattern', () => {
      const result = cm.processUserMessage("don't use grep_search for this");
      expect(result).not.toBeNull();
      expect(result!.rule.type).toBe('avoid_tool');
      expect(result!.rule.avoidTool).toBe('grep_search');
    });

    it('detects general negation "不要 X"', () => {
      const result = cm.processUserMessage('不要修改测试文件');
      expect(result).not.toBeNull();
      expect(result!.rule.type).toBe('avoid_pattern');
      expect(result!.rule.avoidPattern).toBe('修改测试文件');
    });

    it('detects "错了" pattern', () => {
      const result = cm.processUserMessage('错了，应该先读取文件再编辑');
      expect(result).not.toBeNull();
      expect(result!.rule.type).toBe('custom');
      expect(result!.rule.customRule).toContain('应该先读取文件再编辑');
    });

    it('returns null for normal messages', () => {
      expect(cm.processUserMessage('帮我修复这个 bug')).toBeNull();
      expect(cm.processUserMessage('读取 src/index.ts')).toBeNull();
      expect(cm.processUserMessage('这个功能不错')).toBeNull();
    });
  });

  describe('tick and TTL', () => {
    it('decrements TTL each tick', () => {
      cm.processUserMessage('不要用 shell');
      expect(cm.size).toBe(1);

      cm.tick();
      expect(cm.size).toBe(1); // TTL 3→2

      cm.tick();
      expect(cm.size).toBe(1); // TTL 2→1

      cm.tick();
      expect(cm.size).toBe(0); // TTL 1→0, pruned
    });

    it('prunes expired corrections', () => {
      cm.processUserMessage('不要用 shell');
      cm.processUserMessage('别修改测试');

      // Tick 3 times to expire both
      cm.tick();
      cm.tick();
      cm.tick();
      expect(cm.size).toBe(0);
    });
  });

  describe('compileReminder', () => {
    it('returns null when no corrections', () => {
      expect(cm.compileReminder()).toBeNull();
    });

    it('compiles avoid_tool correction', () => {
      cm.processUserMessage('不要用 shell 做这个');
      const reminder = cm.compileReminder();
      expect(reminder).not.toBeNull();
      expect(reminder).toContain('Do NOT use run_shell_command');
      expect(reminder).toContain('<system-reminder>');
    });

    it('compiles avoid_pattern correction', () => {
      cm.processUserMessage('不要修改测试文件');
      const reminder = cm.compileReminder();
      expect(reminder).toContain('Do NOT: 修改测试文件');
    });

    it('compiles multiple corrections', () => {
      cm.processUserMessage('不要用 shell');
      cm.processUserMessage('别修改测试');
      const reminder = cm.compileReminder();
      expect(reminder).toContain('run_shell_command');
      expect(reminder).toContain('修改测试');
    });
  });

  describe('clear', () => {
    it('removes all corrections', () => {
      cm.processUserMessage('不要用 shell');
      cm.processUserMessage('别修改测试');
      expect(cm.size).toBe(2);
      cm.clear();
      expect(cm.size).toBe(0);
      expect(cm.compileReminder()).toBeNull();
    });
  });
});
