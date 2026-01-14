# GraphvizJS Desktop Client

Cross-platform desktop application for creating, editing, and exporting Graphviz DOT diagrams.

**Version**: 1.0.0
**License**: MIT
**Based on**: MermaidJS Desktop Client by Martín M. (skydiver)

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | TypeScript 5.9, Vite 7.3, CodeMirror 6, @hpcc-js/wasm (Graphviz) |
| Desktop | Tauri 2.9 (Rust backend) |
| Icons | RemixIcon 4.7 |
| Linting | Biome 2.3 |
| Package Manager | pnpm |

## Project Structure

```
GraphvizJS/
├── src/                    # Frontend TypeScript/Vite source
│   ├── main.ts            # App bootstrap & state management
│   ├── index.html         # UI shell with toolbar & workspace
│   ├── editor/            # CodeMirror config & DOT syntax
│   ├── preview/           # Diagram rendering with Graphviz WASM
│   ├── toolbar/           # File operations & menu handlers
│   ├── workspace/         # Resizable pane layout
│   ├── window/            # Window state persistence
│   ├── help/              # Help dialog
│   ├── utils/             # Debounce utility
│   └── examples/          # Built-in .dot templates
├── src-tauri/              # Tauri Rust backend
│   ├── src/lib.rs         # App init, plugin setup, window restore
│   ├── src/main.rs        # Entry point
│   ├── tauri.conf.json    # Tauri configuration
│   ├── Cargo.toml         # Rust dependencies
│   └── icons/             # App icons
├── package.json
├── tsconfig.json
├── vite.config.ts
└── biome.jsonc
```

## Build Commands

```bash
# Install dependencies
pnpm install

# Development (browser only)
pnpm dev                    # http://localhost:5173

# Development (full desktop app with hot reload)
pnpm tauri dev

# Production build
pnpm build                  # Bundle frontend
pnpm tauri build            # Create installer (.exe, .app, .deb)

# Code quality
pnpm lint                   # Check with Biome
pnpm lint:fix               # Auto-fix issues
pnpm typecheck              # TypeScript check

# Clean build artifacts
pnpm clean
```

## Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain (rustc, cargo) - for Tauri builds only
- MSVC Build Tools (Windows) - for Tauri builds

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | App bootstrap, CodeMirror init, state management |
| `src/editor/language.ts` | DOT syntax highlighting |
| `src/preview/render.ts` | Graphviz WASM rendering |
| `src/toolbar/export-diagram.ts` | PNG/SVG export engine |
| `src-tauri/src/lib.rs` | Tauri plugin setup, window persistence |
| `src-tauri/tauri.conf.json` | App config, CSP, bundle settings |

## Version Synchronization

**CRITICAL**: Version must be updated in TWO locations:
- `package.json` → `"version": "x.x.x"`
- `src-tauri/tauri.conf.json` → `"version": "x.x.x"`

## DOT Syntax Keywords

Key DOT language elements for syntax highlighting:
- Keywords: `digraph`, `graph`, `subgraph`, `node`, `edge`, `strict`
- Attributes: `label`, `shape`, `color`, `style`, `fillcolor`, `fontname`, `fontsize`, `rankdir`, `rank`, `weight`
- Shapes: `box`, `ellipse`, `circle`, `diamond`, `record`, `plaintext`, `point`, `polygon`
- Arrows: `->`, `--`
- Compass points: `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`, `c`

## Adding Features

### New Toolbar Action
1. Create `src/toolbar/your-action.ts` with `export function setupYourAction(...)`
2. Add button to `src/index.html` with `data-action="your-action"`
3. Import and call setup in `src/toolbar/actions.ts`

### New Example Diagram
1. Add `.dot` file to `src/examples/` with numeric prefix (e.g., `08-cluster.dot`)
2. Add menu item in `src/index.html` under `[data-menu="examples"]`
3. Loaded automatically via Vite glob import

### New Export Format
1. Add to `ExportFormat` type in `src/toolbar/export-menu.ts`
2. Add menu item in HTML
3. Handle in `src/toolbar/export-diagram.ts`

## Graphviz Rendering

Uses `@hpcc-js/wasm` for client-side Graphviz rendering:
- Supports all Graphviz layout engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork)
- Outputs SVG for preview and export
- WebAssembly-based, runs entirely in browser

## Code Style (Biome)

- 2-space indentation
- Single quotes
- Trailing commas (ES5)
- 100 char line width
- Semicolons always
- Prefer `const`, no `var`
- LF line endings

## Tauri Plugins Used

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-dialog` | Native file open/save dialogs |
| `tauri-plugin-fs` | Filesystem read/write |
| `tauri-plugin-store` | Window state persistence |
| `tauri-plugin-shell` | Shell command execution |

## Supported File Formats

- `.dot` (primary)
- `.gv` (Graphviz)

## Export Capabilities

| Format | Details |
|--------|---------|
| PNG 1x | Min 512px, white background, 10px padding |
| PNG 2x | Min 1024px, `@2x` suffix |
| SVG | Direct Graphviz SVG output |

## Security

- CSP headers restrict inline scripts
- File access only through Tauri plugin APIs

## Debugging

```bash
pnpm tauri dev              # Dev with console output
pnpm tauri build --debug    # Debug build with symbols
```
