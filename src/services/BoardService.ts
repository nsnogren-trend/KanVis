import { 
  BoardState, 
  upsertWindow, 
  removeWindow, 
  moveWindow, 
  updateWindowStatus,
  findWindow,
} from '../models/Board.js';
import { Window } from '../models/Window.js';
import { IStorageService } from './IStorageService.js';
import { EventHistory, KanVisEvent } from '../models/EventHistory.js';
import { validateBoardState } from '../models/validators.js';

/**
 * Service for managing board state and operations
 * Uses dependency injection for testability
 * 
 * V5 Enhancements:
 * - Event sourcing for undo/redo
 * - Runtime validation
 * - Audit trail
 */
export class BoardService {
  private state: BoardState;
  private listeners: Array<(state: BoardState) => void> = [];
  private history: EventHistory;

  constructor(private readonly storage: IStorageService) {
    this.state = { windows: [], columns: [], version: 1, lastModifiedAt: 0 };
    this.history = new EventHistory(100); // Keep last 100 actions
  }

  /**
   * Initialize the service by loading state
   */
  async initialize(): Promise<void> {
    const loadedState = await this.storage.load();
    
    // V5: Validate state before using
    const validation = validateBoardState(loadedState);
    if (!validation.valid) {
      console.warn('[BoardService] Loaded state has validation errors:', validation.errors);
      // Continue anyway, but log the issues
    }
    
    this.state = loadedState;
    
    // Watch for external changes
    // Only update if the external state is newer (from another window)
    this.storage.watch((newState) => {
      // Ignore if this is our own save (timestamp hasn't changed or is older)
      if (newState.lastModifiedAt <= this.state.lastModifiedAt) {
        console.log('[BoardService] Ignoring self-triggered file change');
        return;
      }
      
      console.log('[BoardService] Received external state update from another window');
      this.state = newState;
      this.notifyListeners();
    });
    
    this.notifyListeners();
  }

  /**
   * Get current board state
   */
  getState(): BoardState {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: (state: BoardState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Add or update a window
   */
  async addOrUpdateWindow(window: Window): Promise<void> {
    // V5: Record event for history
    const event: KanVisEvent = {
      kind: 'window_added',
      window,
      timestamp: Date.now()
    };
    this.history.recordEvent(event);
    
    this.state = upsertWindow(this.state, window);
    await this.saveAndNotify();
  }

  /**
   * Remove a window
   */
  async removeWindow(windowId: string): Promise<void> {
    // V5: Record event for history
    const event: KanVisEvent = {
      kind: 'window_removed',
      windowId,
      timestamp: Date.now()
    };
    this.history.recordEvent(event);
    
    this.state = removeWindow(this.state, windowId);
    await this.saveAndNotify();
  }

  /**
   * Move a window to a different column/position
   */
  async moveWindow(windowId: string, toColumnId: string, toOrder: number): Promise<void> {
    const window = findWindow(this.state, windowId);
    if (!window) {
      console.warn('[BoardService] moveWindow: window not found:', windowId);
      return;
    }
    
    console.log('[BoardService] Moving window:', windowId, 'from', window.columnId, 'to', toColumnId);
    
    // V5: Record event for history
    const event: KanVisEvent = {
      kind: 'window_moved',
      windowId,
      fromCol: window.columnId,
      toCol: toColumnId,
      fromOrder: window.order,
      toOrder,
      timestamp: Date.now()
    };
    this.history.recordEvent(event);
    
    this.state = moveWindow(this.state, windowId, toColumnId, toOrder);
    console.log('[BoardService] State updated, lastModifiedAt:', this.state.lastModifiedAt);
    
    await this.saveAndNotify();
    console.log('[BoardService] Move completed and saved');
  }

  /**
   * Update window's open status
   */
  async updateWindowStatus(windowId: string, isOpen: boolean): Promise<void> {
    this.state = updateWindowStatus(this.state, windowId, isOpen);
    await this.saveAndNotify();
  }

  /**
   * Update window properties
   */
  async updateWindow(windowId: string, updates: Partial<Window>): Promise<void> {
    const window = findWindow(this.state, windowId);
    if (!window) {
      return;
    }

    // V5: Record event for history
    const event: KanVisEvent = {
      kind: 'window_updated',
      windowId,
      changes: updates,
      timestamp: Date.now()
    };
    this.history.recordEvent(event);

    const updated = { ...window, ...updates, lastActiveAt: Date.now() };
    this.state = upsertWindow(this.state, updated);
    await this.saveAndNotify();
  }

  /**
   * V5: Undo the last action
   */
  async undo(): Promise<boolean> {
    const event = this.history.undo();
    if (!event) {
      return false;
    }
    
    // Apply inverse of the event
    switch (event.kind) {
      case 'window_added':
        this.state = removeWindow(this.state, event.window.id);
        break;
      case 'window_removed':
        // Can't fully undo a removal without the original data
        // This is a limitation of simple undo
        break;
      case 'window_moved':
        this.state = moveWindow(this.state, event.windowId, event.fromCol, event.fromOrder);
        break;
      case 'window_updated':
        // Partial undo of updates
        break;
    }
    
    await this.saveAndNotify();
    return true;
  }

  /**
   * V5: Redo the last undone action
   */
  async redo(): Promise<boolean> {
    const event = this.history.redo();
    if (!event) {
      return false;
    }
    
    // Reapply the event
    switch (event.kind) {
      case 'window_added':
        this.state = upsertWindow(this.state, event.window);
        break;
      case 'window_removed':
        this.state = removeWindow(this.state, event.windowId);
        break;
      case 'window_moved':
        this.state = moveWindow(this.state, event.windowId, event.toCol, event.toOrder);
        break;
      case 'window_updated':
        const window = findWindow(this.state, event.windowId);
        if (window) {
          this.state = upsertWindow(this.state, { ...window, ...event.changes });
        }
        break;
    }
    
    await this.saveAndNotify();
    return true;
  }

  /**
   * V5: Get history statistics
   */
  getHistoryStats() {
    return this.history.getStats();
  }

  /**
   * Save state and notify listeners
   */
  private async saveAndNotify(): Promise<void> {
    await this.storage.save(this.state);
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('[BoardService] Error in listener:', error);
      }
    });
  }
}
