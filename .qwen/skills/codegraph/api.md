# CodeScope Interfaces: CLI vs Python

Worked examples for the two ways to drive CodeScope. For the full Python method reference (raw queries, structural analysis, semantic search, evolution, report generation), see the "Core Python API" section in [SKILL.md](./SKILL.md). For class relationship (UML) methods and notation, see [schema.md](./schema.md).

## Two Interfaces: CLI vs Python

**Use the CLI** for status and reports:

```bash
codegraph status --db $CODESCOPE_DB_DIR
codegraph analyze --db $CODESCOPE_DB_DIR --output report.md
```

**Use the Python API** for queries and custom analyses:

```python
import os
os.environ['HF_HUB_OFFLINE'] = '1'  # required

from codegraph.core import CodeScope
cs = CodeScope(os.environ['CODESCOPE_DB_DIR'])

# Cypher query
rows = list(cs.conn.execute('''
    MATCH (caller:Function)-[:CALLS]->(f:Function {name: "free_irq"})
    RETURN caller.name, caller.file_path LIMIT 10
'''))
for r in rows:
    print(r)

cs.close()  # always close when done
```

The Python API is more powerful — it gives you raw Cypher access and lets you chain queries.
