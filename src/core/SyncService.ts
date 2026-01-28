/**
 * SyncService - Cross-window synchronization with debounced file watching
 */

import * as vscode from 'vscode';
import { KanVisState, WindowId } from '../types/index.js';
import { StorageService } from './StorageService.js';
import { EventBus } from './EventBus.js';
import { debounce } from '../utils/debounce.js';
import { logError } from '../utils/errors.js';

/**
 * SyncService handles cross-window state synchronization
 */
export class SyncService implements vscode.Disposable {
    private static readonly SYNC_DEBOUNCE_MS = 100;

    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private lastKnownModifiedAt = 0;
    private isLoadingState = false;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly storageService: StorageService,
        private readonly eventBus: EventBus,
        private readonly currentWindowId: WindowId,
        private readonly onStateLoaded: (state: KanVisState) => void
    ) {}

    /**
     * Start watching for state changes from other windows
     */
    start(): void {
        this.setupFileWatcher();
    }

    /**
     * Set up file watcher for cross-window synchronization
     */
    private setupFileWatcher(): void {
        const stateUri = this.storageService.getStateUri();
        const pattern = new vscode.RelativePattern(
            vscode.Uri.joinPath(stateUri, '..'),
            '*.json'
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Debounce the file change handler to avoid rapid reloads
        const handleFileChange = debounce(async () => {
            await this.handleExternalChange();
        }, SyncService.SYNC_DEBOUNCE_MS);

        this.fileWatcher.onDidChange(handleFileChange);
        this.fileWatcher.onDidCreate(handleFileChange);

        this.disposables.push(this.fileWatcher);
    }

    /**
     * Handle external state changes (from other windows)
     */
    private async handleExternalChange(): Promise<void> {
        // Prevent recursive loading
        if (this.isLoadingState) {
            return;
        }

        try {
            this.isLoadingState = true;
            const diskState = await this.storageService.load();

            // Only apply if the disk state is newer and from a different window
            if (
                diskState.lastModifiedAt > this.lastKnownModifiedAt &&
                diskState.lastModifiedBy !== this.currentWindowId
            ) {
                console.log(
                    `[KanVis] External state change detected from window ${diskState.lastModifiedBy}`
                );
                this.lastKnownModifiedAt = diskState.lastModifiedAt;
                
                // Notify listeners
                this.onStateLoaded(diskState);
                this.eventBus.emit({ type: 'state:synced', state: diskState });
            }
        } catch (error) {
            logError('Failed to handle external state change', error);
        } finally {
            this.isLoadingState = false;
        }
    }

    /**
     * Update the last known modified timestamp after saving
     */
    updateLastModified(timestamp: number): void {
        this.lastKnownModifiedAt = timestamp;
    }

    /**
     * Force a sync with disk state
     */
    async forceSync(): Promise<KanVisState> {
        this.isLoadingState = true;
        try {
            const state = await this.storageService.load();
            this.lastKnownModifiedAt = state.lastModifiedAt;
            return state;
        } finally {
            this.isLoadingState = false;
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.fileWatcher = undefined;
    }
}

