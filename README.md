# KanVis 5

A VS Code extension to manage open windows in a sidebar. Rebuilt from the ground up with testability as a first-class concern, now enhanced with event sourcing and CRDT-based synchronization.

## Goal

Stay on top of your different projects by visualizing all open VS Code windows in a simple kanban-style board in the sidebar.

## What's New in v5

### Event Sourcing & Undo/Redo
- **Complete History**: Every action is recorded as an event
- **Undo/Redo**: Use `Ctrl+Shift+P` → "KanVis: Undo Last Action" or "KanVis: Redo Last Action"
- **Time-Travel Debugging**: Full audit trail of all board operations
- **Deterministic State**: State is derived from events, making bugs reproducible

### Runtime Validation
- **Type Safety**: Zod-based validation catches data corruption at runtime
- **Branded Types**: Prevent mixing up window IDs and column IDs at compile time
- **Error Reporting**: Clear validation errors help debug issues

### Multi-Window Synchronization (Experimental)
- **CRDT Support**: Enable `kanvis.enableCRDTSync` setting for conflict-free replication
- **No Data Loss**: When two windows modify the board simultaneously, changes merge automatically
- **Strong Eventual Consistency**: All instances converge to the same state
- **Yjs Integration**: Industry-standard CRDT library ensures correctness

## Key Improvements Over v4

### Event Sourcing Architecture
- State changes recorded as events (WindowAdded, WindowMoved, etc.)
- Unlimited undo/redo history (configurable limit)
- Complete audit trail for debugging
- Enables time-travel debugging

### Type Safety
- Runtime validation with Zod schemas
- Branded types prevent ID confusion
- Validation errors caught early

### Optional CRDT Synchronization
- Conflict-free merging across multiple VS Code windows
- No "last write wins" - all concurrent changes preserved
- Real-time synchronization
- Enable via settings: `kanvis.enableCRDTSync: true`

## Key Improvements Over v3

### Testability First
- **Dependency Injection**: All services use constructor injection
- **Interface-based design**: Easy to mock and test
- **Pure functions**: Domain logic separated from side effects
- **Actual tests**: Unit tests included and runnable
- **Simpler architecture**: Fewer moving parts, clearer responsibilities

### Simplified Design
- Removed complex features that didn't add value (notifications, tags, archive)
- Focused on core goal: tracking windows
- Cleaner state management without unnecessary complexity
- No global singletons or tight coupling

## Architecture

```
src/
├── extension.ts              # Entry point with DI setup
├── models/                   # Pure domain models
│   ├── Window.ts             # Window representation
│   ├── Column.ts             # Column representation
│   ├── Board.ts              # Board state
│   ├── EventHistory.ts       # V5: Event sourcing & undo/redo
│   └── validators.ts         # V5: Runtime validation with Zod
├── services/                 # Business logic
│   ├── IStorageService.ts    # Storage interface
│   ├── StorageService.ts     # Standard implementation
│   ├── CRDTStorageService.ts # V5: CRDT-based storage
│   ├── BoardSync.ts          # V5: Yjs synchronization
│   ├── WindowManager.ts      # Window lifecycle
│   └── BoardService.ts       # Board operations (enhanced with events)
├── webview/                  # UI layer
│   ├── BoardViewProvider.ts  # Webview provider
│   ├── main.ts               # Webview script
│   └── styles.css
└── test/                     # Unit tests
    └── *.test.ts
```

## Configuration

### Settings

- `kanvis.enableCRDTSync`: (boolean, default: false) Enable CRDT-based synchronization for conflict-free merging across multiple VS Code windows. This is experimental but provides strong eventual consistency.

### Commands

- `KanVis: Open Board` - Open the KanVis board in the sidebar
- `KanVis: Refresh Board` - Refresh the current board state
- `KanVis: Undo Last Action` - Undo the last board modification (NEW in v5)
- `KanVis: Redo Last Action` - Redo a previously undone action (NEW in v5)

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run unit tests
npm run test:unit

# Debug in VS Code
Press F5
```

## Features

- **Window tracking**: Automatically tracks open VS Code windows
- **Simple columns**: Organize windows into columns (Backlog, Active, Done)
- **Drag & drop**: Move windows between columns
- **Status indicators**: See which windows are currently open
- **Git branch display**: Shows current branch for each window
- **Keyboard shortcuts**: Quick access to commands
