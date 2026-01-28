# KanVis

A complete rewrite of the KanVis VS Code extension - A Kanban board for managing VS Code windows and workspaces.

## Features

- **Workspace Tracking**: Automatically registers open workspaces as cards on a kanban board
- **Cross-Window Sync**: Real-time synchronization across all VS Code windows using file-based state
- **Git Branch Display**: Shows current git branch on each card
- **Drag & Drop**: Move cards between columns to track project status
- **Window Status**: Visual indicators showing open (green) or closed (grey) windows
- **Notifications**: Send messages between windows that appear on cards
- **Card Customization**: Set colors, notes, tags, and rename cards
- **Search & Filter**: Filter cards by name, branch, notes, or path
- **Undo/Redo**: Undo and redo actions on the board
- **Keyboard Shortcuts**: Move current window to columns with `Ctrl+K Ctrl+[1-4]`
- **Column Management**: Add, rename, reorder, and delete columns from the UI
- **Card Archive**: Archive cards instead of deleting them
- **Tags**: Create and apply tags to organize cards

## Architecture

KanVis is built with a clean, modular architecture:

```
src/
├── extension.ts           # Slim entry point with command registration
├── core/
│   ├── EventBus.ts        # Typed event system for decoupled communication
│   ├── StateManager.ts    # Pure state operations with event-driven updates
│   ├── StorageService.ts  # File persistence with debouncing & atomic writes
│   └── SyncService.ts     # Cross-window synchronization
├── services/
│   ├── GitService.ts      # Non-blocking git branch detection
│   ├── WindowTracker.ts   # Window lifecycle management
│   └── NotificationService.ts
├── ui/
│   ├── BoardViewProvider.ts
│   └── webview/           # Separate webview source
│       ├── main.ts        # Bundled separately with esbuild
│       └── styles.css
├── types/
│   ├── index.ts           # All interfaces with branded types
│   └── messages.ts        # Typed webview message protocol
└── utils/
    ├── debounce.ts
    ├── hash.ts
    └── errors.ts
```

## Key Improvements over KanVis v1

1. **Event-Driven Architecture**: Decoupled components communicate through a typed EventBus
2. **Debounced Persistence**: Writes are batched and debounced to reduce disk I/O
3. **Atomic Writes**: State is written to a temp file first, then renamed for safety
4. **Schema Versioning**: State includes version number for future migrations
5. **Non-Blocking Git**: Git extension activation doesn't block the main thread
6. **Separate Webview Build**: Webview code is bundled separately for better maintainability
7. **Typed Messages**: All webview communication uses TypeScript types
8. **Undo/Redo Support**: History tracking for reversible operations
9. **Better Error Handling**: Custom error classes and proper error logging

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the extension:
   ```bash
   npm run compile
   ```

3. Press F5 in VS Code to launch the Extension Development Host

## Development

- `npm run watch` - Watch mode for development
- `npm run compile` - One-time build
- `npm run lint` - Run ESLint
- `npm run test` - Run tests

## Commands

| Command | Description |
|---------|-------------|
| `KanVis.openBoard` | Open the Kanban Board |
| `KanVis.refreshBoard` | Refresh the board |
| `KanVis.setWindowStatus` | Set the current window's status (column) |
| `KanVis.notifyWindow` | Send a notification to another window |
| `KanVis.addWorkspace` | Add a workspace to the board |
| `KanVis.clearAll` | Clear all cards |
| `KanVis.editCard` | Edit the current window's card |
| `KanVis.undo` | Undo last action |
| `KanVis.redo` | Redo last action |
| `KanVis.moveToColumn1-4` | Move current window to column 1-4 |

## Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+K Ctrl+1` | Move to column 1 |
| `Ctrl+K Ctrl+2` | Move to column 2 |
| `Ctrl+K Ctrl+3` | Move to column 3 |
| `Ctrl+K Ctrl+4` | Move to column 4 |
| `Ctrl+Z` (in board) | Undo |
| `Ctrl+Shift+Z` (in board) | Redo |

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `KanVis.columns` | array | Default 4 columns | Column definitions |
| `KanVis.showClosedWindows` | boolean | true | Show cards for closed windows |
| `KanVis.compactView` | boolean | false | Use compact card view |
| `KanVis.autoArchiveAfterDays` | number | 0 | Auto-archive inactive cards (0 = disabled) |

## License

MIT

