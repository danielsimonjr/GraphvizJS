<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Unused Files and Exports Analysis

## Summary

- **Files with no in-repo importer**: 2
- **Dormant files**: 4
  - **Orphaned (reachable from nothing)**: 2
  - **Test-only (only a test reaches them)**: 2
- **Potentially unused exports**: 42
  - **Unreferenced anywhere**: 0
  - **Referenced in their own module**: 42
  - **Not classified**: 0

## Caveats

- A literal relative `import(...)` is a graph edge. A runtime call is a namespace use (`*`), so the exports of that file count as used. A type-position `import(...).Name` counts only `Name`, and `typeof import(...)` counts none. A dynamic import built from a variable or a template, and other runtime loads (e.g. `new Worker(path)`), are still invisible -- a file or export reached ONLY through one of those is reported as no-importer/unreferenced even though it may be live.
- `noImporterFiles` is NOT a deletion-candidate list. A file with zero in-repo importers is expected, not suspicious, for: a standalone script invoked directly (e.g. a smoketest run via `node script.mjs`, never `import`ed by anything), or a build/lint config file loaded by its own tool rather than by source code (e.g. `eslint.config.mjs`, read by eslint itself). Cross-check against package.json scripts / tool configs before treating any entry here as dead.
- Only NAMED exports are analysed (`FileNode.exports` carries named exports only) -- `export default` usage is not checked here.
- The split of exports into `referencedInModule` and `unreferencedAnywhere` is a TEXT-LEVEL heuristic. The analysis counts whole-identifier occurrences in the source of the defining file, minus the declaration site itself. The count is not an AST reference count. The analysis can over-count a name that also appears in a string literal or comment. When the source text cannot be read (no `RepoGraph.root_path`, or the file is missing), the export lands in `unclassifiedExports`. The analysis does not guess a bucket for it.
- `unreferencedAnywhereNotes`'s dynamic-import check (`_dynamic_import_referrers`) only sees `import(...)` calls with a LITERAL string specifier. A dynamic import built from a variable or template literal (e.g. `import(`./cmds/${name}.js`)`, a command-dispatcher pattern) is invisible to it -- 'found none' in a note means no LITERAL match was found, NOT that nothing imports the file.

## Dormant files: orphaned

Source files that no root and no test reaches. Verify each one before you delete it.

- `src/platform/global.d.ts`
- `src/vite-env.d.ts`

## Dormant files: test-only

Source files that only a test reaches. They ship nothing, but a test uses them.

- `test/e2e/helpers.ts`
- `test/mocks/graphviz.ts`

## Files with no in-repo importer

No file of this repository imports these files. Do not use the list as a deletion list.

- `src/platform/global.d.ts`
- `src/vite-env.d.ts`

## Exports unreferenced anywhere

No other file imports these names, and their own module does not use them.

_None._

## Exports referenced in their own module

No other file imports these names, but their own module uses them.

- `cli/args.ts`: `ParseError`, `ParsedArgs`
- `cli/index.ts`: `formatStats`
- `core/dot-catalog.ts`: `AttrType`, `DotAttributeSpec`
- `core/export-pdf.ts`: `PageGeometry`
- `core/format.ts`: `FormatOptions`
- `core/graph-stats.ts`: `computeStats`
- `core/normalize-svg.ts`: `NormalizedSvg`
- `core/parse-graph.ts`: `Tok`, `TokKind`
- `core/scan-dot.ts`: `BalanceResult`, `SpanKind`
- `core/types.ts`: `PdfPageMode`, `PdfPageSize`
- `electron/app-menu.ts`: `rebuildAppMenu`
- `src/editor/linting.ts`: `DotLinterOptions`
- `src/editor/zoom.ts`: `EditorZoomController`
- `src/preferences/preferences-dialog.ts`: `PreferencesDialog`, `PreferencesDialogOptions`
- `src/preview/zoom.ts`: `ZoomController`
- `src/session/session.ts`: `CapturableTab`
- `src/stats/stats-dialog.ts`: `StatsDialog`, `StatsDialogOptions`
- `src/tabs/manager.ts`: `CreateTabOptions`
- `src/tabs/tab-bar.ts`: `TabBarCallbacks`, `TabBarOptions`
- `src/theme/color-scheme.ts`: `COLOR_SCHEME_KEY`, `ColorSchemeDeps`
- `src/toolbar/examples-menu.ts`: `ExamplesMenuOptions`
- `src/toolbar/export-menu.ts`: `ExportMenuOptions`
- `src/toolbar/find.ts`: `FindActionOptions`
- `src/toolbar/format.ts`: `FormatActionOptions`
- `src/toolbar/recent-menu.ts`: `RecentMenuOptions`
- `src/toolbar/save-as.ts`: `SaveAsOptions`
- `src/toolbar/shortcuts.ts`: `ToolbarShortcutsOptions`
- `src/toolbar/theme-button.ts`: `ThemeButtonOptions`
- `src/watch/file-watch.ts`: `FileWatchOptions`
- `test/mocks/graphviz.ts`: `DEFAULT_SVG`, `MockGraphvizInstance`, `createMockGraphvizInstance`, `mockGraphviz`

## Exports not classified

The analysis could not read the source of these names.

_None._
