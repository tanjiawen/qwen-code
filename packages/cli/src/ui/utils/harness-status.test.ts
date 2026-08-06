import { describe, it, expect } from 'vitest';
import { buildHarnessStatus, type HarnessEvent } from './harness-status.js';

/** 构造一条 gate 状态行。 */
function gateLine(overrides: Partial<HarnessEvent> = {}): string {
  return JSON.stringify({
    ts: 1754500000000,
    type: 'gate',
    source: 'stop-hook',
    result: 'pass',
    detail: 'change-test-evidence 检查通过',
    ...overrides,
  });
}

/** 构造一条 skill 状态行。 */
function skillLine(overrides: Partial<HarnessEvent> = {}): string {
  return JSON.stringify({
    ts: 1754500001000,
    type: 'skill',
    name: 'grill-me',
    status: 'invoked',
    ...overrides,
  });
}

describe('buildHarnessStatus', () => {
  it('空输入返回空状态', () => {
    const status = buildHarnessStatus('');
    expect(status.gates).toEqual([]);
    expect(status.skills).toEqual([]);
    expect(status.latest).toBeNull();
  });

  it('解析 gate 记录并按结果归类', () => {
    const status = buildHarnessStatus(
      [gateLine(), gateLine({ result: 'block', detail: '大改动无测试' })].join(
        '\n',
      ),
    );
    expect(status.gates).toHaveLength(2);
    expect(status.gates[0].result).toBe('pass');
    expect(status.gates[1].result).toBe('block');
  });

  it('解析 skill 记录，最新在前', () => {
    const status = buildHarnessStatus(
      [
        skillLine({ name: 'grill-me' }),
        skillLine({ name: 'tdd-first', ts: 1754500002000 }),
      ].join('\n'),
    );
    expect(status.skills).toHaveLength(2);
    expect(status.skills[0].name).toBe('tdd-first');
    expect(status.skills[1].name).toBe('grill-me');
  });

  it('latest 指向 ts 最大的一条', () => {
    const status = buildHarnessStatus(
      [
        skillLine({ ts: 1000 }),
        gateLine({ ts: 2000, result: 'warn' }),
        skillLine({ ts: 3000, name: 'deep-module' }),
      ].join('\n'),
    );
    expect(status.latest?.name).toBe('deep-module');
  });

  it('忽略损坏行，不抛错', () => {
    const status = buildHarnessStatus(['not-json', '', gateLine()].join('\n'));
    expect(status.gates).toHaveLength(1);
    expect(status.latest?.source).toBe('stop-hook');
  });

  it('limit 限制返回条数，且最新的优先', () => {
    const lines = [
      skillLine({ ts: 1, name: 'a' }),
      skillLine({ ts: 2, name: 'b' }),
      skillLine({ ts: 3, name: 'c' }),
    ].join('\n');
    const status = buildHarnessStatus(lines, 2);
    expect(status.skills).toHaveLength(2);
    expect(status.skills[0].name).toBe('c');
    expect(status.skills[1].name).toBe('b');
  });
});
