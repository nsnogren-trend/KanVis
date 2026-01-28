/**
 * kanvis Type Definitions
 * Schema version - increment when making breaking changes
 */

export const SCHEMA_VERSION = 1;

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Unique identifier type for cards
 */
export type CardId = string & { readonly __brand: 'CardId' };

/**
 * Unique identifier type for columns
 */
export type ColumnId = string & { readonly __brand: 'ColumnId' };

/**
 * Unique identifier type for windows
 */
export type WindowId = string & { readonly __brand: 'WindowId' };

/**
 * Helper to create branded IDs
 */
export function createCardId(id: string): CardId {
    return id as CardId;
}

export function createColumnId(id: string): ColumnId {
    return id as ColumnId;
}

export function createWindowId(id: string): WindowId {
    return id as WindowId;
}

// ============================================================================
// Column Types
// ============================================================================

/**
 * A column on the kanban board
 */
export interface Column {
    /** Unique identifier for this column */
    id: ColumnId;
    /** Display name */
    name: string;
    /** Order in the board (0-indexed) */
    order: number;
    /** Optional column color */
    color?: string;
    /** Work-in-progress limit (optional) */
    wipLimit?: number;
    /** Whether the column is collapsed in UI */
    isCollapsed?: boolean;
}

// ============================================================================
// Tag Types
// ============================================================================

/**
 * A tag/label that can be applied to cards
 */
export interface Tag {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Color (hex format) */
    color: string;
}

// ============================================================================
// Card Types
// ============================================================================

/**
 * A record of when a card entered/left a column
 */
export interface ColumnHistoryEntry {
    /** The column ID */
    columnId: ColumnId;
    /** When the card entered this column */
    enteredAt: number;
    /** When the card left this column (undefined if still in column) */
    leftAt?: number;
}

/**
 * Notification attached to a card
 */
export interface CardNotification {
    /** The notification message */
    message: string;
    /** When the notification was created */
    createdAt: number;
    /** Which window sent the notification */
    fromWindowId?: WindowId;
}

/**
 * A card representing a workspace
 */
export interface Card {
    /** Unique identifier for this card (same as window ID for workspace-based cards) */
    id: CardId;
    /** Display name */
    name: string;
    /** Full path to the workspace or folder */
    path: string;
    /** Which column this card is in */
    columnId: ColumnId;
    /** Order within the column (0-indexed) */
    order: number;

    // Git integration
    /** Current git branch if available */
    branch?: string;

    // Status
    /** Whether the workspace is currently open in a VS Code window */
    isOpen: boolean;
    /** Timestamp of last activity */
    lastActiveAt: number;
    /** Timestamp when the card was created */
    createdAt: number;

    // Notifications
    /** Current notification if any */
    notification?: CardNotification;

    // Customization
    /** Custom color (hex format) */
    color?: string;
    /** User notes about this workspace */
    notes?: string;
    /** Tag IDs attached to this card */
    tags?: string[];

    // Time tracking
    /** History of column transitions */
    columnHistory?: ColumnHistoryEntry[];

    // Heartbeat
    /** Last ping timestamp for open window detection */
    lastPingAt?: number;

    // Archive
    /** Whether this card is archived */
    isArchived?: boolean;
    /** When the card was archived */
    archivedAt?: number;
}

// ============================================================================
// Board Settings
// ============================================================================

/**
 * Board-level settings
 */
export interface BoardSettings {
    /** Whether to show archived cards */
    showArchivedCards: boolean;
    /** Whether to use compact view */
    compactView: boolean;
    /** Sort field for cards */
    sortBy: 'order' | 'name' | 'lastActive' | 'createdAt';
    /** Sort direction */
    sortDirection: 'asc' | 'desc';
    /** Whether to show cards for closed windows */
    showClosedWindows: boolean;
    /** Auto-archive after N days of inactivity (0 = disabled) */
    autoArchiveAfterDays?: number;
}

/**
 * Default board settings
 */
export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
    showArchivedCards: false,
    compactView: false,
    sortBy: 'order',
    sortDirection: 'asc',
    showClosedWindows: true,
    autoArchiveAfterDays: 0,
};

// ============================================================================
// State Types
// ============================================================================

/**
 * Root state object persisted to disk
 */
export interface KanVisState {
    /** Schema version for migrations */
    version: typeof SCHEMA_VERSION;
    /** All cards on the board */
    cards: Card[];
    /** All columns */
    columns: Column[];
    /** All defined tags */
    tags: Tag[];
    /** IDs of currently active (open) windows */
    activeWindowIds: WindowId[];
    /** Board settings */
    settings: BoardSettings;
    /** Timestamp of last modification */
    lastModifiedAt: number;
    /** Which window made the last modification */
    lastModifiedBy: WindowId;
}

/**
 * Create a default empty state
 */
export function createDefaultState(currentWindowId: WindowId): KanVisState {
    return {
        version: SCHEMA_VERSION,
        cards: [],
        columns: [
            { id: createColumnId('backlog'), name: 'Backlog', order: 0 },
            { id: createColumnId('in-progress'), name: 'In Progress', order: 1 },
            { id: createColumnId('review'), name: 'Review', order: 2 },
            { id: createColumnId('done'), name: 'Done', order: 3 },
        ],
        tags: [],
        activeWindowIds: [],
        settings: { ...DEFAULT_BOARD_SETTINGS },
        lastModifiedAt: Date.now(),
        lastModifiedBy: currentWindowId,
    };
}

// ============================================================================
// History Types (for Undo/Redo)
// ============================================================================

/**
 * An action that can be undone/redone
 */
export interface HistoryAction {
    /** Unique identifier */
    id: string;
    /** Type of action */
    type: string;
    /** When the action was performed */
    timestamp: number;
    /** Description for UI */
    description: string;
    /** State before the action (for undo) */
    previousState: Partial<KanVisState>;
    /** State after the action (for redo) */
    nextState: Partial<KanVisState>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the system
 */
export type KanVisEvent =
    | { type: 'card:created'; card: Card }
    | { type: 'card:updated'; cardId: CardId; updates: Partial<Card> }
    | { type: 'card:moved'; cardId: CardId; fromColumnId: ColumnId; toColumnId: ColumnId; order: number }
    | { type: 'card:deleted'; cardId: CardId }
    | { type: 'card:archived'; cardId: CardId }
    | { type: 'card:restored'; cardId: CardId }
    | { type: 'column:created'; column: Column }
    | { type: 'column:updated'; columnId: ColumnId; updates: Partial<Column> }
    | { type: 'column:deleted'; columnId: ColumnId }
    | { type: 'column:reordered'; columnId: ColumnId; newOrder: number }
    | { type: 'tag:created'; tag: Tag }
    | { type: 'tag:deleted'; tagId: string }
    | { type: 'window:opened'; windowId: WindowId }
    | { type: 'window:closed'; windowId: WindowId }
    | { type: 'notification:sent'; cardId: CardId; message: string }
    | { type: 'notification:cleared'; cardId: CardId }
    | { type: 'state:loaded'; state: KanVisState }
    | { type: 'state:synced'; state: KanVisState }
    | { type: 'settings:updated'; settings: Partial<BoardSettings> };

