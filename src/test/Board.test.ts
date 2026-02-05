import * as assert from 'assert';
import { 
  createDefaultBoard, 
  upsertWindow, 
  removeWindow, 
  moveWindow,
  findWindow,
  getWindowsInColumn,
} from '../models/Board';
import { createWindow } from '../models/Window';

describe('Board Model', () => {
  describe('createDefaultBoard', () => {
    it('should create a board with default columns', () => {
      const board = createDefaultBoard();
      
      assert.strictEqual(board.windows.length, 0);
      assert.strictEqual(board.columns.length, 3);
      assert.strictEqual(board.columns[0].id, 'backlog');
      assert.strictEqual(board.columns[1].id, 'active');
      assert.strictEqual(board.columns[2].id, 'done');
    });
  });

  describe('upsertWindow', () => {
    it('should add a new window', () => {
      const board = createDefaultBoard();
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      
      const updated = upsertWindow(board, window);
      
      assert.strictEqual(updated.windows.length, 1);
      assert.strictEqual(updated.windows[0].id, 'w1');
    });

    it('should update an existing window', () => {
      const board = createDefaultBoard();
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      const withWindow = upsertWindow(board, window);
      
      const updatedWindow = { ...window, name: 'Updated' };
      const result = upsertWindow(withWindow, updatedWindow);
      
      assert.strictEqual(result.windows.length, 1);
      assert.strictEqual(result.windows[0].name, 'Updated');
    });
  });

  describe('removeWindow', () => {
    it('should remove a window by id', () => {
      const board = createDefaultBoard();
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      const withWindow = upsertWindow(board, window);
      
      const result = removeWindow(withWindow, 'w1');
      
      assert.strictEqual(result.windows.length, 0);
    });
  });

  describe('moveWindow', () => {
    it('should move a window to a different column', () => {
      const board = createDefaultBoard();
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      const withWindow = upsertWindow(board, window);
      
      const result = moveWindow(withWindow, 'w1', 'active', 0);
      
      const movedWindow = findWindow(result, 'w1');
      assert.strictEqual(movedWindow?.columnId, 'active');
    });

    it('should reorder windows in same column', () => {
      let board = createDefaultBoard();
      const w1 = createWindow('w1', 'Test1', '/test1', 'backlog', 0);
      const w2 = createWindow('w2', 'Test2', '/test2', 'backlog', 1);
      const w3 = createWindow('w3', 'Test3', '/test3', 'backlog', 2);
      
      board = upsertWindow(board, w1);
      board = upsertWindow(board, w2);
      board = upsertWindow(board, w3);
      
      // Move w1 to position 2
      board = moveWindow(board, 'w1', 'backlog', 2);
      
      const windows = getWindowsInColumn(board, 'backlog');
      assert.strictEqual(windows[0].id, 'w2');
      assert.strictEqual(windows[1].id, 'w3');
      assert.strictEqual(windows[2].id, 'w1');
    });
  });

  describe('findWindow', () => {
    it('should find a window by id', () => {
      const board = createDefaultBoard();
      const window = createWindow('w1', 'Test', '/test', 'backlog', 0);
      const withWindow = upsertWindow(board, window);
      
      const found = findWindow(withWindow, 'w1');
      
      assert.strictEqual(found?.id, 'w1');
      assert.strictEqual(found?.name, 'Test');
    });

    it('should return undefined for non-existent window', () => {
      const board = createDefaultBoard();
      const found = findWindow(board, 'nonexistent');
      
      assert.strictEqual(found, undefined);
    });
  });

  describe('getWindowsInColumn', () => {
    it('should return windows sorted by order', () => {
      let board = createDefaultBoard();
      const w1 = createWindow('w1', 'Test1', '/test1', 'backlog', 2);
      const w2 = createWindow('w2', 'Test2', '/test2', 'backlog', 0);
      const w3 = createWindow('w3', 'Test3', '/test3', 'active', 0);
      
      board = upsertWindow(board, w1);
      board = upsertWindow(board, w2);
      board = upsertWindow(board, w3);
      
      const windows = getWindowsInColumn(board, 'backlog');
      
      assert.strictEqual(windows.length, 2);
      assert.strictEqual(windows[0].id, 'w2'); // order 0
      assert.strictEqual(windows[1].id, 'w1'); // order 2
    });
  });
});
