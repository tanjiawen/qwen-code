---
name: codegraph
description: Analyze indexed codebases via graph database (neug) and vector index (zvec). Covers call graphs, dependencies, dead code, hotspots, module coupling, architecture reports, semantic search, impact analysis, bug root cause from GitHub issues, class diagrams (UML), and PR review (risk scoring, conflict detection, auto-merge candidates, labeling). Also covers creating, inspecting, and repairing a CodeScope index. Use for: code structure, who calls what, why something changed, similar functions, module boundaries, bug tracing, class relationships, PR risk/conflicts, or any question benefiting from a code knowledge graph. Applies when a `.codegraph` index exists in the workspace, or when the user wants to create one.
---

# CodeScope Q&A

CodeScope indexes source code into a two-layer knowledge graph — **structure** (functions, calls, imports, classes, modules) and **evolution** (commits, file changes, function modifications) — plus **semantic embeddings** for every function. Supports **Python, JavaScript/TypeScript, C, and Java** (including Hadoop-scale repositories with 8K+ files). This combination enables analyses that grep, LSP, or pure vector search cannot do alone. It can also **fetch GitHub issues and trace bugs to code**, and **review open PRs** — scoring per-PR risk, detecting cross-PR conflicts, identifying auto-merge candidates, and applying GitHub labels.

## When to Use This Skill

- User asks about call chains, callers, callees, or dependencies
- User wants to find dead code, hotspots, or architectural layers
- User asks about code history, who changed what, or why something was modified
- User wants to find semantically similar functions across a codebase
- User wants a full architecture analysis or report
- User asks about module coupling, circular dependencies, or bridge functions
- User wants to index or analyze a Java project (Maven, Gradle, plain Java)
- User wants to analyze GitHub issues or bug reports to find root causes
- User asks "why does this project have so many bugs" or "what code is most buggy"
- User wants to trace a bug report to the most relevant code locations
- User asks about class relationships, ownership, composition, or wants a class diagram / UML
- User wants to understand which classes own or depend on other classes
- User wants to review PRs, assess PR risk, or prioritize PR reviews
- User asks about cross-PR conflicts or which PRs can be merged independently
- User wants to find auto-merge candidates or generate a PR review report
- User asks about the blast radius or impact scope of a PR
- User wants to apply labels to PRs from analysis results
- User wants to explore PR-specific follow-up questions for a given PR
- A `.codegraph` directory (or similar index) exists in the workspace

## Getting Started

### Installation

```bash
pip install codegraph-ai
```

### Environment Variables (optional)

```bash
# Create Python virtural environment
python -m venv .venv

source .venv/bin/activate

# Point to a pre-built database (skip indexing)
export CODESCOPE_DB_DIR="/path/to/.linux_db"

# Offline mode for HuggingFace models
export HF_HUB_OFFLINE="1"

# Fallback when HuggingFace is unreachable (e.g., network issues in China)
# Use HF mirror or ModelScope for sentence-transformers models:
export HF_ENDPOINT="https://hf-mirror.com"
# https://www.modelscope.cn/models/sentence-transformers/all-MiniLM-L6-v2
```

### Check Index Status

```bash
codegraph status --db $CODESCOPE_DB_DIR
```

If no index exists, create one:

```bash
codegraph init --repo . --lang auto --commits 500
```

Supported languages: `python`, `c`, `javascript`, `typescript`, `java`, or `auto` (auto-detects from file extensions).

The `--commits` flag ingests git history (for evolution queries). Without it, only structural analysis is available. Add `--backfill-limit 200` to also compute function-level `MODIFIES` edges (slower but enables `change_attribution` and `co_change`).

To add git history to an existing index (without re-indexing structure):

```bash
codegraph ingest --repo . --db $CODESCOPE_DB_DIR --commits 500
codegraph ingest --repo . --db $CODESCOPE_DB_DIR --backfill-limit 200   # add MODIFIES edges only
```

## Two Interfaces: CLI vs Python

Use the CLI (`codegraph status`, `codegraph analyze`) for status and reports, and the Python API (`CodeScope`) for queries and custom analyses — the Python API gives raw Cypher access and lets you chain queries. See [api.md](./api.md) for worked CLI-vs-Python examples.

## Core Python API

### Raw Queries

These are the building blocks for any custom analysis:

| Method                                  | What it does                                                           |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `cs.conn.execute(cypher)`               | Run any Cypher query against the graph — returns list of tuples        |
| `cs.vector_only_search(query, topk=10)` | Semantic search over all function embeddings — returns `[{id, score}]` |
| `cs.summary()`                          | Print a human-readable overview of the indexed codebase                |

### Structural Analysis

