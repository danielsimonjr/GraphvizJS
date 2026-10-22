<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Duplicate Symbols

A name is listed here when two or more distinct files across the monorepo define it. A file that only re-exports the name does not count. Each name carries one tag (see `DupEntryTag`), so the actionable subset is clear:

- `TRUE_DUPLICATE`: a real merge target.
- `DISPATCH_VARIANT`: two or more `mathTyped(...)` registrations of the same public name. The registrations are distinct dispatch surfaces and Bucket C delegation candidates, not copy-paste bodies.
- `ALIAS_DELEGATION`: a `const X = importedY` forward. The entry is excluded once fewer than two real bodies remain.
- `ALLOWLISTED`: the name matches `duplicate-allowlist.json`. Examples are hot-path `is*` guards, AssemblyScript mirrors and per-package `VERSION` strings.

> **Note:** This report groups names by OWN definition, not by call graph, then classifies each flagged name (see DupEntryTag): TRUE_DUPLICATE (the actionable merge targets), DISPATCH_VARIANT (>=2 mathTyped(...) registrations of the same public name — distinct dispatch surfaces, Bucket C delegation candidates, not copy-paste bodies), ALIAS_DELEGATION (a const-alias forward to an imported symbol, not an independent body — excluded once fewer than 2 real bodies remain), and ALLOWLISTED (matches duplicate-allowlist.json: hot-path is* guards, AssemblyScript mirrors, per-package VERSION strings). NOT detected: same-file typed-dispatch overload polymorphism for different argument shapes within one registration — a human still triages TRUE_DUPLICATE entries using the defining files + public flags before merging anything.

## Summary — runtime (function/constant/class)

| Category | Count |
| --- | --: |
| **TRUE_DUPLICATE** (actionable) | 0 |
| DISPATCH_VARIANT | 0 |
| ALIAS_DELEGATION | 0 |
| ALLOWLISTED | 4 |
| _Total flagged names_ | 4 |

## Summary — types (interface/type/enum)

| Category | Count |
| --- | --: |
| **TRUE_DUPLICATE** (actionable) | 0 |
| DISPATCH_VARIANT | 0 |
| ALIAS_DELEGATION | 0 |
| ALLOWLISTED | 0 |
| _Total flagged names_ | 0 |

## Runtime duplicates

### TRUE_DUPLICATE — actionable merge targets

_None._

### DISPATCH_VARIANT — distinct public typed-dispatch surfaces (Bucket C candidates)

_None._

### ALIAS_DELEGATION — const-alias forwards (not independent bodies)

_None._

### ALLOWLISTED — accepted layering (see duplicate-allowlist.json)

| Name | Category | Defining files (package, public?, sub-tag) | Canonical hint |
| --- | --- | --- | --- |
| `formatDot` | function | `core/format.ts` (unknown, public, PLAIN)<br>`src/platform/index.ts` (unknown, internal, ALLOWLISTED: Each name is a renderer wrapper in src/platform/index.ts. The wrapper calls an IPC channel of the main process. A function of the same name sits on the other side of that channel, in core/ or in electron/. The renderer imports no runtime module of core, only the types in core/types. The two definitions are the two sides of the IPC boundary, not a copy.) | `core/format.ts` |
| `graphStats` | function | `core/graph-stats.ts` (unknown, public, PLAIN)<br>`src/platform/index.ts` (unknown, internal, ALLOWLISTED: Each name is a renderer wrapper in src/platform/index.ts. The wrapper calls an IPC channel of the main process. A function of the same name sits on the other side of that channel, in core/ or in electron/. The renderer imports no runtime module of core, only the types in core/types. The two definitions are the two sides of the IPC boundary, not a copy.) | `core/graph-stats.ts` |
| `setMenuTheme` | function | `electron/app-menu.ts` (unknown, internal, PLAIN)<br>`src/platform/index.ts` (unknown, internal, ALLOWLISTED: Each name is a renderer wrapper in src/platform/index.ts. The wrapper calls an IPC channel of the main process. A function of the same name sits on the other side of that channel, in core/ or in electron/. The renderer imports no runtime module of core, only the types in core/types. The two definitions are the two sides of the IPC boundary, not a copy.) | `internal-only` |
| `validateDiagram` | function | `core/validate.ts` (unknown, public, PLAIN)<br>`src/platform/index.ts` (unknown, internal, ALLOWLISTED: Each name is a renderer wrapper in src/platform/index.ts. The wrapper calls an IPC channel of the main process. A function of the same name sits on the other side of that channel, in core/ or in electron/. The renderer imports no runtime module of core, only the types in core/types. The two definitions are the two sides of the IPC boundary, not a copy.) | `core/validate.ts` |

## Type duplicates (lower priority)

### TRUE_DUPLICATE

_None._

### DISPATCH_VARIANT

_None._

### ALIAS_DELEGATION

_None._

### ALLOWLISTED

_None._
