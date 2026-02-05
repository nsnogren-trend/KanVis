import { Window } from './Window.js';
import { Column, DEFAULT_COLUMNS } from './Column.js';

/**
 * Domain model for the complete board state
 */
export interface BoardState {
  /** All windows being tracked */
  windows: Window[];
  
  /** Column definitions */
  columns: Column[];
  
  /** Schema version for migrations */
  version: number;
  
  /** When state was last modified */
  lastModifiedAt: number;
}

/**
 * Current schema version
 */
export const SCHEMA_VERSION = 1;

/**
 * Create a default board state
 */
export function createDefaultBoard(): BoardState {
  return {
    windows: [],
    columns: [...DEFAULT_COLUMNS],
    version: SCHEMA_VERSION,
    lastModifiedAt: Date.now(),
  };
}

/**
 * Get a window by ID
 */
export function findWindow(board: BoardState, windowId: string): Window | undefined {
  return board.windows.find(w => w.id === windowId);
}

/**
 * Get all windows in a column
 */
export function getWindowsInColumn(board: BoardState, columnId: string): Window[] {
  return board.windows
    .filter(w => w.columnId === columnId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Add or update a window in the board
 */
export function upsertWindow(board: BoardState, window: Window): BoardState {
  const existingIndex = board.windows.findIndex(w => w.id === window.id);
  
  const windows = existingIndex >= 0
    ? board.windows.map((w, i) => i === existingIndex ? window : w)
    : [...board.windows, window];
  
  return {
    ...board,
    windows,
    lastModifiedAt: Date.now(),
  };
}

/**
 * Remove a window from the board
 */
export function removeWindow(board: BoardState, windowId: string): BoardState {
  return {
    ...board,
    windows: board.windows.filter(w => w.id !== windowId),
    lastModifiedAt: Date.now(),
  };
}

/**
 * Move a window to a different column and/or position
 */
export function moveWindow(
  board: BoardState,
  windowId: string,
  toColumnId: string,
  toOrder: number
): BoardState {
  const window = findWindow(board, windowId);
  if (!window) {
    return board;
  }

  const fromColumnId = window.columnId;
  
  // Update all windows
  const windows = board.windows.map(w => {
    // The window being moved
    if (w.id === windowId) {
      return { ...w, columnId: toColumnId, order: toOrder, lastActiveAt: Date.now() };
    }
    
    // Windows in the source column (if different from target)
    if (fromColumnId !== toColumnId && w.columnId === fromColumnId && w.order > window.order) {
      return { ...w, order: w.order - 1 };
    }
    
    // Windows in the target column
    if (w.columnId === toColumnId && w.order >= toOrder && w.id !== windowId) {
      return { ...w, order: w.order + 1 };
    }
    
    return w;
  });

  return {
    ...board,
    windows,
    lastModifiedAt: Date.now(),
  };
}

/**
 * Update window open status
 */
export function updateWindowStatus(
  board: BoardState,
  windowId: string,
  isOpen: boolean
): BoardState {
  return {
    ...board,
    windows: board.windows.map(w =>
      w.id === windowId ? { ...w, isOpen, lastActiveAt: Date.now() } : w
    ),
    lastModifiedAt: Date.now(),
  };
}
