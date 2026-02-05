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

/**
 * Service for managing board state and operations
 * Uses dependency injection for testability
 */
export class BoardService {
  private state: BoardState;
  private listeners: Array<(state: BoardState) => void> = [];

  constructor(private readonly storage: IStorageService) {
    this.state = { windows: [], columns: [], version: 1, lastModifiedAt: 0 };
  }

  /**
   * Initialize the service by loading state
   */
  async initialize(): Promise<void> {
    this.state = await this.storage.load();
    
    // Watch for external changes
    this.storage.watch((newState) => {
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
    this.state = upsertWindow(this.state, window);
    await this.saveAndNotify();
  }

  /**
   * Remove a window
   */
  async removeWindow(windowId: string): Promise<void> {
    this.state = removeWindow(this.state, windowId);
    await this.saveAndNotify();
  }

  /**
   * Move a window to a different column/position
   */
  async moveWindow(windowId: string, toColumnId: string, toOrder: number): Promise<void> {
    this.state = moveWindow(this.state, windowId, toColumnId, toOrder);
    await this.saveAndNotify();
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

    const updated = { ...window, ...updates, lastActiveAt: Date.now() };
    this.state = upsertWindow(this.state, updated);
    await this.saveAndNotify();
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
