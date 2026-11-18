# Repo Wiki — Maintainer Rules

<!--
This is the schema file for a Karpathy-pattern LLM wiki over THIS code repository.
Drop it at the repo root (as CLAUDE.md or AGENTS.md). It tells the agent how the
wiki is structured and what workflows to follow. You and the agent co-evolve it over
time: when a mistake recurs, add a rule here so you stop re-teaching it every session.
-->

## Role

You maintain the wiki for this code repository. The source code (in the repo's normal
source directories) is the RAW layer: read-only, immutable, the source of truth. You
NEVER edit source code as part of wiki work.

The `wiki/` directory is yours: create pages, update them, maintain cross-references,
keep everything consistent. The human curates sources, directs analysis, and asks
questions. You do the bookkeeping — summarizing, cross-referencing, filing, linting.

## Page types

- `wiki/modules/<name>.md` — one page per package / top-level source directory.
  Cover: responsibility, public API/surface, key files, what it depends on, what depends on it.
- `wiki/entities/<name>.md` — a key class, function, or service.
  Cover: signature, purpose, call sites, `[[wikilinks]]` to related pages. Must link back
  to the `modules/` page it lives in.
- `wiki/concepts/<name>.md` — a cross-cutting topic (auth, caching, DB access, logging,
  error handling, config). Cover: which files participate and how they cooperate.
- `wiki/flows/<name>.md` — an end-to-end flow (login flow, payment flow, request lifecycle).
  Walk it in call order; link to each entity page involved.

## Conventions

- Cross-link pages with `[[wikilink]]`.
- Every page starts with YAML frontmatter:
  ```yaml
  ---
  title: <page title>
  source_files:            # relative paths in the repo this page describes
    - src/auth/login.ts
  updated: YYYY-MM-DD
  tags: [module, auth]
  ---
  ```
- Entity pages MUST link back to their module page.
- Prefer plain-English explanation of *intent* ("what this is for") over restating code.
- New page vs. edit: create a NEW page when it's a distinct entity/concept you'd link to
  from elsewhere; edit IN PLACE when it's an attribute/update of an existing one.

## Special files

- `wiki/index.md` — content catalog. One line per page: link + one-line summary,
  grouped by category (modules, entities, concepts, flows). Update on every ingest.
  When answering a query, read this FIRST to find relevant pages, then drill in.
- `wiki/log.md` — chronological, append-only. Each entry starts with a consistent prefix
  so it's greppable: `## [YYYY-MM-DD] <op> | <scope>` (op = ingest | query | lint).
  Example: `grep "^## \[" wiki/log.md | tail -5` gives the 5 most recent actions.

## Workflows

### Ingest — turn code into wiki pages
1. Read the specified file(s)/directory.
2. Discuss key points with me (purpose, notable design, gotchas).
3. Write/update the matching `modules/` and `entities/` pages.
4. Update affected `concepts/` and `flows/` pages. One ingest often touches 5–15 pages.
5. Update `index.md`; append a line to `log.md`.

COLD START: on the very first pass do NOT ingest the whole repo at once — it causes
drift. Do `overview.md` + skeleton `index.md` first, then one module at a time with me
reviewing each summary, then flows.

### Query — answer from the wiki
Read `index.md` → open the relevant pages → synthesize a cited answer using `[[links]]`.
File high-value answers (architecture analyses, comparisons, connections) back as new
wiki pages so explorations compound.

### Lint — periodic health check
Find and report: contradictions; stale pages (a page's `source_files` changed in git more
recently than its `updated` date); orphan pages (no inbound links); important classes with
no entity page; missing cross-references; dead `source_files` paths. Offer to fix. Run
this regularly — it's what keeps the wiki trustworthy as it grows.

## Notes for humans

- The wiki is just a git repo of markdown — commit it; history is your audit trail.
- Open `wiki/` in Obsidian to browse links and the graph view.
- To visualize the finished wiki as a force-directed graph, point
  Understand-Anything at it: `/understand-knowledge <repo>/wiki`.
