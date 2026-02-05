# Change Log

## [5.0.0] - 2026-02-05

### Added
- **Event Sourcing**: All board modifications are now tracked as events
- **Undo/Redo**: Added commands to undo and redo board actions (100-event history)
- **Runtime Validation**: Zod-based validation catches data corruption at runtime
- **Branded Types**: Compile-time type safety prevents mixing up window IDs and column IDs
- **CRDT Synchronization**: Optional Yjs-based synchronization for conflict-free multi-window support
- New commands:
  - `KanVis: Undo Last Action`
  - `KanVis: Redo Last Action`
- New setting: `kanvis.enableCRDTSync` (experimental)
- Comprehensive documentation in REFACTORING_SUMMARY.md and MIGRATION_GUIDE.md

### Changed
- `BoardService` now records events for all state changes
- Storage service can optionally use CRDT-based synchronization
- Enhanced error messages with validation details
- Updated README with v5 features

### Fixed
- Data loss when multiple windows modify board simultaneously (when CRDT sync enabled)

### Technical
- Added dependencies: `zod`, `yjs`, `lib0`
- New files: `EventHistory.ts`, `validators.ts`, `BoardSync.ts`, `CRDTStorageService.ts`
- All tests passing
- Security scan clean (0 alerts)
- Fully backwards compatible with v4

## [4.0.0] - 2026-02-05

### Added
- Kanban-style board to track VS Code windows
- Three columns: Backlog, Current, Priorities
- Drag and drop windows between columns
- Git branch display for each window
- Automatic window registration
- Cross-window state synchronization

### Features
- Click a card to open that workspace in a new window
- Visual indicators for open (green) vs closed windows
- Current window highlighted
- Vertical column layout optimized for sidebar

## [Initial Release]
- Complete rewrite focused on testability and simplicity
