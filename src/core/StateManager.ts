/**
 * StateManager - Pure state operations with event-driven updates
 */

import * as vscode from 'vscode';
import {
    KanVisState,
    Card,
    CardId,
    Column,
    ColumnId,
    Tag,
    WindowId,
    BoardSettings,
    HistoryAction,
    createColumnId,
    createDefaultState,
} from '../types/index.js';
import { StorageService } from './StorageService.js';
import { SyncService } from './SyncService.js';
import { EventBus } from './EventBus.js';
import { CardNotFoundError, ColumnNotFoundError, logError } from '../utils/errors.js';
import { uuid } from '../utils/hash.js';

/**
 * Maximum number of actions to keep in history for undo/redo
 */
const MAX_HISTORY_SIZE = 50;

/**
 * StateManager handles all state operations for kanvis
 */
export class StateManager implements vscode.Disposable {
    private state: KanVisState;
    private storageService: StorageService;
    private syncService: SyncService;
    private eventBus: EventBus;
    private currentWindowId: WindowId;
    private disposables: vscode.Disposable[] = [];

    // History for undo/redo
    private history: HistoryAction[] = [];
    private historyIndex = -1;
    private isUndoRedo = false;

    // Event emitter for UI updates
    private onStateChangeEmitter = new vscode.EventEmitter<KanVisState>();
    public readonly onStateChange = this.onStateChangeEmitter.event;

    constructor(
        context: vscode.ExtensionContext,
        currentWindowId: WindowId,
        eventBus: EventBus
    ) {
        this.currentWindowId = currentWindowId;
        this.eventBus = eventBus;
        this.state = createDefaultState(currentWindowId);
        this.storageService = new StorageService(context, currentWindowId);
        this.syncService = new SyncService(
            this.storageService,
            this.eventBus,
            this.currentWindowId,
            (state) => this.handleExternalStateChange(state)
        );

        this.disposables.push(this.onStateChangeEmitter);
    }

    /**
     * Initialize the state manager
     */
    async initialize(): Promise<void> {
        // Load state from disk
        this.state = await this.storageService.load();
        this.eventBus.emit({ type: 'state:loaded', state: this.state });

        // Start sync service
        this.syncService.start();
        this.disposables.push(this.syncService);

        // Notify listeners
        this.onStateChangeEmitter.fire(this.state);
    }

    /**
     * Handle state changes from other windows
     */
    private handleExternalStateChange(newState: KanVisState): void {
        this.state = newState;
        this.onStateChangeEmitter.fire(this.state);
    }

    /**
     * Get the current state
     */
    getState(): KanVisState {
        return this.state;
    }

    /**
     * Get the current window ID
     */
    getCurrentWindowId(): WindowId {
        return this.currentWindowId;
    }

    // =========================================================================
    // Card Operations
    // =========================================================================

    /**
     * Create a new card
     */
    async createCard(data: {
        id: CardId;
        name: string;
        path: string;
        columnId?: ColumnId;
        branch?: string;
    }): Promise<Card> {
        const columnId = data.columnId ?? this.state.columns[0]?.id ?? createColumnId('backlog');
        const cardsInColumn = this.state.cards.filter((c) => c.columnId === columnId);

        const card: Card = {
            id: data.id,
            name: data.name,
            path: data.path,
            columnId,
            order: cardsInColumn.length,
            branch: data.branch,
            isOpen: true,
            lastActiveAt: Date.now(),
            createdAt: Date.now(),
            columnHistory: [
                {
                    columnId,
                    enteredAt: Date.now(),
                },
            ],
        };

        this.recordHistory('card:created', `Created card "${card.name}"`, { cards: [...this.state.cards] });
        
        this.state.cards.push(card);
        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:created', card });

        return card;
    }

    /**
     * Get a card by ID
     */
    getCard(cardId: CardId): Card | undefined {
        return this.state.cards.find((c) => c.id === cardId);
    }

    /**
     * Update a card's properties
     */
    async updateCard(cardId: CardId, updates: Partial<Card>): Promise<Card> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        this.recordHistory('card:updated', `Updated card "${card.name}"`, {
            cards: this.state.cards.map((c) => ({ ...c })),
        });

        Object.assign(card, updates);
        card.lastActiveAt = Date.now();

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:updated', cardId, updates });

