/**
 * KanVis 4 Extension Entry Point
 * 
 * This extension tracks open VS Code windows and displays them
 * in a kanban-style board in the sidebar.
 * 
 * Rebuilt with testability as a first-class concern:
 * - Dependency injection throughout
 * - Interface-based services
 * - Pure domain models
 * - Minimal coupling to VS Code APIs
 * 
 * V5 Enhancements:
 * - Event sourcing with undo/redo
 * - Runtime validation with Zod
 * - CRDT-based synchronization (optional)
 */

import * as vscode from 'vscode';
import { StorageService } from './services/StorageService.js';
import { CRDTStorageService } from './services/CRDTStorageService.js';
import { BoardService } from './services/BoardService.js';
import { WindowManager } from './services/WindowManager.js';
import { BoardViewProvider } from './webview/BoardViewProvider.js';

let boardService: BoardService;
let windowManager: WindowManager;
let boardProvider: BoardViewProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[KanVis] Activating extension');

  try {
    // V5: Choose storage service based on configuration
    const config = vscode.workspace.getConfiguration('kanvis');
    const useCRDT = config.get<boolean>('enableCRDTSync', false);
    
    const storageService = useCRDT
      ? new CRDTStorageService(context)
      : new StorageService(context);
    
    console.log(`[KanVis] Using ${useCRDT ? 'CRDT' : 'standard'} storage service`);
    
    boardService = new BoardService(storageService);
    await boardService.initialize();

    windowManager = new WindowManager(boardService, context);
    await windowManager.initialize();

    // Create and register webview provider
    boardProvider = new BoardViewProvider(
      context.extensionUri,
      boardService,
      windowManager
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        BoardViewProvider.viewType,
        boardProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('kanvis4.openBoard', () => {
        vscode.commands.executeCommand('kanvis4.boardView.focus');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kanvis4.refreshBoard', async () => {
        await windowManager.registerCurrentWindow();
      })
    );

    // V5: Undo/Redo commands
    context.subscriptions.push(
      vscode.commands.registerCommand('kanvis4.undo', async () => {
        const success = await boardService.undo();
        if (success) {
          vscode.window.showInformationMessage('KanVis: Undid last action');
        } else {
          vscode.window.showInformationMessage('KanVis: Nothing to undo');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('kanvis4.redo', async () => {
        const success = await boardService.redo();
        if (success) {
          vscode.window.showInformationMessage('KanVis: Redid action');
        } else {
          vscode.window.showInformationMessage('KanVis: Nothing to redo');
        }
      })
    );

    console.log('[KanVis] Extension activated successfully');
  } catch (error) {
    console.error('[KanVis] Failed to activate:', error);
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  console.log('[KanVis] Deactivating extension');

  try {
    if (windowManager) {
      await windowManager.unregisterCurrentWindow();
      windowManager.dispose();
    }
  } catch (error) {
    console.error('[KanVis] Error during deactivation:', error);
  }
}
