# Question Routing Examples

A mapping from common user questions to the best CodeScope approach.

## How to Route Questions

The key decision is: **does the user want an exact structural answer, a fuzzy semantic one, or a bug-to-code mapping?**

| User asks...                                                 | Best approach                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| "Who calls `free_irq`?"                                      | Cypher: `MATCH (c:Function)-[:CALLS]->(f:Function {name: 'free_irq'}) RETURN c.name, c.file_path`                           |
| "Find functions related to memory allocation"                | `cs.vector_only_search("memory allocation")` or `cs.cross_locate("memory allocation")`                                      |
| "What's the most complex function?"                          | `cs.hotspots(topk=1)`                                                                                                       |
| "Is there dead code in the networking stack?"                | `cs.dead_code()` then filter by file path                                                                                   |
| "How has `schedule()` changed recently?"                     | `cs.change_attribution("schedule", "kernel/sched/core.c")`                                                                  |
| "Which modules are tightly coupled?"                         | `cs.module_coupling(topk=20)`                                                                                               |
| "Generate a full architecture report"                        | `codegraph analyze` or `generate_report(cs)`                                                                                |
| "What's the architectural role of `mm/`?"                    | `cs.layer_discovery()` then find `mm` entries                                                                               |
| "Which functions act as API boundaries?"                     | `cs.bridge_functions(topk=30)`                                                                                              |
| "Find commits about fixing race conditions"                  | `cs.intent_search("fix race condition")`                                                                                    |
| "What functions are always changed together with `kmalloc`?" | `cs.co_change("kmalloc")`                                                                                                   |
| "Why does this project have so many bugs?"                   | `cs.analyze_top_bugs("owner", "repo", k=10)` then aggregate hotspots                                                        |
| "Analyze issue #1234 from GitHub"                            | `cs.analyze_issue("owner", "repo", 1234)`                                                                                   |
| "What code is related to this bug?"                          | `cs.analyze_issue(...)` or manual `cross_locate(bug_description)`                                                           |
| "Find the root cause of the crash in issue #42"              | `cs.analyze_issue("owner", "repo", 42)`                                                                                     |
| "Which modules have the most bugs?"                          | `cs.analyze_top_bugs(...)` then aggregate by file/module                                                                    |
| "Index this Java project"                                    | `codegraph init --repo . --lang java`                                                                                       |
| "What classes extend FileSystem in Hadoop?"                  | Cypher: `MATCH (c:Class)-[:INHERITS]->(p:Class {name: 'FileSystem'}) RETURN c.name, c.file_path`                            |
| "Find all constructors called in this module"                | Cypher: `MATCH (f:Function)-[:CALLS]->(init:Function {name: '<init>'}) WHERE f.file_path CONTAINS 'module' RETURN ...`      |
| "Draw a class diagram / show class UML"                      | Query `COMPOSES`, `AGGREGATES`, `INHERITS` edges and render as Mermaid `classDiagram`                                       |
| "What does `Llama` own / compose?"                           | Cypher: `MATCH (c:Class {name:'Llama'})-[:COMPOSES]->(t:Class) RETURN t.name`                                               |
| "Which class holds a reference to `KVCacheManager`?"         | Cypher: `MATCH (c:Class)-[:COMPOSES\|AGGREGATES]->(t:Class {name:'KVCacheManager'}) RETURN c.name`                          |
| "Show all optional dependencies of `GPUModelRunner`"         | Cypher: `MATCH (c:Class {name:'GPUModelRunner'})-[:AGGREGATES]->(t:Class) RETURN t.name`                                    |
| "Review all open PRs and generate report"                    | `codegraph pr-review prepare --db ...`                                                                                      |
| "Which PRs can be auto-merged?"                              | Run `pr-review prepare`, check Part 1 of report                                                                             |
| "Are there conflicting PRs?"                                 | Run `pr-review prepare`, check Part 3 (connected components)                                                                |
| "What's the risk of PR #42?"                                 | `PRScorer.analyze(entry)` for per-PR scoring                                                                                |
| "What's the blast radius of this PR?"                        | `PRScorer.analyze(entry)` → `result['peak_blast']` and call graph viz                                                       |
| "Which PRs modify the same function?"                        | `CrossPRAnalyzer.connected_components()` → same-function edge type                                                          |
| "Label PRs with their review category"                       | `codegraph pr-review label --db ...`                                                                                        |
| "Post conflict comments on PRs"                              | `codegraph pr-review label --db ...` (automatic for conflicting PRs)                                                        |
| "Preview labels/comments without applying"                   | `codegraph pr-review label --db ... --dry-run`                                                                              |
| "Explore PR follow-up questions interactively"               | `codegraph explore --db .codegraph` (auto-includes PR patterns if `prepare` was run)                                        |
| "Query a specific PR's conflicts"                            | `PRReview.conflict_prs_of("42")` — returns list of conflicting PR numbers                                                   |
| "Query a specific PR's changed functions"                    | Cypher: `MATCH (pr:PR {id: '42'})-[c:CHANGES]->(f:Function) RETURN c.info, f.name, f.file_path`                             |
| "Compare two PRs for overlap"                                | Cypher: `MATCH (pr1:PR {id: '42'})-[c1:CHANGES]->(f:Function)<-[c2:CHANGES]-(pr2:PR {id: '43'}) RETURN f.name, f.file_path` |
| "Show only architecture questions"                           | `codegraph explore --db .codegraph --type architecture`                                                                     |
| "Show only PR review questions"                              | `codegraph explore --db .codegraph --type pr-review --role reviewer`                                                        |
| "Show top PR risk questions"                                 | `codegraph explore --db .codegraph --top 15 --role reviewer`                                                                |
| "Full PR review pipeline: analyze, label, explore"           | 1) `codegraph pr-review prepare` 2) `codegraph pr-review label` 3) `codegraph explore --db .codegraph`                      |

For **novel investigations** not covered by pre-built methods, compose raw Cypher queries. See [patterns.md](./patterns.md) for templates. For bug analysis patterns, see [bug-analysis.md](./bug-analysis.md).
