import * as Y from 'yjs';
import type { BoardState, Window, Column } from '../types/schema.js';

/**
 * CRDT-based board synchronization using Yjs
 * 
 * This ensures conflict-free replication across multiple VS Code windows:
 * - If Window A moves a card and Window B renames a column simultaneously,
 *   both changes are preserved automatically
 * - No "last write wins" - all changes merge mathematically
 * - Real-time sync without manual conflict resolution
 */
export class BoardCRDT {
  private doc: Y.Doc;
  private windows: Y.Array<Window>;
  private columns: Y.Array<Column>;
  private metadata: Y.Map<any>;
  
  constructor(doc?: Y.Doc) {
    this.doc = doc || new Y.Doc();
    this.windows = this.doc.getArray('windows');
    this.columns = this.doc.getArray('columns');
    this.metadata = this.doc.getMap('metadata');
  }
  
  /**
   * Get the underlying Yjs document for synchronization
   */
  getDoc(): Y.Doc {
    return this.doc;
  }
  
  /**
   * Get current board state
   */
  getState(): BoardState {
    return {
      windows: this.windows.toArray(),
      columns: this.columns.toArray(),
      version: this.metadata.get('version') || 5,
      lastModifiedAt: this.metadata.get('lastModifiedAt') || Date.now(),
    };
  }
  
  /**
   * Set initial board state
   */
  setState(state: BoardState): void {
    this.doc.transact(() => {
      this.windows.delete(0, this.windows.length);
      this.windows.insert(0, state.windows);
      
      this.columns.delete(0, this.columns.length);
      this.columns.insert(0, state.columns);
      
      this.metadata.set('version', state.version);
      this.metadata.set('lastModifiedAt', state.lastModifiedAt);
    });
  }
  
  /**
   * Add or update a window
   */
  upsertWindow(window: Window): void {
    this.doc.transact(() => {
      const index = this.windows.toArray().findIndex(w => w.id === window.id);
      
      if (index >= 0) {
        this.windows.delete(index, 1);
        this.windows.insert(index, [window]);
      } else {
        this.windows.push([window]);
      }
      
      this.updateTimestamp();
    });
  }
  
  /**
   * Remove a window
   */
  removeWindow(windowId: string): void {
    this.doc.transact(() => {
      const index = this.windows.toArray().findIndex(w => w.id === windowId);
      
      if (index >= 0) {
        this.windows.delete(index, 1);
        this.updateTimestamp();
      }
    });
  }
  
  /**
   * Move a window to a different column/position
   */
  moveWindow(windowId: string, toColumnId: string, toOrder: number): void {
    this.doc.transact(() => {
      const windowsArray = this.windows.toArray();
      const windowIndex = windowsArray.findIndex(w => w.id === windowId);
      
      if (windowIndex >= 0) {
        const window = windowsArray[windowIndex];
        const fromColumnId = window.columnId;
        
        // Update the moved window
        const updatedWindow: Window = { ...window, columnId: toColumnId as any, order: toOrder, lastActiveAt: Date.now() };
        this.windows.delete(windowIndex, 1);
        this.windows.insert(windowIndex, [updatedWindow]);
        
        // Adjust orders in affected columns
        windowsArray.forEach((w, i) => {
          if (i === windowIndex) return;
          
          let shouldUpdate = false;
          let updatedW = { ...w };
          
          // Windows in source column
          if (fromColumnId !== toColumnId && w.columnId === fromColumnId && w.order > window.order) {
            updatedW.order = w.order - 1;
            shouldUpdate = true;
          }
          
          // Windows in target column
          if (w.columnId === toColumnId && w.order >= toOrder && w.id !== windowId) {
            updatedW.order = w.order + 1;
            shouldUpdate = true;
          }
          
          if (shouldUpdate) {
            this.windows.delete(i, 1);
            this.windows.insert(i, [updatedW]);
          }
        });
        
        this.updateTimestamp();
      }
    });
  }
  
  /**
   * Update window properties
   */
  updateWindow(windowId: string, updates: Partial<Window>): void {
    this.doc.transact(() => {
      const index = this.windows.toArray().findIndex(w => w.id === windowId);
      
      if (index >= 0) {
        const window = this.windows.toArray()[index];
        const updated = { ...window, ...updates, lastActiveAt: Date.now() };
        this.windows.delete(index, 1);
        this.windows.insert(index, [updated]);
        this.updateTimestamp();
      }
    });
  }
  
  /**
   * Subscribe to changes
   */
  onChange(callback: (state: BoardState) => void): () => void {
    const observer = () => {
      callback(this.getState());
    };
    
    this.windows.observe(observer);
    this.columns.observe(observer);
    this.metadata.observe(observer);
    
    return () => {
      this.windows.unobserve(observer);
      this.columns.unobserve(observer);
      this.metadata.unobserve(observer);
    };
  }
  
  /**
   * Get sync state as Uint8Array for persistence or network transfer
   */
  getStateVector(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }
  
  /**
   * Apply sync state from another source
   */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update);
  }
  
  private updateTimestamp(): void {
    this.metadata.set('lastModifiedAt', Date.now());
  }
}
