# KanVis 4

A VS Code extension to manage open windows in a sidebar. Rebuilt from the ground up with testability as a first-class concern.

## Goal

Stay on top of your different projects by visualizing all open VS Code windows in a simple kanban-style board in the sidebar.

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
│   └── Board.ts              # Board state
├── services/                 # Business logic
│   ├── IStorageService.ts    # Storage interface
│   ├── StorageService.ts     # Implementation
│   ├── WindowManager.ts      # Window lifecycle
│   └── BoardService.ts       # Board operations
├── webview/                  # UI layer
│   ├── BoardViewProvider.ts  # Webview provider
│   ├── main.ts               # Webview script
│   └── styles.css
└── test/                     # Unit tests
    └── *.test.ts
```

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
