import * as vscode from 'vscode';
import * as path from 'path';
import { createWindow } from '../models/Window.js';
import { BoardService } from './BoardService.js';

/**
 * Service for tracking the current VS Code window
 * Uses dependency injection for testability
 */
export class WindowManager {
  private static readonly HEARTBEAT_INTERVAL_MS = 5000;
  private static readonly GIT_RETRY_DELAY_MS = 1000;
  private static readonly GIT_MAX_RETRIES = 5;
  
  private currentWindowId?: string;
  private heartbeatTimer?: NodeJS.Timeout;
  private gitExtension?: any;
  private gitApi?: any;

  constructor(
    private readonly boardService: BoardService,
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Initialize window tracking
   */
  async initialize(): Promise<void> {
    // Try to get git extension (optional - don't fail if not available)
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension && !gitExtension.isActive) {
        await gitExtension.activate();
      }
      this.gitExtension = gitExtension?.exports;
      
      // Get API and watch for repository changes
      if (this.gitExtension) {
        this.gitApi = this.gitExtension.getAPI(1);
        
        // Watch for repository state changes to update branch
        if (this.gitApi) {
          this.gitApi.onDidChangeState?.(() => {
            this.updateCurrentWindowBranch();
          });
          
          // Also watch for HEAD changes on each repo
          for (const repo of this.gitApi.repositories) {
            repo.state?.onDidChange?.(() => {
              this.updateCurrentWindowBranch();
            });
          }
          
          // Watch for new repositories being opened
          this.gitApi.onDidOpenRepository?.((repo: any) => {
            repo.state?.onDidChange?.(() => {
              this.updateCurrentWindowBranch();
            });
            // Update immediately when a new repo is found
            this.updateCurrentWindowBranch();
          });
        }
      }
    } catch (error) {
      console.log('[WindowManager] Git extension not available, branch tracking disabled');
    }
    
    // Register current window if workspace is open
    await this.registerCurrentWindow();
    
    // Retry getting branch after a delay (git might not be ready)
    this.retryBranchUpdate();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Listen for workspace changes
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.registerCurrentWindow();
      })
    );
  }
  
  /**
   * Retry getting the branch after delays (git extension may load slowly)
   */
  private async retryBranchUpdate(): Promise<void> {
    for (let i = 0; i < WindowManager.GIT_MAX_RETRIES; i++) {
      await new Promise(resolve => setTimeout(resolve, WindowManager.GIT_RETRY_DELAY_MS));
      await this.updateCurrentWindowBranch();
    }
  }
  
  /**
   * Update current window's branch information
   */
  private async updateCurrentWindowBranch(): Promise<void> {
    if (!this.currentWindowId) {
      return;
    }
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }
    
    const folderPath = workspaceFolders[0].uri.fsPath;
    const branch = await this.getGitBranch(folderPath);
    
    if (branch) {
      await this.boardService.updateWindow(this.currentWindowId, { branch });
    }
  }

  /**
   * Get the current window's unique ID
   */
  getCurrentWindowId(): string | undefined {
    return this.currentWindowId;
  }

  /**
   * Register the current window in the board
   */
  async registerCurrentWindow(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
      console.log('[WindowManager] No workspace folder open');
      return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;
    const folderName = path.basename(folderPath);
    
    // Generate window ID from path
    this.currentWindowId = this.hashPath(folderPath);
    
    // Get git branch
    const branch = await this.getGitBranch(folderPath);
    
    // Get or create window
    const state = this.boardService.getState();
    const existingWindow = state.windows.find(w => w.id === this.currentWindowId);
    
    if (existingWindow) {
      // Update existing window
      await this.boardService.updateWindow(this.currentWindowId, {
        name: folderName,
        path: folderPath,
        branch,
        isOpen: true,
        lastActiveAt: Date.now(),
      });
    } else {
      // Create new window in first column
      const firstColumn = state.columns[0];
      if (firstColumn) {
        const windowsInColumn = state.windows.filter(w => w.columnId === firstColumn.id);
        const newWindow = createWindow(
          this.currentWindowId,
          folderName,
          folderPath,
          firstColumn.id,
          windowsInColumn.length
        );
        newWindow.branch = branch;
        await this.boardService.addOrUpdateWindow(newWindow);
      }
    }

    console.log('[WindowManager] Registered window:', folderName);
  }

  /**
   * Unregister the current window (mark as closed)
   */
  async unregisterCurrentWindow(): Promise<void> {
    if (this.currentWindowId) {
      await this.boardService.updateWindowStatus(this.currentWindowId, false);
      console.log('[WindowManager] Unregistered window');
    }
    
    this.stopHeartbeat();
  }

  /**
   * Start heartbeat to keep window marked as open
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(async () => {
      if (this.currentWindowId) {
        await this.boardService.updateWindowStatus(this.currentWindowId, true);
      }
    }, WindowManager.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Get git branch for a workspace
   */
  private async getGitBranch(workspacePath: string): Promise<string | undefined> {
    try {
      if (!this.gitApi) {
        return undefined;
      }

      const repo = this.gitApi.repositories.find((r: any) => 
        workspacePath.startsWith(r.rootUri.fsPath)
      );

      return repo?.state?.HEAD?.name;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Hash a path to create a stable ID
   */
  private hashPath(path: string): string {
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stopHeartbeat();
  }
}