| Method                                          | What it does                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `cs.impact(func_name, change_desc, max_hops=3)` | Find callers up to N hops, ranked by semantic relevance to the change |
| `cs.hotspots(topk=10)`                          | Rank functions by structural risk (fan-in × fan-out)                  |
| `cs.dead_code()`                                | Find functions with zero callers (excluding entry points)             |
| `cs.circular_deps()`                            | Detect circular import chains at file level                           |
| `cs.module_coupling(topk=10)`                   | Find cross-module coupling pairs with call counts                     |
| `cs.bridge_functions(topk=30)`                  | Find functions called from the most distinct modules                  |
| `cs.layer_discovery(topk=30)`                   | Auto-discover infrastructure / mid / consumer layers                  |
| `cs.stability_analysis(topk=50)`                | Correlate fan-in with modification frequency                          |
| `cs.class_hierarchy(class_name=None)`           | Return inheritance tree for a class (or all classes)                  |

### Semantic Search

| Method                                          | What it does                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `cs.similar(function, scope, topk=10)`          | Find functions similar to a given function within a module scope        |
| `cs.cross_locate(query, topk=10)`               | Find semantically related functions, then reveal call-chain connections |
| `cs.semantic_cross_pollination(query, topk=15)` | Find similar functions across distant subsystems                        |

### Evolution (requires `--commits` during init)

| Method                                                            | What it does                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `cs.change_attribution(func_name, file_path=None, limit=20)`      | Which commits modified a function? (requires backfill) |
| `cs.co_change(func_name, file_path=None, min_commits=2, topk=10)` | Functions that are always modified together            |
| `cs.intent_search(query, topk=10)`                                | Find commits matching a natural-language intent        |
| `cs.commit_modularity(topk=20)`                                   | Score commits by how many modules they touch           |
| `cs.hot_cold_map(topk=30)`                                        | Module modification density                            |

### Report Generation

```python
from codegraph.analyzer import generate_report
report = generate_report(cs)  # full architecture analysis as markdown
```

Or via CLI:

```bash
codegraph analyze --output reports/analysis.md
```

The report covers: overview stats, subsystem distribution, top modules, architectural layers (with Mermaid diagrams), bridge functions, fan-in/fan-out hotspots, cross-module coupling, evolution hotspots, and dead code density.

## Class Dependency Relationships (UML-Style)

CodeScope extracts `COMPOSES` (strong ownership), `AGGREGATES` (optional reference), and `INHERITS` (subclass) relationships from class fields and type annotations. See [schema.md](./schema.md) for the UML notation table, detection rules, query examples, Mermaid class-diagram generation, and the scale reference.

## Java Support

CodeScope includes a full Java adapter for enterprise-scale repositories (e.g. Apache Hadoop). See [java.md](./java.md) for what gets indexed, indexing commands, Java-specific exclusions, and Java query examples.

## Bug Root Cause Analysis

CodeScope can fetch GitHub issues and map them to code using the graph + vector infrastructure — answering questions like "why does this project have so many bugs?" or "where does this bug come from?". Requires an indexed graph and an authenticated `gh` CLI. See [bug-analysis.md](./bug-analysis.md) for single-issue and batch analysis, the scoring system, lower-level components, issue caching, and stack-trace parsing.

## PR Review and Analysis

CodeScope can analyze open PRs against the indexed code graph to compute structural risk scores, detect cross-PR conflicts, and generate prioritized review reports. The unified pipeline is `codegraph pr-review prepare` (analyze + write to DB) followed by `codegraph pr-review label` (apply GitHub labels + comments). See [pr-analysis.md](./pr-analysis.md) for detailed workflows, the `PRReview` Python API, Cypher patterns, CrossPRAnalyzer query dimensions, the label scheme, and follow-up exploration.

## How to Route Questions

The key decision is whether the user wants an exact structural answer, a fuzzy semantic one, or a bug-to-code mapping. See [examples.md](./examples.md) for the full question→approach routing table. For **novel investigations** not covered by pre-built methods, compose raw Cypher queries — see [patterns.md](./patterns.md) for templates and the important Cypher filters (`is_historical`, `is_external`, `version_tag`, `LIMIT`) plus data-availability checks.

## Troubleshooting

For common database/lock errors and HuggingFace download failures, see the troubleshooting table in [schema.md](./schema.md). The CLI auto-cleans lock issues on startup when possible.

## References

- **[schema.md](./schema.md)** — Full graph schema: node types, edge types, properties, Cypher syntax notes, UML class relationships, troubleshooting
- **[patterns.md](./patterns.md)** — Ready-to-use Cypher query templates, composition strategies, important filters, and data-availability checks
- **[api.md](./api.md)** — Worked CLI-vs-Python interface examples
- **[examples.md](./examples.md)** — Question→approach routing table for common user questions
- **[java.md](./java.md)** — Java indexing support: what gets indexed, commands, exclusions, query examples
- **[bug-analysis.md](./bug-analysis.md)** — Bug analysis workflows: single issue, batch analysis, hotspot aggregation, custom pipelines, scoring, caching
- **[pr-analysis.md](./pr-analysis.md)** — PR analysis workflows: per-PR scoring, cross-PR conflict detection, Cypher patterns, CrossPRAnalyzer usage, labeling, exploration