        return card;
    }

    /**
     * Move a card to a different column and/or position
     */
    async moveCard(cardId: CardId, toColumnId: ColumnId, toOrder: number): Promise<Card> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        const fromColumnId = card.columnId;
        const isColumnChange = fromColumnId !== toColumnId;

        this.recordHistory('card:moved', `Moved card "${card.name}"`, {
            cards: this.state.cards.map((c) => ({ ...c })),
        });

        // Update column history if changing columns
        if (isColumnChange) {
            // Close previous column entry
            if (card.columnHistory && card.columnHistory.length > 0) {
                const lastEntry = card.columnHistory[card.columnHistory.length - 1];
                if (!lastEntry.leftAt) {
                    lastEntry.leftAt = Date.now();
                }
            }

            // Add new column entry
            card.columnHistory = card.columnHistory ?? [];
            card.columnHistory.push({
                columnId: toColumnId,
                enteredAt: Date.now(),
            });
        }

        // Update card
        card.columnId = toColumnId;
        card.order = toOrder;
        card.lastActiveAt = Date.now();

        // Reorder other cards in the target column
        const cardsInTargetColumn = this.state.cards
            .filter((c) => c.columnId === toColumnId && c.id !== cardId)
            .sort((a, b) => a.order - b.order);

        cardsInTargetColumn.forEach((c, index) => {
            c.order = index >= toOrder ? index + 1 : index;
        });

        // Reorder source column if changed
        if (isColumnChange) {
            const cardsInSourceColumn = this.state.cards
                .filter((c) => c.columnId === fromColumnId)
                .sort((a, b) => a.order - b.order);

            cardsInSourceColumn.forEach((c, index) => {
                c.order = index;
            });
        }

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:moved', cardId, fromColumnId, toColumnId, order: toOrder });

        return card;
    }

    /**
     * Delete a card
     */
    async deleteCard(cardId: CardId): Promise<void> {
        const cardIndex = this.state.cards.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) {
            return;
        }

        const card = this.state.cards[cardIndex];
        this.recordHistory('card:deleted', `Deleted card "${card.name}"`, {
            cards: [...this.state.cards],
        });

        this.state.cards.splice(cardIndex, 1);

        // Reorder remaining cards in the column
        const cardsInColumn = this.state.cards
            .filter((c) => c.columnId === card.columnId)
            .sort((a, b) => a.order - b.order);
        cardsInColumn.forEach((c, index) => {
            c.order = index;
        });

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:deleted', cardId });
    }

    /**
     * Archive a card
     */
    async archiveCard(cardId: CardId): Promise<Card> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        this.recordHistory('card:archived', `Archived card "${card.name}"`, {
            cards: this.state.cards.map((c) => ({ ...c })),
        });

        card.isArchived = true;
        card.archivedAt = Date.now();

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:archived', cardId });

        return card;
    }

    /**
     * Restore an archived card
     */
    async restoreCard(cardId: CardId): Promise<Card> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        this.recordHistory('card:restored', `Restored card "${card.name}"`, {
            cards: this.state.cards.map((c) => ({ ...c })),
        });

        card.isArchived = false;
        card.archivedAt = undefined;

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'card:restored', cardId });

        return card;
    }

    // =========================================================================
    // Notification Operations
    // =========================================================================

    /**
     * Set a notification on a card
     */
    async setNotification(cardId: CardId, message: string, fromWindowId?: WindowId): Promise<void> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        card.notification = {
            message,
            createdAt: Date.now(),
            fromWindowId,
        };

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'notification:sent', cardId, message });
    }

    /**
     * Clear notification from a card
     */
    async clearNotification(cardId: CardId): Promise<void> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            return;
        }

        card.notification = undefined;

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'notification:cleared', cardId });
    }

    // =========================================================================
    // Column Operations
    // =========================================================================

    /**
     * Create a new column
     */
    async createColumn(name: string, color?: string): Promise<Column> {
        const id = createColumnId(uuid());
        const column: Column = {
            id,
            name,
            order: this.state.columns.length,
            color,
        };

        this.recordHistory('column:created', `Created column "${name}"`, {
            columns: [...this.state.columns],
        });

        this.state.columns.push(column);
        await this.saveAndNotify();
        this.eventBus.emit({ type: 'column:created', column });

        return column;
    }

    /**
     * Update a column
     */
    async updateColumn(columnId: ColumnId, updates: Partial<Omit<Column, 'id'>>): Promise<Column> {
        const column = this.state.columns.find((c) => c.id === columnId);
        if (!column) {
            throw new ColumnNotFoundError(columnId);
        }

        this.recordHistory('column:updated', `Updated column "${column.name}"`, {
            columns: this.state.columns.map((c) => ({ ...c })),
        });

        Object.assign(column, updates);

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'column:updated', columnId, updates });

        return column;
    }

    /**
     * Delete a column (moves all cards to first column)
     */
    async deleteColumn(columnId: ColumnId): Promise<void> {
        const columnIndex = this.state.columns.findIndex((c) => c.id === columnId);
        if (columnIndex === -1) {
            return;
        }

        // Don't allow deleting the last column
        if (this.state.columns.length <= 1) {
            throw new Error('Cannot delete the last column');
        }

        const column = this.state.columns[columnIndex];
        this.recordHistory('column:deleted', `Deleted column "${column.name}"`, {
            columns: [...this.state.columns],
            cards: this.state.cards.map((c) => ({ ...c })),
        });

        // Move cards to first column (or second if deleting first)
        const targetColumn = this.state.columns.find((c) => c.id !== columnId)!;
        const cardsToMove = this.state.cards.filter((c) => c.columnId === columnId);
        const existingCardsInTarget = this.state.cards.filter((c) => c.columnId === targetColumn.id);

        cardsToMove.forEach((card, index) => {
            card.columnId = targetColumn.id;
            card.order = existingCardsInTarget.length + index;
        });

        // Remove column
        this.state.columns.splice(columnIndex, 1);

        // Reorder remaining columns
        this.state.columns.forEach((c, index) => {
            c.order = index;
        });

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'column:deleted', columnId });
    }

    /**
     * Reorder a column
     */
    async reorderColumn(columnId: ColumnId, newOrder: number): Promise<void> {
        const column = this.state.columns.find((c) => c.id === columnId);
        if (!column) {
            throw new ColumnNotFoundError(columnId);
        }

        this.recordHistory('column:reordered', `Reordered column "${column.name}"`, {
            columns: this.state.columns.map((c) => ({ ...c })),
        });

        const oldOrder = column.order;
        
        // Shift other columns
        this.state.columns.forEach((c) => {
            if (c.id === columnId) {
                c.order = newOrder;
            } else if (oldOrder < newOrder && c.order > oldOrder && c.order <= newOrder) {
                c.order--;
            } else if (oldOrder > newOrder && c.order >= newOrder && c.order < oldOrder) {
                c.order++;
            }
        });

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'column:reordered', columnId, newOrder });
    }

    // =========================================================================
    // Tag Operations
    // =========================================================================

    /**
     * Create a new tag
     */
    async createTag(name: string, color: string): Promise<Tag> {
        const tag: Tag = {
            id: uuid(),
            name,
            color,
        };

        this.state.tags.push(tag);
        await this.saveAndNotify();
        this.eventBus.emit({ type: 'tag:created', tag });

        return tag;
    }

    /**
     * Delete a tag (removes from all cards)
     */
    async deleteTag(tagId: string): Promise<void> {
        const tagIndex = this.state.tags.findIndex((t) => t.id === tagId);
        if (tagIndex === -1) {
            return;
        }

        this.state.tags.splice(tagIndex, 1);

        // Remove tag from all cards
        this.state.cards.forEach((card) => {
            if (card.tags) {
                card.tags = card.tags.filter((t) => t !== tagId);
            }
        });

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'tag:deleted', tagId });
    }

    /**
     * Add a tag to a card
     */
    async addTagToCard(cardId: CardId, tagId: string): Promise<void> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card) {
            throw new CardNotFoundError(cardId);
        }

        card.tags = card.tags ?? [];
        if (!card.tags.includes(tagId)) {
            card.tags.push(tagId);
            await this.saveAndNotify();
        }
    }

    /**
     * Remove a tag from a card
     */
    async removeTagFromCard(cardId: CardId, tagId: string): Promise<void> {
        const card = this.state.cards.find((c) => c.id === cardId);
        if (!card || !card.tags) {
            return;
        }

        card.tags = card.tags.filter((t) => t !== tagId);
        await this.saveAndNotify();
    }

    // =========================================================================
    // Window Operations
    // =========================================================================

    /**
     * Register a window as active
     */
    async registerWindow(windowId: WindowId): Promise<void> {
        if (!this.state.activeWindowIds.includes(windowId)) {
            this.state.activeWindowIds.push(windowId);
        }

        // Update card status with initial ping
        const card = this.state.cards.find((c) => c.id === (windowId as unknown as CardId));
        if (card) {
            card.isOpen = true;
            card.lastActiveAt = Date.now();
            card.lastPingAt = Date.now();
        }

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'window:opened', windowId });
    }

    /**
     * Unregister a window (mark as inactive)
     */
    async unregisterWindow(windowId: WindowId): Promise<void> {
        this.state.activeWindowIds = this.state.activeWindowIds.filter((id) => id !== windowId);

        // Update card status - clear the ping to mark as closed
        const card = this.state.cards.find((c) => c.id === (windowId as unknown as CardId));
        if (card) {
            card.isOpen = false;
            card.lastActiveAt = Date.now();
            card.lastPingAt = 0; // Clear ping so it's immediately seen as closed
        }

        await this.saveAndNotify();
        this.eventBus.emit({ type: 'window:closed', windowId });
    }

    /**
     * Sync isOpen status based on heartbeat (4 second timeout)
     */
    syncWindowStatus(): void {
        const PING_TIMEOUT_MS = 4_000; // 4 seconds
        const now = Date.now();

        for (const card of this.state.cards) {
            // A window is open if it has pinged within the last 10 seconds
            const lastPing = card.lastPingAt ?? 0;
            card.isOpen = (now - lastPing) < PING_TIMEOUT_MS;
        }
    }

    /**
     * Send a heartbeat ping for the current window
     */
    async pingWindow(windowId: WindowId): Promise<void> {
        const card = this.state.cards.find((c) => c.id === (windowId as unknown as CardId));
        if (card) {
            card.lastPingAt = Date.now();
            card.isOpen = true;
            await this.saveAndNotify();
        }
    }

    // =========================================================================
    // Settings Operations
    // =========================================================================

    /**
     * Update board settings
     */
    async updateSettings(updates: Partial<BoardSettings>): Promise<void> {
        this.state.settings = { ...this.state.settings, ...updates };
        await this.saveAndNotify();
        this.eventBus.emit({ type: 'settings:updated', settings: updates });
    }

    // =========================================================================
    // History Operations (Undo/Redo)
    // =========================================================================

    /**
     * Record an action for undo/redo
     */
    private recordHistory(type: string, description: string, previousState: Partial<KanVisState>): void {
        if (this.isUndoRedo) {
            return;
        }

        // Remove any future history if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        const action: HistoryAction = {
            id: uuid(),
            type,
            timestamp: Date.now(),
            description,
            previousState,
            nextState: {}, // Will be populated after the action
        };

        this.history.push(action);
        this.historyIndex = this.history.length - 1;

        // Trim history if too long
        if (this.history.length > MAX_HISTORY_SIZE) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.historyIndex >= 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Get undo description
     */
    getUndoDescription(): string | undefined {
        if (!this.canUndo()) {
            return undefined;
        }
        return this.history[this.historyIndex]?.description;
    }

    /**
     * Get redo description
     */
    getRedoDescription(): string | undefined {
        if (!this.canRedo()) {
            return undefined;
        }
        return this.history[this.historyIndex + 1]?.description;
    }

    /**
     * Undo the last action
     */
    async undo(): Promise<boolean> {
        if (!this.canUndo()) {
            return false;
        }

        this.isUndoRedo = true;
        try {
            const action = this.history[this.historyIndex];
            
            // Restore previous state
            if (action.previousState.cards) {
                this.state.cards = action.previousState.cards;
            }
            if (action.previousState.columns) {
                this.state.columns = action.previousState.columns;
            }
            if (action.previousState.tags) {
                this.state.tags = action.previousState.tags;
            }

            this.historyIndex--;
            await this.saveAndNotify();
            return true;
        } finally {
            this.isUndoRedo = false;
        }
    }

    /**
     * Redo the last undone action
     */
    async redo(): Promise<boolean> {
        if (!this.canRedo()) {
            return false;
        }

        this.isUndoRedo = true;
        try {
            this.historyIndex++;
            const action = this.history[this.historyIndex];

            // We need to re-apply the action
            // For simplicity, we just move to the next state in history
            // This requires storing the next state when recording

            if (action.nextState.cards) {
                this.state.cards = action.nextState.cards;
            }
            if (action.nextState.columns) {
                this.state.columns = action.nextState.columns;
            }

            await this.saveAndNotify();
            return true;
        } finally {
            this.isUndoRedo = false;
        }
    }

    // =========================================================================
    // Bulk Operations
    // =========================================================================

    /**
     * Clear all cards
     */
    async clearAllCards(): Promise<void> {
        this.recordHistory('cards:cleared', 'Cleared all cards', {
            cards: [...this.state.cards],
        });

        this.state.cards = [];
        this.state.activeWindowIds = [];
        await this.saveAndNotify();
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /**
     * Save state and notify listeners
     */
    private async saveAndNotify(): Promise<void> {
        try {
            await this.storageService.save(this.state);
            this.syncService.updateLastModified(this.state.lastModifiedAt);
        } catch (error) {
            logError('Failed to save state', error);
        }
        this.onStateChangeEmitter.fire(this.state);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

