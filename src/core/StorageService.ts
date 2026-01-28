/**
 * StorageService - File persistence with debouncing, atomic writes, and schema versioning
 */

import * as vscode from 'vscode';
import {
    KanVisState,
    SCHEMA_VERSION,
    createDefaultState,
    WindowId,
    createColumnId,
} from '../types/index.js';
import { StorageError, logError } from '../utils/errors.js';

/**
 * Migrations to upgrade state from older versions
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
    // Example migration from version 0 to 1 (initial version)
    // In the future, add migrations here as:
    // 1: (v0State) => ({ ...v0State, version: 1, newField: 'default' }),
};

/**
 * StorageService handles persistence of kanvis state
 */
export class StorageService {
    private static readonly STATE_FILE = 'kanvis-state.json';
    private static readonly TEMP_SUFFIX = '.tmp';
    private static readonly SAVE_DEBOUNCE_MS = 500;

    private stateUri: vscode.Uri;
    private tempUri: vscode.Uri;
    private currentWindowId: WindowId;
    private saveInProgress = false;
    private pendingSave: KanVisState | null = null;

    constructor(
        private readonly context: vscode.ExtensionContext,
        currentWindowId: WindowId
    ) {
        this.stateUri = vscode.Uri.joinPath(
            context.globalStorageUri,
            StorageService.STATE_FILE
        );
        this.tempUri = vscode.Uri.joinPath(
            context.globalStorageUri,
            StorageService.STATE_FILE + StorageService.TEMP_SUFFIX
        );
        this.currentWindowId = currentWindowId;
    }

    /**
     * Get the URI of the state file (for file watching)
     */
    getStateUri(): vscode.Uri {
        return this.stateUri;
    }

    /**
     * Ensure the storage directory exists
     */
    private async ensureDirectory(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
        } catch {
            // Directory may already exist
        }
    }

    /**
     * Load state from disk
     */
    async load(): Promise<KanVisState> {
        try {
            const data = await vscode.workspace.fs.readFile(this.stateUri);
            const content = Buffer.from(data).toString('utf8');
            const parsed = JSON.parse(content) as Record<string, unknown>;

            // Validate and migrate
            const migrated = this.migrateState(parsed);
            return this.validateState(migrated);
        } catch (error) {
            // File doesn't exist or is invalid
            if (
                error instanceof vscode.FileSystemError &&
                error.code === 'FileNotFound'
            ) {
                console.log('[KanVis] No existing state file, creating new state');
            } else {
                logError('Failed to load state', error);
            }
            return createDefaultState(this.currentWindowId);
        }
    }

    private saveDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Save state to disk with debouncing
     */
    async save(state: KanVisState): Promise<void> {
        // Clear any pending save
        if (this.saveDebounceTimeout) {
            clearTimeout(this.saveDebounceTimeout);
        }

        // Schedule a debounced save
        return new Promise((resolve, reject) => {
            this.saveDebounceTimeout = setTimeout(async () => {
                try {
                    await this.saveImmediate(state);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, StorageService.SAVE_DEBOUNCE_MS);
        });
    }

    /**
     * Save state to disk immediately (bypassing debounce)
     */
    async saveImmediate(state: KanVisState): Promise<void> {
        // If a save is in progress, queue this one
        if (this.saveInProgress) {
            this.pendingSave = state;
            return;
        }

        this.saveInProgress = true;

        try {
            await this.ensureDirectory();
            await this.atomicWrite(state);
        } catch (error) {
            logError('Failed to save state', error);
            throw new StorageError('Failed to save state', error);
        } finally {
            this.saveInProgress = false;

            // Process any pending save
            if (this.pendingSave) {
                const pending = this.pendingSave;
                this.pendingSave = null;
                await this.saveImmediate(pending);
            }
        }
    }

    /**
     * Perform an atomic write (write to temp file, then rename)
     */
    private async atomicWrite(state: KanVisState): Promise<void> {
        // Update metadata
        state.lastModifiedAt = Date.now();
        state.lastModifiedBy = this.currentWindowId;

        const content = JSON.stringify(state, null, 2);
        const buffer = Buffer.from(content, 'utf8');

        // Write to temp file
        await vscode.workspace.fs.writeFile(this.tempUri, buffer);

        // Rename temp to actual (atomic on most filesystems)
        try {
            await vscode.workspace.fs.rename(this.tempUri, this.stateUri, {
                overwrite: true,
            });
        } catch {
            // If rename fails, try direct write
            await vscode.workspace.fs.writeFile(this.stateUri, buffer);
            // Clean up temp file
            try {
                await vscode.workspace.fs.delete(this.tempUri);
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Migrate state from older versions
     */
    private migrateState(state: Record<string, unknown>): Record<string, unknown> {
        let currentState = state;
        let version = (state.version as number) ?? 0;

        while (version < SCHEMA_VERSION) {
            const migration = MIGRATIONS[version];
            if (migration) {
                console.log(`[KanVis] Migrating state from v${version} to v${version + 1}`);
                currentState = migration(currentState);
            }
            version++;
        }

        currentState.version = SCHEMA_VERSION;
        return currentState;
    }

    /**
     * Validate and normalize state structure
     */
    private validateState(state: Record<string, unknown>): KanVisState {
        const defaultState = createDefaultState(this.currentWindowId);

        // Ensure required arrays exist
        const cards = Array.isArray(state.cards) ? state.cards : [];
        const columns = Array.isArray(state.columns) ? state.columns : defaultState.columns;
        const tags = Array.isArray(state.tags) ? state.tags : [];
        const activeWindowIds = Array.isArray(state.activeWindowIds)
            ? state.activeWindowIds
            : [];

        // Ensure columns have IDs (upgrade from v1 string-only columns)
        const normalizedColumns = columns.map((col, index) => {
            if (typeof col === 'string') {
                return {
                    id: createColumnId(col.toLowerCase().replace(/\s+/g, '-')),
                    name: col,
                    order: index,
                };
            }
            return {
                ...col,
                order: col.order ?? index,
            };
        });

        // Normalize cards
        const normalizedCards = cards.map((card) => ({
            ...card,
            // Ensure columnId exists (upgrade from v1 column string)
            columnId: card.columnId ?? createColumnId(
                (card.column as string)?.toLowerCase().replace(/\s+/g, '-') ?? 'backlog'
            ),
            // Ensure timestamps exist
            createdAt: card.createdAt ?? Date.now(),
            lastActiveAt: card.lastActiveAt ?? card.lastActive ?? Date.now(),
            // Normalize boolean fields
            isOpen: Boolean(card.isOpen),
            isArchived: Boolean(card.isArchived),
        }));

        return {
            version: SCHEMA_VERSION,
            cards: normalizedCards,
            columns: normalizedColumns,
            tags,
            activeWindowIds,
            settings: {
                ...defaultState.settings,
                ...(state.settings as Record<string, unknown> ?? {}),
            },
            lastModifiedAt: (state.lastModifiedAt as number) ?? Date.now(),
            lastModifiedBy: (state.lastModifiedBy as WindowId) ?? this.currentWindowId,
        };
    }

    /**
     * Delete the state file
     */
    async delete(): Promise<void> {
        try {
            await vscode.workspace.fs.delete(this.stateUri);
        } catch {
            // File may not exist
        }
    }
}

