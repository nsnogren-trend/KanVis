/**
 * kanvis Webview Message Protocol
 * Typed messages for communication between extension and webview
 */

import type { Card, CardId, ColumnId, BoardSettings, KanVisState, WindowId } from './index.js';

// ============================================================================
// Webview → Extension Messages
// ============================================================================

/**
 * Messages sent FROM webview TO extension
 */
export type WebviewToExtensionMessage =
    // Lifecycle
    | { type: 'ready' }
    | { type: 'refresh' }

    // Card operations
    | { type: 'card:open'; cardId: CardId }
    | { type: 'card:move'; cardId: CardId; toColumnId: ColumnId; toOrder: number }
    | { type: 'card:update'; cardId: CardId; updates: Partial<Card> }
    | { type: 'card:confirmDelete'; cardId: CardId }
    | { type: 'card:archive'; cardId: CardId }
    | { type: 'card:restore'; cardId: CardId }
    | { type: 'card:edit'; cardId: CardId }

    // Column operations
    | { type: 'column:create' }
    | { type: 'column:rename'; columnId: ColumnId }
    | { type: 'column:delete'; columnId: ColumnId }
    | { type: 'column:reorder'; columnId: ColumnId; newOrder: number }
    | { type: 'column:toggleCollapse'; columnId: ColumnId }

    // Notifications
    | { type: 'notification:send'; cardId: CardId; message: string }
    | { type: 'notification:clear'; cardId: CardId }

    // Tags
    | { type: 'tag:create'; name: string; color: string }
    | { type: 'tag:delete'; tagId: string }
    | { type: 'card:addTag'; cardId: CardId; tagId: string }
    | { type: 'card:removeTag'; cardId: CardId; tagId: string }

    // Settings
    | { type: 'settings:update'; settings: Partial<BoardSettings> }

    // History
    | { type: 'history:undo' }
    | { type: 'history:redo' }

    // Search
    | { type: 'search:query'; query: string }
    | { type: 'search:clear' };

// ============================================================================
// Extension → Webview Messages
// ============================================================================

/**
 * Messages sent FROM extension TO webview
 */
export type ExtensionToWebviewMessage =
    // State updates
    | { type: 'state:update'; state: KanVisState; currentWindowId: WindowId }
    | { type: 'state:patch'; patch: Partial<KanVisState>; currentWindowId: WindowId }

    // History status
    | { type: 'history:update'; canUndo: boolean; canRedo: boolean; undoDescription?: string; redoDescription?: string }

    // Search results
    | { type: 'search:results'; matchingCardIds: CardId[]; query: string }

    // Errors
    | { type: 'error'; message: string; details?: string };

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a message is from the webview
 */
export function isWebviewMessage(msg: unknown): msg is WebviewToExtensionMessage {
    return typeof msg === 'object' && msg !== null && 'type' in msg;
}

/**
 * Check if a message is from the extension
 */
export function isExtensionMessage(msg: unknown): msg is ExtensionToWebviewMessage {
    return typeof msg === 'object' && msg !== null && 'type' in msg;
}

