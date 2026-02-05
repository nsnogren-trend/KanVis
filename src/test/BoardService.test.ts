import * as assert from 'assert';
import { BoardService } from '../services/BoardService';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { createWindow } from '../models/Window';

describe('BoardService', () => {
  let storage: MemoryStorageService;
  let service: BoardService;

  beforeEach(async () => {
    storage = new MemoryStorageService();
    service = new BoardService(storage);
    await service.initialize();
  });

  describe('initialize', () => {
    it('should load initial state from storage', async () => {
      const state = service.getState();
      
      assert.ok(state);
      assert.ok(Array.isArray(state.windows));
      assert.ok(Array.isArray(state.columns));
    });
  });

  describe('addOrUpdateWindow', () => {
    it('should add a new window', async () => {
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      
      await service.addOrUpdateWindow(window);
      
      const state = service.getState();
      assert.strictEqual(state.windows.length, 1);
      assert.strictEqual(state.windows[0].id, 'w1');
    });

    it('should update an existing window', async () => {
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      const updated = { ...window, name: 'Updated' };
      await service.addOrUpdateWindow(updated);
      
      const state = service.getState();
      assert.strictEqual(state.windows.length, 1);
      assert.strictEqual(state.windows[0].name, 'Updated');
    });
  });

  describe('removeWindow', () => {
    it('should remove a window', async () => {
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      await service.removeWindow('w1');
      
      const state = service.getState();
      assert.strictEqual(state.windows.length, 0);
    });
  });

  describe('moveWindow', () => {
    it('should move a window between columns', async () => {
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      await service.moveWindow('w1', 'active', 0);
      
      const state = service.getState();
      assert.strictEqual(state.windows[0].columnId, 'active');
    });
  });

  describe('onStateChange', () => {
    it('should notify listeners of state changes', async () => {
      let notified = false;
      
      service.onStateChange(() => {
        notified = true;
      });
      
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      assert.strictEqual(notified, true);
    });

    it('should allow unsubscribing', async () => {
      let count = 0;
      
      const unsubscribe = service.onStateChange(() => {
        count++;
      });
      
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      assert.strictEqual(count, 1);
      
      unsubscribe();
      
      await service.addOrUpdateWindow(window);
      assert.strictEqual(count, 1); // Should not increment
    });
  });

  describe('persistence', () => {
    it('should persist changes to storage', async () => {
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      await service.addOrUpdateWindow(window);
      
      // Create a new service with same storage
      const service2 = new BoardService(storage);
      await service2.initialize();
      
      const state = service2.getState();
      assert.strictEqual(state.windows.length, 1);
      assert.strictEqual(state.windows[0].id, 'w1');
    });
  });

  describe('cross-window sync', () => {
    it('should receive updates from external changes', async () => {
      let syncedState: any = null;
      
      service.onStateChange((state) => {
        syncedState = state;
      });
      
      // Simulate external update
      const externalState = service.getState();
      externalState.windows.push(createWindow('w2', 'External', '/ext', 'active', 0));
      await storage.save(externalState);
      
      // Storage should notify watchers
      assert.ok(syncedState);
      assert.strictEqual(syncedState.windows.length, 1);
    });
  });
});
