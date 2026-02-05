import * as vscode from 'vscode';
import { BoardState, createDefaultBoard } from '../models/Board.js';
import { IStorageService } from './IStorageService.js';
import { BoardSync } from './BoardSync.js';

/**
 * V5 Enhanced Storage Service with CRDT-based synchronization
 * 
 * Key improvements:
 * - Uses Yjs CRDT for conflict-free merging
 * - Handles concurrent modifications from multiple windows
 * - No data loss from "last write wins"
 */
export class CRDTStorageService implements IStorageService {
  private static readonly STATE_FILE = 'kanvis-board.json';
  private static readonly SYNC_FILE = 'kanvis-sync.bin';
  private static readonly DEBOUNCE_MS = 300;
  
  private stateUri: vscode.Uri;
  private syncUri: vscode.Uri;
  private saveTimer?: NodeJS.Timeout;
  private fileWatcher?: vscode.FileSystemWatcher;
  private boardSync: BoardSync;
  private currentState: BoardState;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.stateUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      CRDTStorageService.STATE_FILE
    );
    this.syncUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      CRDTStorageService.SYNC_FILE
    );
    this.boardSync = new BoardSync();
    this.currentState = createDefaultBoard();
  }

  /**
   * Load board state from disk
   */
  async load(): Promise<BoardState> {
    try {
      // Try to load CRDT sync state first
      const syncData = await vscode.workspace.fs.readFile(this.syncUri);
      await this.boardSync.applyUpdate(syncData);
      this.currentState = await this.boardSync.extractState();
      console.log('[KanVis] Loaded CRDT sync state');
      return this.currentState;
    } catch {
      // Fall back to JSON state
      try {
        const data = await vscode.workspace.fs.readFile(this.stateUri);
        const content = Buffer.from(data).toString('utf8');
        const state = JSON.parse(content) as BoardState;
        
        if (!state.windows || !state.columns || !state.version) {
          throw new Error('Invalid state format');
        }
        
        // Initialize CRDT from JSON state
        await this.boardSync.loadState(state);
        this.currentState = state;
        console.log('[KanVis] Loaded JSON state, initialized CRDT');
        return state;
      } catch (error) {
        // Create default state
        console.log('[KanVis] Creating new board state');
        const defaultState = createDefaultBoard();
        await this.boardSync.loadState(defaultState);
        this.currentState = defaultState;
        return defaultState;
      }
    }
  }

  /**
   * Save board state to disk (debounced)
   */
  async save(state: BoardState): Promise<void> {
    // Update CRDT with new state
    this.currentState = state;
    await this.boardSync.loadState(state);

    // Clear any pending save
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // Schedule debounced save
    return new Promise((resolve, reject) => {
      this.saveTimer = setTimeout(async () => {
        try {
          await this.saveImmediate();
          resolve();
        } catch (error) {
          reject(error);
        }
      }, CRDTStorageService.DEBOUNCE_MS);
    });
  }

  /**
   * Save immediately without debouncing
   */
  private async saveImmediate(): Promise<void> {
    try {
      // Ensure directory exists
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      
      // Save JSON state for debugging/inspection
      const content = JSON.stringify(this.currentState, null, 2);
      await vscode.workspace.fs.writeFile(
        this.stateUri,
        Buffer.from(content, 'utf8')
      );

      // Save CRDT binary state for synchronization
      const syncUpdate = await this.boardSync.getUpdate();
      await vscode.workspace.fs.writeFile(
        this.syncUri,
        syncUpdate
      );

      console.log('[KanVis] Saved state and sync data');
    } catch (error) {
      console.error('[KanVis] Failed to save state:', error);
      throw error;
    }
  }

  /**
   * Watch for external changes with CRDT merging
   */
  watch(callback: (state: BoardState) => void): () => void {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.joinPath(this.stateUri, '..'),
      CRDTStorageService.SYNC_FILE
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handleChange = async () => {
      try {
        // Load the external update
        const syncData = await vscode.workspace.fs.readFile(this.syncUri);
        
        // Merge it with our CRDT state
        await this.boardSync.applyUpdate(syncData);
        
        // Extract merged state
        const mergedState = await this.boardSync.extractState();
        this.currentState = mergedState;
        
        console.log('[KanVis] Merged external changes via CRDT');
        callback(mergedState);
      } catch (error) {
        console.error('[KanVis] Failed to merge external changes:', error);
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
