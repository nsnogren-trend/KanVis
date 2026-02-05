import { BoardState } from '../models/Board.js';

/**
 * Interface for storage operations
 * This allows easy mocking in tests
 */
export interface IStorageService {
  /**
   * Load the board state from storage
   */
  load(): Promise<BoardState>;
  
  /**
   * Save the board state to storage
   */
  save(state: BoardState): Promise<void>;
  
  /**
   * Watch for external changes to storage
   * Returns a dispose function to stop watching
   */
  watch(callback: (state: BoardState) => void): () => void;
}
