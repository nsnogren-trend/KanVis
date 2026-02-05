/**
 * Domain model for a kanban column
 */

export interface Column {
  /** Unique identifier */
  readonly id: string;
  
  /** Display name */
  name: string;
  
  /** Position in the board (0-indexed) */
  order: number;
  
  /** Optional color */
  color?: string;
}

/**
 * Default columns for a new board
 */
export const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog', name: 'Backlog', order: 0, color: '#94a3b8' },
  { id: 'current', name: 'Current', order: 1, color: '#3b82f6' },
  { id: 'priorities', name: 'Priorities', order: 2, color: '#f59e0b' },
];

/**
 * Create a new column
 */
export function createColumn(id: string, name: string, order: number): Column {
  return { id, name, order };
}
