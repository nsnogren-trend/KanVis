# KanVis v5 Migration Guide

## Overview

KanVis v5 is fully backwards compatible with v4. No action is required to continue using KanVis after upgrading. However, v5 introduces powerful new features you may want to enable.

## What's New

### 1. Undo/Redo Support

KanVis now tracks all your board modifications and allows you to undo mistakes.

**How to use:**
- Open command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
- Type "KanVis: Undo Last Action" to undo
- Type "KanVis: Redo Last Action" to redo

**What can be undone:**
- Adding windows to the board
- Removing windows
- Moving windows between columns
- Updating window properties

**Limitations:**
- History is limited to last 100 actions
- History is not persisted across VS Code restarts

### 2. Runtime Validation

All board data is now validated at runtime to catch corruption early.

**Benefits:**
- If data becomes corrupted, you'll see clear error messages
- Branded types prevent mixing up window IDs and column IDs
- Helps debug issues faster

**No action required** - validation happens automatically.

### 3. Multi-Window Synchronization (Experimental)

If you frequently work with multiple VS Code windows, you can enable CRDT-based synchronization.

**What it solves:**
- Prevents data loss when two windows modify the board simultaneously
- Changes merge automatically without conflicts
- All windows stay synchronized in real-time

**How to enable:**

1. Open VS Code settings (`Ctrl+,` or `Cmd+,`)
2. Search for "KanVis"
3. Enable "Kanvis: Enable CRDT Sync"
4. Restart VS Code

**When to use:**
- You regularly have 2+ VS Code windows open
- You modify the board from different windows
- You've experienced "last write wins" issues before

**When NOT to use:**
- You only use one VS Code window at a time
- You want maximum simplicity
- The feature is experimental and you prefer stable features

## Breaking Changes

**None!** KanVis v5 is fully backwards compatible.

## New Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `kanvis.enableCRDTSync` | boolean | `false` | Enable CRDT-based synchronization for conflict-free merging across multiple VS Code windows (experimental) |

## New Commands

| Command | Description |
|---------|-------------|
| `KanVis: Undo Last Action` | Undo the last board modification |
| `KanVis: Redo Last Action` | Redo a previously undone action |

## Troubleshooting

### Issue: Undo doesn't work

**Cause**: History is cleared when VS Code restarts.

**Solution**: This is expected behavior. Undo/redo history is kept in memory only.

### Issue: CRDT sync seems slow

**Cause**: Binary synchronization files can grow large over time.

**Solution**: Disable CRDT sync temporarily, delete `kanvis-sync.bin` from global storage, then re-enable.

### Issue: Validation errors on startup

**Cause**: Existing board data may have minor inconsistencies.

**Solution**: These are warnings, not errors. KanVis will continue to work. Check console for details.

## Performance Impact

### Memory Usage
- Undo/redo: ~1-2 MB for 100 events
- CRDT sync: ~500 KB for typical board

### Disk Usage
- CRDT sync adds `kanvis-sync.bin` file (~100-500 KB)
- JSON state file size unchanged

### CPU Usage
- Negligible impact in normal use
- CRDT merge operations complete in <10ms

## Rollback

If you experience issues, you can rollback to v4:

1. Uninstall KanVis v5
2. Install KanVis v4 from marketplace
3. Your board data will be preserved

## Support

- **Issues**: https://github.com/nsnogren-trend/KanVis/issues
- **Documentation**: See README.md
- **Changelog**: See CHANGELOG.md

## Future Enhancements

We're considering these features for future releases:

- Persistent undo/redo history
- Time-travel debugging (replay actions)
- React-based UI components
- Better drag-and-drop accessibility
- Property-based testing
- E2E testing with Playwright

Feedback welcome!
