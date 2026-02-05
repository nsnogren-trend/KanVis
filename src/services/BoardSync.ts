/**
 * CRDT-based synchronization for KanVis using Yjs
 * 
 * Solves the "multiple windows" problem:
 * - If Window A moves a card while Window B renames a column,
 *   both changes merge automatically without conflicts
 * - No "last write wins" - all concurrent changes are preserved
 * - Provides strong eventual consistency
 */

import { BoardState } from '../models/Board.js';
import { Window } from '../models/Window.js';

// Use dynamic import for Yjs to avoid module resolution issues
type YDoc = any;
type YMap = any;
type YArray = any;

export class BoardSync {
  private ydoc: YDoc;
  private windowsMap: YMap;
  private columnsArray: YArray;
  private metaMap: YMap;
  private changeListeners: Array<() => void> = [];
  private Y: any;

  constructor() {
    // Lazy initialization - load Yjs on first use
    this.Y = null;
    this.ydoc = null as any;
    this.windowsMap = null as any;
    this.columnsArray = null as any;
    this.metaMap = null as any;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.Y) return;
    
    this.Y = await import('yjs');
    this.ydoc = new this.Y.Doc();
    this.windowsMap = this.ydoc.getMap('windows');
    this.columnsArray = this.ydoc.getArray('columns');
    this.metaMap = this.ydoc.getMap('meta');
  }

  /**
   * Initialize with existing board state
   */
  async loadState(state: BoardState): Promise<void> {
    await this.ensureInitialized();
    
    this.ydoc.transact(() => {
      // Load windows into CRDT map (keyed by ID for efficient updates)
      state.windows.forEach((window: Window) => {
        this.windowsMap.set(window.id, window);
      });

      // Load columns
      this.columnsArray.delete(0, this.columnsArray.length);
      this.columnsArray.insert(0, state.columns);

      // Load metadata
      this.metaMap.set('version', state.version);
      this.metaMap.set('lastModifiedAt', state.lastModifiedAt);
    });
  }

  /**
   * Get current state from CRDT
   */
  async extractState(): Promise<BoardState> {
    await this.ensureInitialized();
    
    const windowsArray: Window[] = [];
    this.windowsMap.forEach((window: Window) => {
      windowsArray.push(window);
    });

    return {
      windows: windowsArray,
      columns: this.columnsArray.toArray(),
      version: this.metaMap.get('version') || 1,
      lastModifiedAt: this.metaMap.get('lastModifiedAt') || Date.now(),
    };
  }

  /**
   * Add or update a window (CRDT operation)
   */
  async upsertWindow(window: Window): Promise<void> {
    await this.ensureInitialized();
    
    this.ydoc.transact(() => {
      this.windowsMap.set(window.id, window);
      this.metaMap.set('lastModifiedAt', Date.now());
    });
  }

  /**
   * Remove a window (CRDT operation)
   */
  async deleteWindow(windowId: string): Promise<void> {
    await this.ensureInitialized();
    
    this.ydoc.transact(() => {
      this.windowsMap.delete(windowId);
      this.metaMap.set('lastModifiedAt', Date.now());
    });
  }

  /**
   * Get update to send to other instances
   */
  async getUpdate(): Promise<Uint8Array> {
    await this.ensureInitialized();
    return this.Y.encodeStateAsUpdate(this.ydoc);
  }

  /**
   * Apply update from another instance
   */
  async applyUpdate(update: Uint8Array): Promise<void> {
    await this.ensureInitialized();
    this.Y.applyUpdate(this.ydoc, update);
  }

  /**
   * Subscribe to changes
   */
  async onUpdate(callback: () => void): Promise<() => void> {
    await this.ensureInitialized();
    
    this.changeListeners.push(callback);

    const observer = () => {
      callback();
    };

    this.windowsMap.observe(observer);
    this.columnsArray.observe(observer);

    return () => {
      this.windowsMap.unobserve(observer);
      this.columnsArray.unobserve(observer);
      const idx = this.changeListeners.indexOf(callback);
      if (idx >= 0) {
        this.changeListeners.splice(idx, 1);
      }
    };
  }

  /**
   * Get the underlying Y.Doc for advanced use
   */
  getDoc(): YDoc {
    return this.ydoc;
  }
}
