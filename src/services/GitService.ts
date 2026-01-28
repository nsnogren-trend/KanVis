/**
 * GitService - Non-blocking git branch detection
 */

import * as vscode from 'vscode';
import { logError } from '../utils/errors.js';

/**
 * Git API types (from vscode.git extension)
 */
interface GitRepository {
    rootUri: vscode.Uri;
    state: {
        HEAD?: {
            name?: string;
            commit?: string;
        };
        onDidChange: vscode.Event<void>;
    };
}

interface GitAPI {
    repositories: GitRepository[];
    onDidOpenRepository: vscode.Event<GitRepository>;
    onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitExtensionExports {
    getAPI(version: number): GitAPI;
}

/**
 * Deferred promise helper
 */
class Deferred<T> {
    promise: Promise<T>;
    resolve!: (value: T) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

/**
 * GitService provides non-blocking git integration
 */
export class GitService implements vscode.Disposable {
    private static readonly INIT_TIMEOUT_MS = 2000;

    private api: GitAPI | null = null;
    private ready = new Deferred<void>();
    private isReady = false;
    private disposables: vscode.Disposable[] = [];
    private branchChangeCallbacks = new Map<string, Set<(branch: string | undefined) => void>>();

    /**
     * Initialize the git service (non-blocking)
     */
    async initialize(): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
            
            if (!gitExtension) {
                console.log('[KanVis] Git extension not found');
                this.ready.resolve();
                return;
            }

            // Activate the extension if needed (non-blocking)
            const exports = gitExtension.isActive
                ? gitExtension.exports
                : await gitExtension.activate();

            this.api = exports.getAPI(1);
            this.isReady = true;
            this.ready.resolve();

            // Set up listeners for repository changes
            this.setupListeners();

            console.log('[KanVis] Git service initialized with', this.api.repositories.length, 'repositories');
        } catch (error) {
            logError('Failed to initialize git service', error);
            this.ready.resolve(); // Resolve anyway to prevent blocking
        }
    }

    /**
     * Set up listeners for git repository changes
     */
    private setupListeners(): void {
        if (!this.api) {
            return;
        }

        // Listen for new repositories
        this.disposables.push(
            this.api.onDidOpenRepository((repo) => {
                console.log('[KanVis] Git repository opened:', repo.rootUri.fsPath);
                this.notifyBranchChange(repo);
                this.watchRepository(repo);
            })
        );

        // Watch existing repositories
        for (const repo of this.api.repositories) {
            this.watchRepository(repo);
        }
    }

    /**
     * Watch a repository for branch changes
     */
    private watchRepository(repo: GitRepository): void {
        this.disposables.push(
            repo.state.onDidChange(() => {
                this.notifyBranchChange(repo);
            })
        );
    }

    /**
     * Notify listeners of branch change for a repository
     */
    private notifyBranchChange(repo: GitRepository): void {
        const path = repo.rootUri.fsPath.toLowerCase();
        const callbacks = this.branchChangeCallbacks.get(path);
        
        if (callbacks) {
            const branch = repo.state.HEAD?.name;
            for (const callback of callbacks) {
                try {
                    callback(branch);
                } catch (error) {
                    logError('Error in branch change callback', error);
                }
            }
        }
    }

    /**
     * Wait for the service to be ready (with timeout)
     */
    private async waitForReady(): Promise<boolean> {
        if (this.isReady) {
            return true;
        }

        const timeout = new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), GitService.INIT_TIMEOUT_MS);
        });

        const ready = this.ready.promise.then(() => true);

        return Promise.race([ready, timeout]);
    }

    /**
     * Get the current branch for a folder path
     */
    async getBranch(folderPath: string): Promise<string | undefined> {
        await this.waitForReady();

        if (!this.api) {
            return undefined;
        }

        // Normalize path for comparison (case-insensitive on Windows)
        const normalizedPath = folderPath.toLowerCase();

        const repo = this.api.repositories.find(
            (r) => r.rootUri.fsPath.toLowerCase() === normalizedPath
        );

        return repo?.state.HEAD?.name;
    }

    /**
     * Subscribe to branch changes for a folder path
     * @returns A dispose function to unsubscribe
     */
    onBranchChange(folderPath: string, callback: (branch: string | undefined) => void): () => void {
        const normalizedPath = folderPath.toLowerCase();

        if (!this.branchChangeCallbacks.has(normalizedPath)) {
            this.branchChangeCallbacks.set(normalizedPath, new Set());
        }

        const callbacks = this.branchChangeCallbacks.get(normalizedPath)!;
        callbacks.add(callback);

        return () => {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.branchChangeCallbacks.delete(normalizedPath);
            }
        };
    }

    /**
     * Get all tracked repositories
     */
    getRepositories(): GitRepository[] {
        return this.api?.repositories ?? [];
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.branchChangeCallbacks.clear();
    }
}

