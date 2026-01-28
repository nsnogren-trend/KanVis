/**
 * WindowTracker - Window lifecycle management
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
    CardId,
    WindowId,
    createCardId,
    createWindowId,
} from '../types/index.js';
import { StateManager } from '../core/StateManager.js';
import { GitService } from './GitService.js';
import { shortHash } from '../utils/hash.js';
import { logError } from '../utils/errors.js';

/**
 * WindowTracker manages the lifecycle of the current VS Code window
 */
export class WindowTracker implements vscode.Disposable {
    private static readonly PING_INTERVAL_MS = 2_000; // 2 seconds

    private currentWindowId: WindowId;
    private disposables: vscode.Disposable[] = [];
    private gitBranchDispose: (() => void) | null = null;
    private pingInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly stateManager: StateManager,
        private readonly gitService: GitService
    ) {
        this.currentWindowId = this.generateWindowId();
    }

    /**
     * Initialize the window tracker
     */
    async initialize(): Promise<void> {
        // Register this window
        await this.registerCurrentWindow();

        // Start heartbeat ping
        this.startHeartbeat();

        // Set up git branch watching
        this.setupGitBranchWatching();

        // Listen for workspace folder changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.handleWorkspaceFoldersChange();
            })
        );
    }

    /**
     * Start the heartbeat ping interval
     */
    private startHeartbeat(): void {
        // Clear any existing interval
        this.stopHeartbeat();

        // Ping every 5 seconds to indicate this window is still open
        this.pingInterval = setInterval(async () => {
            try {
                await this.stateManager.pingWindow(this.currentWindowId);
            } catch (error) {
                logError('Failed to send heartbeat ping', error);
            }
        }, WindowTracker.PING_INTERVAL_MS);
    }

    /**
     * Stop the heartbeat ping interval
     */
    private stopHeartbeat(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Generate a unique ID for the current window based on workspace
     */
    private generateWindowId(): WindowId {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders && workspaceFolders.length > 0) {
            const folderPath = workspaceFolders[0].uri.fsPath;
            return createWindowId(shortHash(folderPath));
        }
        
        // For windows without a workspace folder, use a random ID
        return createWindowId(shortHash(Date.now().toString() + Math.random().toString()));
    }

    /**
     * Get the current window's ID
     */
    getCurrentWindowId(): WindowId {
        return this.currentWindowId;
    }

    /**
     * Get the current window's card ID (same as window ID)
     */
    getCurrentCardId(): CardId {
        return this.currentWindowId as unknown as CardId;
    }

    /**
     * Register the current window in the state
     */
    async registerCurrentWindow(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.log('[KanVis] No workspace folder open, skipping registration');
            return;
        }

        const folderPath = workspaceFolders[0].uri.fsPath;
        const folderName = path.basename(folderPath);

        try {
            // Check if this window already has a card
            const existingCard = this.stateManager.getCard(this.getCurrentCardId());

            if (existingCard) {
                // Update existing card
                await this.stateManager.updateCard(this.getCurrentCardId(), {
                    name: folderName,
                    path: folderPath,
                    isOpen: true,
                    lastActiveAt: Date.now(),
                    branch: await this.gitService.getBranch(folderPath),
                });
            } else {
                // Create new card
                await this.stateManager.createCard({
                    id: this.getCurrentCardId(),
                    name: folderName,
                    path: folderPath,
                    branch: await this.gitService.getBranch(folderPath),
                });
            }

            // Register window as active
            await this.stateManager.registerWindow(this.currentWindowId);

            console.log('[KanVis] Registered window:', folderName);
        } catch (error) {
            logError('Failed to register window', error);
        }
    }

    /**
     * Unregister the current window
     */
    async unregisterCurrentWindow(): Promise<void> {
        try {
            await this.stateManager.unregisterWindow(this.currentWindowId);
            console.log('[KanVis] Unregistered window');
        } catch (error) {
            logError('Failed to unregister window', error);
        }
    }

    /**
     * Set up watching for git branch changes
     */
    private setupGitBranchWatching(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const folderPath = workspaceFolders[0].uri.fsPath;

        // Clean up previous watcher
        if (this.gitBranchDispose) {
            this.gitBranchDispose();
        }

        // Set up new watcher
        this.gitBranchDispose = this.gitService.onBranchChange(folderPath, async (branch) => {
            try {
                await this.stateManager.updateCard(this.getCurrentCardId(), { branch });
                console.log('[KanVis] Branch changed to:', branch);
            } catch {
                // Card may not exist yet
            }
        });
    }

    /**
     * Handle workspace folder changes
     */
    private async handleWorkspaceFoldersChange(): Promise<void> {
        // Re-generate window ID based on new workspace
        const oldWindowId = this.currentWindowId;
        this.currentWindowId = this.generateWindowId();

        // If the window ID changed, we need to update
        if (oldWindowId !== this.currentWindowId) {
            await this.stateManager.unregisterWindow(oldWindowId);
            await this.registerCurrentWindow();
            this.setupGitBranchWatching();
        }
    }

    /**
     * Add a workspace manually (for adding closed workspaces)
     */
    async addWorkspaceManually(folderPath: string): Promise<void> {
        const folderName = path.basename(folderPath);
        const id = createCardId(shortHash(folderPath));

        // Check if already exists
        if (this.stateManager.getCard(id)) {
            console.log('[KanVis] Workspace already exists:', folderName);
            return;
        }

        await this.stateManager.createCard({
            id,
            name: folderName,
            path: folderPath,
            branch: await this.gitService.getBranch(folderPath),
        });

        // Mark as not open since it's being added manually
        await this.stateManager.updateCard(id, { isOpen: false });

        console.log('[KanVis] Added workspace manually:', folderName);
    }

    /**
     * Refresh window status (sync isOpen with activeWindowIds)
     */
    refreshWindowStatus(): void {
        this.stateManager.syncWindowStatus();
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Stop heartbeat
        this.stopHeartbeat();

        if (this.gitBranchDispose) {
            this.gitBranchDispose();
            this.gitBranchDispose = null;
        }
        
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

