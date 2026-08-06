import type React from 'react';
import { Box, Text } from 'ink';
import type { HarnessStatus } from '../utils/harness-status.js';

/**
 * ProgressPanel Better Harness 列在"无审计产物但有 gate/skill 状态记录"时
 * 显示的摘要体。独立成组件以便单独渲染验证与测试。
 */
export const HarnessStatusBody: React.FC<{ status: HarnessStatus }> = ({
  status,
}) => (
  <Box flexDirection="column">
    <Text dimColor>
      {status.gates[0]
        ? `Gate ${status.gates[0].result} · ${
            status.gates[0].detail?.slice(0, 16) ?? ''
          }`
        : '无 Gate 记录'}
    </Text>
    <Text dimColor>
      {status.skills[0]
        ? `Skill ${status.skills[0].name} · ${
            status.skills[0].status ?? 'invoked'
          }`
        : '无 Skill 记录'}
    </Text>
  </Box>
);
