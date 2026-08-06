/**
 * 可视化验证 HarnessStatusBody（ProgressPanel Better Harness 状态摘要体）：
 * 用真实 buildHarnessStatus 解析状态，渲染并观察显示文本。
 */
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { HarnessStatusBody } from './HarnessStatusBody.js';
import { buildHarnessStatus } from '../utils/harness-status.js';

describe('HarnessStatusBody (visual)', () => {
  it('渲染 gate + skill 状态', () => {
    const status = buildHarnessStatus(
      [
        JSON.stringify({
          ts: 1754500000000,
          type: 'gate',
          source: 'pre-commit',
          result: 'pass',
          detail: '影响半径分析通过（score 15）',
        }),
        JSON.stringify({
          ts: 1754500001000,
          type: 'skill',
          name: 'grill-me',
          status: 'invoked',
        }),
      ].join('\n'),
    );

    const { lastFrame } = render(<HarnessStatusBody status={status} />);
    const frame = lastFrame();

    // 打印渲染文本，供人工确认面板实际显示效果。
    process.stdout.write('\n===== HarnessStatusBody 渲染文本 =====\n');
    process.stdout.write(frame + '\n');
    process.stdout.write('======================================\n');

    expect(frame).toContain('Gate pass');
    expect(frame).toContain('grill-me');
  });

  it('无记录时显示占位', () => {
    const status = buildHarnessStatus('');
    const { lastFrame } = render(<HarnessStatusBody status={status} />);
    expect(lastFrame()).toContain('无 Gate 记录');
    expect(lastFrame()).toContain('无 Skill 记录');
  });
});
