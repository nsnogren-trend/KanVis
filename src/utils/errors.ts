/**
 * Error handling utilities
 */

/**
 * Base class for kanvis errors
 */
export class kanvisError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'kanvisError';
    }
}

/**
 * Error thrown when state operations fail
 */
export class StateError extends kanvisError {
    constructor(message: string, details?: unknown) {
        super(message, 'STATE_ERROR', details);
        this.name = 'StateError';
    }
}

/**
 * Error thrown when storage operations fail
 */
export class StorageError extends kanvisError {
    constructor(message: string, details?: unknown) {
        super(message, 'STORAGE_ERROR', details);
        this.name = 'StorageError';
    }
}

/**
 * Error thrown when sync operations fail
 */
export class SyncError extends kanvisError {
    constructor(message: string, details?: unknown) {
        super(message, 'SYNC_ERROR', details);
        this.name = 'SyncError';
    }
}

/**
 * Error thrown when a card is not found
 */
export class CardNotFoundError extends kanvisError {
    constructor(cardId: string) {
        super(`Card not found: ${cardId}`, 'CARD_NOT_FOUND', { cardId });
        this.name = 'CardNotFoundError';
    }
}

/**
 * Error thrown when a column is not found
 */
export class ColumnNotFoundError extends kanvisError {
    constructor(columnId: string) {
        super(`Column not found: ${columnId}`, 'COLUMN_NOT_FOUND', { columnId });
        this.name = 'ColumnNotFoundError';
    }
}

/**
 * Safely execute a function and return result or undefined on error
 */
export function tryOrUndefined<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

/**
 * Safely execute an async function and return result or undefined on error
 */
export async function tryOrUndefinedAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
        return await fn();
    } catch {
        return undefined;
    }
}

/**
 * Log an error with context
 */
export function logError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[KanVis] ${context}: ${message}`);
    if (stack) {
        console.error(stack);
    }
}

