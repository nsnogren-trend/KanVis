import { describe, it, beforeEach } from 'mocha';
import * as assert from 'assert';
import { BoardService } from '../services/BoardService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { Window } from '../models/Window';

describe('BoardService - File Watcher Race Condition Fix', () => {
  let service: BoardService;
  let storage: MemoryStorageService;

  beforeEach(async () => {
    storage = new MemoryStorageService();
    service = new BoardService(storage);
    await service.initialize();
  });

  it('should not revert window moves when file watcher triggers', async () => {
    // Add a window
    const window: Window = {
      id: 'test-window-1',
      columnId: 'backlog',
      order: 0,
      path: '/test/project',
      name: 'Test Project',
      isOpen: false,
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
    };

    await service.addOrUpdateWindow(window);
    
    // Get initial state
    const stateBefore = service.getState();
    assert.strictEqual(stateBefore.windows[0].columnId, 'backlog');

    // Move the window to a different column
    await service.moveWindow('test-window-1', 'active', 0);

    // Get state after move
    const stateAfter = service.getState();
    assert.strictEqual(stateAfter.windows[0].columnId, 'active', 'Window should be in active column');

    // Simulate file watcher triggering with the old state (race condition scenario)
    // This should be ignored because the timestamp is older
    const oldStateCallback = storage.getWatchCallback();
    if (oldStateCallback) {
      oldStateCallback(stateBefore);
    }

    // Verify the window is still in the active column (not reverted)
    const finalState = service.getState();
    assert.strictEqual(
      finalState.windows[0].columnId, 
      'active', 
      'Window should remain in active column after file watcher triggers with old state'
    );
  });

  it('should accept external changes with newer timestamps', async () => {
    // Add a window
    const window: Window = {
      id: 'test-window-1',
      columnId: 'backlog',
      order: 0,
      path: '/test/project',
      name: 'Test Project',
      isOpen: false,
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
    };

    await service.addOrUpdateWindow(window);

    // Get current state
    const currentState = service.getState();
    
    // Create a newer state (simulating another window making changes)
    const newerState = {
      ...currentState,
      lastModifiedAt: Date.now() + 1000, // Newer timestamp
      windows: currentState.windows.map(w => ({
        ...w,
        columnId: 'done' as any // Changed by "another window"
      }))
    };

    // Simulate file watcher with newer state
    const watchCallback = storage.getWatchCallback();
    if (watchCallback) {
      watchCallback(newerState);
    }

    // Should accept the external change
    const finalState = service.getState();
    assert.strictEqual(
      finalState.windows[0].columnId,
      'done',
      'Should accept external changes with newer timestamps'
    );
  });
});
