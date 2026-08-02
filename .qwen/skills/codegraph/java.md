# Java Support

CodeScope includes a full Java adapter that handles enterprise-scale repositories like Apache Hadoop (~8K files, ~97K functions indexed in ~3.5 minutes).

## What Gets Indexed

| Element           | Graph Node/Edge                    | Notes                                       |
| ----------------- | ---------------------------------- | ------------------------------------------- |
| Classes           | `Class` node                       | Includes generics, annotations              |
| Interfaces        | `Class` node                       | `extends` → `INHERITS` edge                 |
| Enums             | `Class` node                       | Enum methods extracted                      |
| Methods           | `Function` node                    | Full generic signatures, JavaDoc            |
| Constructors      | `Function` node (name=`<init>`)    | Including `super()` calls                   |
| Method calls      | `CALLS` edge                       | Receiver context preserved (`obj.method()`) |
| `new` expressions | `CALLS` edge to `ClassName.<init>` | Constructor invocations                     |
| Imports           | `IMPORTS` edge (file→file)         | Single, wildcard, static                    |
| Inner classes     | `Class` node (name=`Outer.Inner`)  | Prefixed with outer class                   |
| Inheritance       | `INHERITS` edge                    | `extends` + `implements`                    |

## Indexing a Java Project

```bash
codegraph init --repo /path/to/java-project --lang java --commits 500
```

Or with auto-detection (auto-detects `.java` files):

```bash
codegraph init --repo /path/to/java-project --lang auto
```

## Java-Specific Exclusions

By default, these directories are excluded when indexing Java projects: `target/`, `build/`, `.gradle/`, `.idea/`, `.settings/`, `bin/`, `out/`, `test/`, `tests/`, `src/test/`.

## Java Query Examples

```python
# Find all classes that extend a specific class
list(cs.conn.execute("""
    MATCH (c:Class)-[:INHERITS]->(p:Class {name: 'FileSystem'})
    RETURN c.name, c.file_path
"""))

# Find all methods in a specific class
list(cs.conn.execute("""
    MATCH (c:Class {name: 'DefaultParser'})-[:HAS_METHOD]->(f:Function)
    RETURN f.name, f.signature
"""))

# Find constructor call chains
list(cs.conn.execute("""
    MATCH (f:Function)-[:CALLS]->(init:Function {name: '<init>'})
    WHERE init.class_name = 'Configuration'
    RETURN f.name, f.file_path LIMIT 10
"""))
```
