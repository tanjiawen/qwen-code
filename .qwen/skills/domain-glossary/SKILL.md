---
name: domain-glossary
description: Build and maintain a shared vocabulary (Ubiquitous Language) for
  the codebase in GLOSSARY.md, so every AI conversation and agent references
  the same terms. Use when starting a new project, when the AI is verbose or
  misunderstanding terms, or when domain terminology is scattered. Grounded in
  Eric Evans' Domain-Driven Design.
blueprint:
  strictOrder: true
  completionCheck: 'GLOSSARY.md exists at the project root and covers the core terms actually used.'
  steps:
    - description: 'Scan the codebase for domain terms and abbreviations'
      tool: 'agent'
    - description: 'Draft GLOSSARY.md from the terms found'
      tool: 'write_file'
    - description: 'Confirm the glossary with the user'
      requires: 'GLOSSARY.md drafted'
constraints:
  - type: mandatory
    description: 'Every AI conversation about design or code must reference GLOSSARY.md when it exists'
    mandatory:
      condition: 'design or implementation work touches domain concepts'
---

# Domain Glossary (Ubiquitous Language)

A shared vocabulary is the cheapest way to make an AI concise and correct. When
you and the model share the exact meaning of every term, the model stops
guessing what you mean each conversation and its reasoning gets shorter.

Based on Eric Evans' **Ubiquitous Language** from _Domain-Driven Design_: build
one terminology system that developers and domain experts share, and use it
everywhere — code, docs, conversations.

## When To Use

- Starting a new project (create the glossary early).
- The AI is verbose or repeatedly misunderstands terms.
- Domain terminology is scattered across files, or the same concept has several
  names (e.g. "order", "purchase", "checkout").
- Before a non-trivial design conversation.

## What GLOSSARY.md Contains

A single markdown file at the project root. Keep it tight — only terms that
actually matter, with one canonical definition each.

```markdown
# Glossary

| Term             | Canonical meaning       | Notes / aliases              |
| ---------------- | ----------------------- | ---------------------------- |
| <canonical term> | One-sentence definition | aliases to avoid, boundaries |
```

For each term record:

- **Canonical term** — the single name to use in code, docs, and chats.
- **Canonical meaning** — one sentence.
- **Aliases to avoid** — other names people or the AI might use, so the model
  learns to normalize to the canonical term.

## How To Build It

1. Scan the codebase for domain terms: module names, types, function prefixes,
   config keys, jargon, acronyms.
2. Group near-synonyms and pick one canonical name per concept.
3. Write `GLOSSARY.md` at the project root.
4. Confirm with the user — the glossary is a shared agreement, not a dump.

## How To Use It

- Reference `GLOSSARY.md` in every subsequent design or implementation
  conversation.
- When the AI uses a non-canonical alias, normalize it to the canonical term.
- Update the glossary when a new term becomes load-bearing or a term is
  renamed.

## Rules

- **Keep it small.** A glossary that grows past ~50 terms is a sign the domain
  is fragmented or terms are being recorded that nobody uses.
- **One canonical meaning per term.** No synonyms treated as equal.
- **It is a living artifact.** Update it as the domain evolves; do not let it
  drift from the code.
