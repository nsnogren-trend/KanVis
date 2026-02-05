import { z } from 'zod';

/**
 * Branded types for type safety
 * These prevent mixing up different IDs at compile time
 */
export const WindowIdSchema = z.string().brand('WindowId');
export type WindowId = z.infer<typeof WindowIdSchema>;

export const ColumnIdSchema = z.string().brand('ColumnId');
export type ColumnId = z.infer<typeof ColumnIdSchema>;

export const EventIdSchema = z.string().brand('EventId');
export type EventId = z.infer<typeof EventIdSchema>;

/**
 * Window schema with strict validation
 */
export const WindowSchema = z.object({
  id: WindowIdSchema,
  columnId: ColumnIdSchema,
  order: z.number().int().nonnegative(),
  path: z.string(),
  name: z.string().min(1),
  branch: z.string().optional(),
  isOpen: z.boolean(),
  lastActiveAt: z.number().int().positive(),
  createdAt: z.number().int().positive(),
});

export type Window = z.infer<typeof WindowSchema>;

/**
 * Column schema with strict validation
 */
export const ColumnSchema = z.object({
  id: ColumnIdSchema,
  name: z.string().min(1).max(50),
  order: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export type Column = z.infer<typeof ColumnSchema>;

/**
 * Board state schema
 */
export const BoardStateSchema = z.object({
  windows: z.array(WindowSchema),
  columns: z.array(ColumnSchema),
  version: z.number().int().positive(),
  lastModifiedAt: z.number().int().positive(),
});

export type BoardState = z.infer<typeof BoardStateSchema>;

/**
 * Default columns
 */
export const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog' as ColumnId, name: 'Backlog', order: 0, color: '#6c757d' },
  { id: 'active' as ColumnId, name: 'Active', order: 1, color: '#0d6efd' },
  { id: 'done' as ColumnId, name: 'Done', order: 2, color: '#28a745' },
];

/**
 * Create branded ID helpers
 */
export function createWindowId(id: string): WindowId {
  return WindowIdSchema.parse(id);
}

export function createColumnId(id: string): ColumnId {
  return ColumnIdSchema.parse(id);
}

export function createEventId(id: string): EventId {
  return EventIdSchema.parse(id);
}

/**
 * Safe parser that returns Result type
 */
export type Result<T> = 
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export function parseWindow(data: unknown): Result<Window> {
  const result = WindowSchema.safeParse(data);
  return result.success 
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function parseBoard(data: unknown): Result<BoardState> {
  const result = BoardStateSchema.safeParse(data);
  return result.success 
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}
