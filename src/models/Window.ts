/**
 * Domain model for a VS Code window/workspace
 */

export interface Window {
  /** Unique identifier (hash of workspace path) */
  readonly id: string;
  
  /** Display name (workspace folder name) */
  name: string;
  
  /** Full path to workspace folder */
  path: string;
  
  /** Current git branch (if available) */
  branch?: string;
  
  /** Which column this window belongs to */
  columnId: string;
  
  /** Position within the column (0-indexed) */
  order: number;
  
  /** Whether this window is currently open */
  isOpen: boolean;
  
  /** Last time this window was active */
  lastActiveAt: number;
  
  /** When this window was first added */
  createdAt: number;
  
  /** Optional color for the card */
  color?: string;
  
  /** Optional notes */
  notes?: string;
}

/**
 * Create a new window instance
 */
export function createWindow(
  id: string,
  name: string,
  path: string,
  columnId: string,
  order: number
): Window {
  return {
    id,
    name,
    path,
    columnId,
    order,
    isOpen: true,
    lastActiveAt: Date.now(),
    createdAt: Date.now(),
  };
}

/**
 * Update window properties
 */
export function updateWindow(
  window: Window,
  updates: Partial<Omit<Window, 'id' | 'createdAt'>>
): Window {
  return {
    ...window,
    ...updates,
    lastActiveAt: Date.now(),
  };
}
