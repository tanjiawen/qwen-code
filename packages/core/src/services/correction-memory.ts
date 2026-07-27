/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Correction Memory: detects user negation/correction statements and
 * compiles them into short-lived constraints injected via system-reminder.
 *
 * Inspired by DataFlow-Harness's insight that user corrections should
 * persist as constraints across subsequent turns, not just the current one.
 */

export interface CorrectionRule {
  type:
    | 'avoid_tool'
    | 'prefer_tool'
    | 'avoid_pattern'
    | 'prefer_pattern'
    | 'custom';
  avoidTool?: string;
  preferTool?: string;
  avoidPattern?: string;
  preferPattern?: string;
  customRule?: string;
}

export interface Correction {
  id: string;
  timestamp: number;
  userMessage: string;
  rule: CorrectionRule;
  remainingTurns: number;
}

const KNOWN_TOOLS = [
  'read_file',
  'write_file',
  'edit',
  'run_shell_command',
  'grep_search',
  'glob',
  'agent',
  'list_directory',
  'notebook_edit',
];

// Aliases: short names users might say → canonical tool name
const TOOL_ALIASES: Record<string, string> = {
  shell: 'run_shell_command',
  bash: 'run_shell_command',
  terminal: 'run_shell_command',
  read: 'read_file',
  write: 'write_file',
  grep: 'grep_search',
  search: 'grep_search',
};

function resolveToolName(text: string): string | undefined {
  // Check canonical names first
  const canonical = KNOWN_TOOLS.find((t) => text.includes(t));
  if (canonical) return canonical;
  // Check aliases (word boundary match)
  for (const [alias, tool] of Object.entries(TOOL_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(text)) return tool;
  }
  return undefined;
}

const NEGATION_PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray, full: string) => CorrectionRule | null;
}> = [
  // "不要用 X" / "别用 X" / "don't use X"
  {
    regex: /(?:不要|别|don'?t\s+)(?:用\s*|使用\s*|use\s+)(\w+)/i,
    extract: (m) => {
      const tool = resolveToolName(m[1]);
      if (tool) return { type: 'avoid_tool', avoidTool: tool };
      return { type: 'avoid_pattern', avoidPattern: m[1] };
    },
  },
  // "不要 X" / "别 X" / "don't X" (general negation)
  {
    regex: /(?:不要|别再?|don'?t|stop\s+)(.{2,60})/i,
    extract: (m) => {
      const text = m[1].trim();
      const tool = resolveToolName(text);
      if (tool) return { type: 'avoid_tool', avoidTool: tool };
      return { type: 'avoid_pattern', avoidPattern: text };
    },
  },
  // "应该用 X" / "use X instead"
  {
    regex: /(?:应该用|改用|用\s*)(\w+)(?:而不是|代替|替代|instead)/i,
    extract: (m) => {
      const tool = resolveToolName(m[1]);
      if (tool) return { type: 'prefer_tool', preferTool: tool };
      return { type: 'prefer_pattern', preferPattern: m[1] };
    },
  },
  // "不是 X，是 Y" / "not X, use Y"
  {
    regex: /(?:不是|not\s+)(.{2,30}?)[,，]\s*(?:是|用|use\s+)(.{2,30})/i,
    extract: (m) => {
      const tool = resolveToolName(m[2]);
      if (tool) return { type: 'prefer_tool', preferTool: tool };
      return { type: 'prefer_pattern', preferPattern: m[2].trim() };
    },
  },
  // "错了" / "wrong" followed by correction
  {
    regex: /(?:错了|不对|wrong)[,，.。]?\s*(.{3,60})/i,
    extract: (m) => ({ type: 'custom', customRule: m[1].trim() }),
  },
];

export class CorrectionMemory {
  private corrections: Correction[] = [];
  private readonly defaultTtl: number;
  private readonly maxCorrections: number;

  constructor(opts?: { defaultTtl?: number; maxCorrections?: number }) {
    this.defaultTtl = opts?.defaultTtl ?? 10;
    this.maxCorrections = opts?.maxCorrections ?? 20;
  }

  /**
   * Process a user message and detect correction patterns.
   * Returns the detected correction if any, null otherwise.
   */
  processUserMessage(message: string): Correction | null {
    for (const { regex, extract } of NEGATION_PATTERNS) {
      const match = message.match(regex);
      if (match) {
        const rule = extract(match, message);
        if (rule) {
          const correction: Correction = {
            id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            userMessage: message,
            rule,
            remainingTurns: this.defaultTtl,
          };
          this.corrections.push(correction);
          this.prune();
          return correction;
        }
      }
    }
    return null;
  }

  /** Decrement TTL for all corrections. Call once per turn. */
  tick(): void {
    for (const c of this.corrections) {
      c.remainingTurns--;
    }
    this.prune();
  }

  /** Compile active corrections into a system-reminder string. */
  compileReminder(): string | null {
    if (this.corrections.length === 0) return null;

    const lines = this.corrections
      .map((c) => {
        switch (c.rule.type) {
          case 'avoid_tool':
            return `- Do NOT use ${c.rule.avoidTool} (user explicitly requested)`;
          case 'prefer_tool':
            return `- Prefer ${c.rule.preferTool} (user explicitly requested)`;
          case 'avoid_pattern':
            return `- Do NOT: ${c.rule.avoidPattern}`;
          case 'prefer_pattern':
            return `- Should: ${c.rule.preferPattern}`;
          case 'custom':
            return `- ${c.rule.customRule}`;
          default:
            return null;
        }
      })
      .filter(Boolean);

    if (lines.length === 0) return null;

    return [
      '<system-reminder>',
      '## User Correction Constraints (MUST follow)',
      'The user gave these corrections earlier in this session:',
      ...lines,
      `These constraints are active for ${this.corrections[0]?.remainingTurns ?? 0} more turns.`,
      '</system-reminder>',
    ].join('\n');
  }

  /** Number of active corrections. */
  get size(): number {
    return this.corrections.length;
  }

  /** Clear all corrections. */
  clear(): void {
    this.corrections = [];
  }

  private prune(): void {
    this.corrections = this.corrections.filter((c) => c.remainingTurns > 0);
    if (this.corrections.length > this.maxCorrections) {
      this.corrections = this.corrections.slice(-this.maxCorrections);
    }
  }
}
