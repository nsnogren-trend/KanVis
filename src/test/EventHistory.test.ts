import { describe, it } from 'mocha';
import * as assert from 'assert';
import { EventHistory, KanVisEvent } from '../models/EventHistory';

describe('EventHistory', () => {
  it('should start with no history', () => {
    const history = new EventHistory();
    assert.strictEqual(history.canUndo(), false);
    assert.strictEqual(history.canRedo(), false);
  });

  it('should record events', () => {
    const history = new EventHistory();
    const event: KanVisEvent = {
      kind: 'window_added',
      window: {
        id: 'test-1',
        columnId: 'active',
        order: 0,
        path: '/test',
        name: 'Test',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      },
      timestamp: Date.now(),
    };

    history.recordEvent(event);
    assert.strictEqual(history.canUndo(), true);
    assert.strictEqual(history.canRedo(), false);
  });

  it('should support undo', () => {
    const history = new EventHistory();
    const event: KanVisEvent = {
      kind: 'window_removed',
      windowId: 'test-1',
      timestamp: Date.now(),
    };

    history.recordEvent(event);
    const undoneEvent = history.undo();

    assert.strictEqual(undoneEvent, event);
    assert.strictEqual(history.canUndo(), false);
    assert.strictEqual(history.canRedo(), true);
  });

  it('should support redo', () => {
    const history = new EventHistory();
    const event: KanVisEvent = {
      kind: 'window_removed',
      windowId: 'test-1',
      timestamp: Date.now(),
    };

    history.recordEvent(event);
    history.undo();
    
    const redoneEvent = history.redo();
    assert.strictEqual(redoneEvent, event);
    assert.strictEqual(history.canRedo(), false);
  });

  it('should clear redo history when new event is recorded', () => {
    const history = new EventHistory();
    
    const event1: KanVisEvent = {
      kind: 'window_removed',
      windowId: 'test-1',
      timestamp: Date.now(),
    };
    
    const event2: KanVisEvent = {
      kind: 'window_removed',
      windowId: 'test-2',
      timestamp: Date.now(),
    };

    history.recordEvent(event1);
    history.undo();
    
    assert.strictEqual(history.canRedo(), true);
    
    history.recordEvent(event2);
    assert.strictEqual(history.canRedo(), false);
  });

  it('should respect max size limit', () => {
    const history = new EventHistory(3);
    
    for (let i = 0; i < 5; i++) {
      const event: KanVisEvent = {
        kind: 'window_removed',
        windowId: `test-${i}`,
        timestamp: Date.now(),
      };
      history.recordEvent(event);
    }

    const stats = history.getStats();
    assert.strictEqual(stats.total, 3);
  });
});
