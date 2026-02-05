import { z } from 'zod';

/**
 * Runtime validators for KanVis domain models
 * Provides type safety at runtime to catch data corruption early
 */

// Helper to create opaque IDs
const OpaqueId = <T extends string>(_brand: T) => 
  z.string().min(1).brand<T>();

export const WindowIdValidator = OpaqueId('WindowId');
export const ColumnIdValidator = OpaqueId('ColumnId');

export type WindowId = z.infer<typeof WindowIdValidator>;
export type ColumnId = z.infer<typeof ColumnIdValidator>;

// Window validator
export const WindowValidator = z.object({
  id: WindowIdValidator,
  columnId: ColumnIdValidator,
  order: z.number().int().min(0),
  path: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().optional(),
  isOpen: z.boolean(),
  lastActiveAt: z.number().int().positive(),
  createdAt: z.number().int().positive(),
});

// Column validator
export const ColumnValidator = z.object({
  id: ColumnIdValidator,
  name: z.string().min(1).max(50),
  order: z.number().int().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// Board state validator
export const BoardStateValidator = z.object({
  windows: z.array(WindowValidator),
  columns: z.array(ColumnValidator),
  version: z.number().int().positive(),
  lastModifiedAt: z.number().int().positive(),
});

export type ValidatedWindow = z.infer<typeof WindowValidator>;
export type ValidatedColumn = z.infer<typeof ColumnValidator>;
export type ValidatedBoardState = z.infer<typeof BoardStateValidator>;

/**
 * Validation helper that returns either valid data or error details
 */
export function validateWindow(data: unknown): 
  | { valid: true; data: ValidatedWindow }
  | { valid: false; errors: string[] } {
  
  const result = WindowValidator.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  };
}

export function validateBoardState(data: unknown):
  | { valid: true; data: ValidatedBoardState }
  | { valid: false; errors: string[] } {
  
  const result = BoardStateValidator.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  };
}
