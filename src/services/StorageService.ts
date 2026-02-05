import * as vscode from 'vscode';
import { BoardState, createDefaultBoard } from '../models/Board.js';
import { IStorageService } from './IStorageService.js';

/**
 * Storage service using VS Code's global storage
 */
export class StorageService implements IStorageService {
  private static readonly STATE_FILE = 'kanvis-board.json';
  private static readonly DEBOUNCE_MS = 300;
  
  private stateUri: vscode.Uri;
  private saveTimer?: NodeJS.Timeout;
  private fileWatcher?: vscode.FileSystemWatcher;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.stateUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      StorageService.STATE_FILE
    );
  }

  /**
   * Load board state from disk
   */
  async load(): Promise<BoardState> {
    try {
      const data = await vscode.workspace.fs.readFile(this.stateUri);
      const content = Buffer.from(data).toString('utf8');
      const state = JSON.parse(content) as BoardState;
      
      // Validate it has required properties
      if (!state.windows || !state.columns || !state.version) {
        throw new Error('Invalid state format');
      }
      
      return state;
    } catch (error) {
      // If file doesn't exist or is invalid, return default state
      console.log('[KanVis] Creating new board state');
      return createDefaultBoard();
    }
  }

  /**
   * Save board state to disk (debounced)
   */
  async save(state: BoardState): Promise<void> {
    // Clear any pending save
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // Schedule debounced save
    return new Promise((resolve, reject) => {
      this.saveTimer = setTimeout(async () => {
        try {
          await this.saveImmediate(state);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, StorageService.DEBOUNCE_MS);
    });
  }

  /**
   * Save immediately without debouncing
   */
  private async saveImmediate(state: BoardState): Promise<void> {
    try {
      // Ensure directory exists
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      
      // Write state
      const content = JSON.stringify(state, null, 2);
      await vscode.workspace.fs.writeFile(
        this.stateUri,
        Buffer.from(content, 'utf8')
      );
    } catch (error) {
      console.error('[KanVis] Failed to save state:', error);
      throw error;
    }
  }

  /**
   * Watch for external file changes (other VS Code windows)
   */
  watch(callback: (state: BoardState) => void): () => void {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.joinPath(this.stateUri, '..'),
      StorageService.STATE_FILE
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handleChange = async () => {
      try {
        const state = await this.load();
        callback(state);
      } catch (error) {
        console.error('[KanVis] Failed to reload state:', error);
      }
    };

    this.fileWatcher.onDidChange(handleChange);
    this.fileWatcher.onDidCreate(handleChange);

    // Return dispose function
    return () => {
      this.fileWatcher?.dispose();
      this.fileWatcher = undefined;
    };
  }
}
