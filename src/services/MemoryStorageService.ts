import { BoardState, createDefaultBoard } from '../models/Board.js';
import { IStorageService } from './IStorageService.js';

/**
 * In-memory storage for testing
 */
export class MemoryStorageService implements IStorageService {
  private state: BoardState;
  private watchers: Array<(state: BoardState) => void> = [];

  constructor(initialState?: BoardState) {
    this.state = initialState || createDefaultBoard();
  }

  async load(): Promise<BoardState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  async save(state: BoardState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state));
    
    // Notify watchers
    this.watchers.forEach(watcher => {
      watcher(this.state);
    });
  }

  watch(callback: (state: BoardState) => void): () => void {
    this.watchers.push(callback);
    
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index >= 0) {
        this.watchers.splice(index, 1);
      }
    };
  }

  /**
   * Test helper: Get current state without cloning
   */
  getCurrentState(): BoardState {
    return this.state;
  }

  /**
   * Test helper: Get the watch callback for testing race conditions
   */
  getWatchCallback(): ((state: BoardState) => void) | undefined {
    return this.watchers[0];
  }
}
