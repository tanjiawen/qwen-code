# CodeScope Graph Schema

## Nodes

| Node       | Key Properties                                                                                               | Notes                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `File`     | id, path, language, loc, is_external                                                                         | `is_external=1` for system headers / library stubs            |
| `Function` | id, name, qualified_name, signature, file_path, start_line, end_line, doc_comment, class_name, is_historical | `is_historical=1` for deleted/renamed functions               |
| `Class`    | id, name, qualified_name, file_path                                                                          |                                                               |
| `Module`   | id, name, path_prefix                                                                                        | Auto-discovered from directories (e.g. `kernel/sched`)        |
| `Commit`   | id, hash, message, author, timestamp, version_tag                                                            | `version_tag='bf'` means MODIFIES edges computed              |
| `Metadata` | id, value                                                                                                    | Pipeline state (e.g. `oldest_commit`)                         |
| `PR`       | id, title, author, risk_level, label                                                                         | Open pull request; populated by `codegraph pr-review prepare` |
| `AUTHOR`   | login, name, company, location, bio, avatar_url                                                              | GitHub user who opened the PR                                 |

## Edges

| Edge            | From → To           | Meaning                                                                                                                           |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CALLS`         | Function → Function | Static call graph (resolved from AST)                                                                                             |
| `DEFINES_FUNC`  | File → Function     | File defines this function                                                                                                        |
| `DEFINES_CLASS` | File → Class        | File defines this class                                                                                                           |
| `HAS_METHOD`    | Class → Function    | Class contains this method                                                                                                        |
| `IMPORTS`       | File → File         | Include / import dependency                                                                                                       |
| `BELONGS_TO`    | File → Module       | File belongs to this module                                                                                                       |
| `INHERITS`      | Class → Class       | Class inheritance                                                                                                                 |
| `COMPOSES`      | Class → Class       | Composition relationship (strong ownership, filled diamond in UML)                                                                |
| `AGGREGATES`    | Class → Class       | Aggregation relationship (optional/weak, open diamond in UML)                                                                     |
| `USES`          | Class → Class       | Dependency relationship (uses per-call, dashed arrow in UML)                                                                      |
| `MODIFIES`      | Commit → Function   | Commit changed this function (requires backfill)                                                                                  |
| `TOUCHES`       | Commit → File       | Commit changed this file (always present)                                                                                         |
| `CHANGES`       | PR → Function       | PR modifies this function; `info` = 'hunk' (modified in diff), 'deleted' (removed), 'related' (newly called), 'new' (newly added) |
| `OPENS`         | AUTHOR → PR         | Author opened this PR                                                                                                             |

## Backfill State

Not all commits have MODIFIES edges — only those with `version_tag = 'bf'`. TOUCHES edges are always present for all ingested commits.

```cypher
MATCH (c:Commit) WHERE c.version_tag = 'bf' RETURN count(c) AS backfilled
```

```cypher
MATCH (c:Commit) RETURN count(c) AS total_commits
```

## Neug Cypher Reference

**Supported syntax:**

- `MATCH`, `WHERE`, `RETURN`, `ORDER BY`, `LIMIT`, `WITH`
- Aggregations: `count()`, `count(DISTINCT x)`
- Inline property filters: `{name: 'foo'}`
- Variable-length paths: `[*1..3]`
- String predicates: `STARTS WITH`, `CONTAINS`, `ENDS WITH`
- Comparisons: `=`, `<>`, `<`, `>`, `<=`, `>=`
- Boolean: `AND`, `OR`, `NOT`

**Limitations:**

- Chained `MATCH` after `WITH` may be limited — prefer single `MATCH` clauses with multiple patterns separated by commas
- No `CREATE`, `SET`, `DELETE` via Cypher — graph mutations go through the Python API

## Class Dependency Relationships (UML-Style)

CodeScope extracts three UML relationship types from class fields and type annotations during indexing:

| Relationship | UML symbol           | Meaning                                           | How detected                                     |
| ------------ | -------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `COMPOSES`   | `*--` filled diamond | Strong ownership — field always holds an instance | Non-optional field assigned a constructed object |
| `AGGREGATES` | `o--` open diamond   | Optional/weak reference — may be `None`           | `Optional[X]`, `X \| None`, or assigned `None`   |
| `INHERITS`   | `<\|--` hollow arrow | Subclass extends parent                           | `class A(B)`                                     |

```python
# Get all composition relationships (A strongly owns B)
list(cs.conn.execute('MATCH (c1:Class)-[:COMPOSES]->(c2:Class) RETURN c1.name, c2.name'))

# Get all aggregation relationships (A optionally holds B)
list(cs.conn.execute('MATCH (c1:Class)-[:AGGREGATES]->(c2:Class) RETURN c1.name, c2.name'))

# How many objects does a class directly own?
list(cs.conn.execute(
    'MATCH (c:Class {name: "Llama"})-[:COMPOSES]->(t:Class) RETURN t.name'
))

# Full dependency graph for a class (composition + aggregation + inheritance)
list(cs.conn.execute(
    'MATCH (c:Class {name: "GPUModelRunner"})-[r:COMPOSES|AGGREGATES]->(t:Class) '
    'RETURN type(r), t.name'
))
```

**Generating a Mermaid class diagram:**

```python
inherits  = list(cs.conn.execute('MATCH (c1:Class)-[:INHERITS]->(c2:Class) RETURN c1.name, c2.name'))
composes  = list(cs.conn.execute('MATCH (c1:Class)-[:COMPOSES]->(c2:Class) RETURN c1.name, c2.name'))
aggregates = list(cs.conn.execute('MATCH (c1:Class)-[:AGGREGATES]->(c2:Class) RETURN c1.name, c2.name'))

print('classDiagram')
for src, tgt in inherits:   print(f'    {tgt} <|-- {src}')   # parent <|-- child
for src, tgt in composes:   print(f'    {src} *-- {tgt}')    # owner *-- owned
for src, tgt in aggregates: print(f'    {src} o-- {tgt}')    # holder o-- optional
```

**Scale reference:**

| Project          | Classes | INHERITS | COMPOSES | AGGREGATES | Index time |
| ---------------- | ------- | -------- | -------- | ---------- | ---------- |
| llama-cpp-python | 128     | 18       | 8        | 4          | ~2s        |
| vllm             | 4,002   | 2,185    | 3,217    | 149        | ~50s       |

## Troubleshooting

| Error                              | Cause                                  | Fix                                                                               |
| ---------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `Database locked`                  | Crashed process left neug lock         | `rm <db>/graph.db/neugdb.lock`                                                    |
| `Can't open lock file`             | zvec LOCK file deleted                 | `touch <db>/vectors/LOCK`                                                         |
| `Can't lock read-write collection` | Another process holds lock             | Kill the other process                                                            |
| `recovery idmap failed`            | Stale WAL files                        | Remove empty `.log` files from `<db>/vectors/idmap.0/`                            |
| HuggingFace model download fails   | Network/firewall blocks huggingface.co | Use `HF_ENDPOINT="https://hf-mirror.com"` or ModelScope (see Getting Started tip) |

The CLI auto-cleans lock issues on startup when possible.
