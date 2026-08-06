/**
 * Better Harness pre-commit gate (Layer 1 of the mandatory gate).
 *
 * Runs the Better Harness blast-radius analysis over the pending commit and
 * hard-blocks (exit 1) when the change is critical-severity, removes
 * security-sensitive code, or touches a high/critical-risk core area.
 *
 * Maintainer exemption: core-area blocks are downgraded to a warning when the
 * commit author matches `maintainers` in .better-harness/blast-radius.json
 * (AGENTS.md: "maintainer-authored PRs are exempt"). Critical-severity and
 * security-removal blocks are objective and never exempted.
 *
 * Fail-open with a core backstop: if Better Harness is not installed or the
 * analysis throws, the commit proceeds — but when the staged change touches a
 * configured core area, a prominent warning is emitted instead of a silent
 * pass, so enforcement never degrades invisibly. Bypass deliberately with
 * `git commit --no-verify` (same as the lint gate).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const CONFIG_PATH = path.join(REPO, '.better-harness', 'blast-radius.json');
const BH = process.env.BETTER_HARNESS_DIR || path.join(os.homedir(), 'better-harness');
const BLAST = path.join(BH, 'hooks/git-scripts/blast-radius.mjs');

/** 追加一条 gate 触发记录到 .qwen/harness-status.jsonl（fail-open）。 */
function recordStatus(result, detail) {
  try {
    const dir = path.join(REPO, '.qwen');
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: Date.now(),
      type: 'gate',
      source: 'pre-commit',
      result,
      detail,
    });
    appendFileSync(path.join(dir, 'harness-status.jsonl'), line + '\n');
  } catch {
    // fail-open：记录失败不影响门禁本身。
  }
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function gitLines(args) {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 暂存区相对路径文件清单（含已修改与新增）。 */
function stagedFiles() {
  return gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
}

/** 提交作者标识（姓名 + 邮箱，小写）。 */
function commitAuthor() {
  const { status, stdout } = spawnSync(
    'git',
    ['log', '-1', '--format=%an%x00%ae'],
    { cwd: REPO, encoding: 'utf8' },
  );
  return status === 0 ? stdout.trim().toLowerCase() : '';
}

/** 提交作者是否命中配置的 maintainer 名单（子串匹配，大小写不敏感）。 */
function isMaintainerAuthor(config) {
  const maintainers = Array.isArray(config.maintainers) ? config.maintainers : [];
  if (maintainers.length === 0) return false;
  const author = commitAuthor();
  if (author === '') return false;
  return maintainers.some((entry) => {
    const id = String(entry).trim().toLowerCase();
    return id !== '' && (author.includes(id) || id.includes(author));
  });
}

/** 极简 glob → RegExp（支持 * 与 **）。 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(char)) {
      re += `\\${char}`;
    } else {
      re += char;
    }
  }
  return new RegExp(`^${re}$`);
}

/** 暂存改动是否触及配置的核心模块（不依赖 Better Harness 的兜底检测）。 */
function touchesCore(config) {
  const coreEntries = Array.isArray(config.core) ? config.core : [];
  const patterns = coreEntries.flatMap((entry) =>
    Array.isArray(entry.paths) ? entry.paths : [],
  );
  if (patterns.length === 0) return false;
  const matchers = patterns.map(globToRegExp);
  return stagedFiles().some((file) => matchers.some((re) => re.test(file)));
}

function warnCoreUnguarded(why) {
  console.warn('\n[better-harness] ══ 警告：核心模块改动未经影响半径分析 ══');
  console.warn(`  原因：${why}`);
  console.warn(
    '  本次提交触及 .better-harness/blast-radius.json 标记的核心模块，但 Better Harness 不可用，门禁只能放行。',
  );
  console.warn('  请安装 Better Harness 后重试，或确认改动安全；紧急时可 git commit --no-verify。\n');
}

const config = readConfig();

// 依赖缺失：fail-open，但核心模块改动须给出醒目告警而非静默放行。
if (!existsSync(BLAST)) {
  if (touchesCore(config)) {
    warnCoreUnguarded(`未找到 ${BLAST}（可设 BETTER_HARNESS_DIR 覆盖）`);
  } else {
    console.warn('[better-harness] skip: Better Harness 未安装，非核心改动放行。');
  }
  process.exit(0);
}

const { analyzeRepository, formatReviewMessage } = await import(
  pathToFileURL(BLAST).href
);

let report;
try {
  report = await analyzeRepository(REPO, {});
} catch (error) {
  if (touchesCore(config)) {
    warnCoreUnguarded(`影响半径分析失败（${error.message}）`);
  } else {
    console.warn(`[better-harness] analysis failed, allowing commit: ${error.message}`);
  }
  process.exit(0);
}

// 客观阻断：critical 影响半径——对任何作者都不豁免。
const objectiveBlockers = [];
if (report.severity === 'critical') {
  objectiveBlockers.push(`影响半径 severity=critical（score ${report.score}）`);
}

// 可豁免阻断：核心模块命中、安全相关代码移除。maintainer 作者降级为警告。
// securityRemovals 是关键词启发式，对门禁/安全代码自身的编辑会频繁误报，
// 故对 maintainer 豁免；非 maintainer 仍硬阻断。
const coreBlockers = (report.coreHits ?? [])
  .filter((hit) => ['critical', 'high'].includes(hit.risk))
  .map((hit) => `改动核心模块 ${hit.rule}（risk=${hit.risk}）→ ${hit.target}`);
const securityBlockers =
  (report.securityRemovals ?? []).length > 0
    ? [`${report.securityRemovals.length} 处安全相关代码被移除`]
    : [];
const exemptableBlockers = [...coreBlockers, ...securityBlockers];

const maintainer = isMaintainerAuthor(config);
const blockers = [...objectiveBlockers];
if (exemptableBlockers.length > 0) {
  if (maintainer) {
    console.warn(
      `[better-harness] maintainer 豁免：以下 ${exemptableBlockers.length} 处降级为警告：`,
    );
    for (const reason of exemptableBlockers) {
      console.warn(`  - ${reason}`);
    }
    console.warn('  里程碑/PR 前请运行完整审计：/better-harness');
  } else {
    blockers.push(...exemptableBlockers);
  }
}

if (blockers.length > 0) {
  console.error('\n[better-harness] ══ 提交被 Better Harness 门禁阻断 ══');
  for (const reason of blockers) {
    console.error(`  - ${reason}`);
  }
  console.error('');
  console.error(formatReviewMessage(report));
  console.error('\n如确属误报：调整 .better-harness/blast-radius.json 阈值，或 git commit --no-verify 绕过。');
  console.error('里程碑/PR 前请运行完整审计：/better-harness\n');
  recordStatus('block', `影响半径阻止提交（${blockers.length} 项）`);
  process.exit(1);
}

if (report.severity === 'high') {
  console.warn(
    `[better-harness] 警告：影响半径 severity=high（score ${report.score}），建议运行 /better-harness 审计。`,
  );
  recordStatus('warn', `影响半径 severity=high（score ${report.score}）`);
} else {
  recordStatus('pass', `影响半径分析通过（score ${report.score}）`);
}

process.exit(0);
