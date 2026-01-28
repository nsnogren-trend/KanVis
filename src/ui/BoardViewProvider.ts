/**
 * BoardViewProvider - Webview provider for the Kanban board
 */

import * as vscode from 'vscode';
import { StateManager } from '../core/StateManager.js';
import { KanVisState, CardId } from '../types/index.js';
import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../types/messages.js';
import { generateNonce } from '../utils/hash.js';
import { logError } from '../utils/errors.js';

/**
 * BoardViewProvider provides the webview content for the kanvis sidebar panel
 */
export class BoardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'kanvis.boardView';

    private webviewView?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly stateManager: StateManager,
        private readonly onEditCard: (cardId: CardId) => Promise<void>
    ) {
        // Listen for state changes and update webview
        this.disposables.push(
            this.stateManager.onStateChange((state) => {
                this.sendStateUpdate(state);
            })
        );
    }

    /**
     * Called when the webview is created
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
            ],
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
                await this.handleMessage(message);
            })
        );

        // Send initial state when webview becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.sendStateUpdate(this.stateManager.getState());
                this.sendHistoryUpdate();
            }
        });
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        try {
            switch (message.type) {
                case 'ready':
                    this.sendStateUpdate(this.stateManager.getState());
                    this.sendHistoryUpdate();
                    break;

                case 'refresh':
                    this.stateManager.syncWindowStatus();
                    this.sendStateUpdate(this.stateManager.getState());
                    break;

                case 'card:open':
                    await this.openWindow(message.cardId);
                    break;

                case 'card:move':
                    await this.stateManager.moveCard(message.cardId, message.toColumnId, message.toOrder);
                    break;

                case 'card:update':
                    await this.stateManager.updateCard(message.cardId, message.updates);
                    break;

                case 'card:confirmDelete':
                    const deleteConfirm = await vscode.window.showWarningMessage(
                        'Delete this card?',
                        { modal: true },
                        'Delete'
                    );
                    if (deleteConfirm === 'Delete') {
                        await this.stateManager.deleteCard(message.cardId);
                    }
                    break;

                case 'card:archive':
                    await this.stateManager.archiveCard(message.cardId);
                    break;

                case 'card:restore':
                    await this.stateManager.restoreCard(message.cardId);
                    break;

                case 'card:edit':
                    await this.onEditCard(message.cardId);
                    break;

                case 'column:create': {
                    const name = await vscode.window.showInputBox({
                        prompt: 'Enter column name',
                        placeHolder: 'Column name',
                        validateInput: (value) => value?.trim() ? null : 'Name is required'
                    });
                    if (name?.trim()) {
                        await this.stateManager.createColumn(name.trim());
                    }
                    break;
                }

                case 'column:rename': {
                    const col = this.stateManager.getState().columns.find(c => c.id === message.columnId);
                    if (col) {
                        const newName = await vscode.window.showInputBox({
                            prompt: 'Enter new column name',
                            value: col.name,
                            validateInput: (value) => value?.trim() ? null : 'Name is required'
                        });
                        if (newName?.trim()) {
                            await this.stateManager.updateColumn(message.columnId, { name: newName.trim() });
                        }
                    }
                    break;
                }

                case 'column:delete': {
                    const delConfirm = await vscode.window.showWarningMessage(
                        'Delete this column? Cards will be moved to the first column.',
                        { modal: true },
                        'Delete'
                    );
                    if (delConfirm === 'Delete') {
                        await this.stateManager.deleteColumn(message.columnId);
                    }
                    break;
                }

                case 'column:reorder':
                    await this.stateManager.reorderColumn(message.columnId, message.newOrder);
                    break;

                case 'column:toggleCollapse':
                    const column = this.stateManager.getState().columns.find(c => c.id === message.columnId);
                    if (column) {
                        await this.stateManager.updateColumn(message.columnId, { 
                            isCollapsed: !column.isCollapsed 
                        });
                    }
                    break;

                case 'notification:send':
                    await this.stateManager.setNotification(
                        message.cardId,
                        message.message,
                        this.stateManager.getCurrentWindowId()
                    );
                    break;

                case 'notification:clear':
                    await this.stateManager.clearNotification(message.cardId);
                    break;

                case 'tag:create':
                    await this.stateManager.createTag(message.name, message.color);
                    break;

                case 'tag:delete':
                    await this.stateManager.deleteTag(message.tagId);
                    break;

                case 'card:addTag':
                    await this.stateManager.addTagToCard(message.cardId, message.tagId);
                    break;

                case 'card:removeTag':
                    await this.stateManager.removeTagFromCard(message.cardId, message.tagId);
                    break;

                case 'settings:update':
                    await this.stateManager.updateSettings(message.settings);
                    break;

                case 'history:undo':
                    await this.stateManager.undo();
                    this.sendHistoryUpdate();
                    break;

                case 'history:redo':
                    await this.stateManager.redo();
                    this.sendHistoryUpdate();
                    break;

                case 'search:query':
                    this.handleSearch(message.query);
                    break;

                case 'search:clear':
                    this.sendMessage({ type: 'search:results', matchingCardIds: [], query: '' });
                    break;
            }
        } catch (error) {
            logError('Error handling webview message', error);
            this.sendMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'An error occurred',
            });
        }
    }

    /**
     * Handle search query
     */
    private handleSearch(query: string): void {
        const state = this.stateManager.getState();
        const lowerQuery = query.toLowerCase();

        const matchingCardIds = state.cards
            .filter((card) => {
                return (
                    card.name.toLowerCase().includes(lowerQuery) ||
                    card.branch?.toLowerCase().includes(lowerQuery) ||
                    card.notes?.toLowerCase().includes(lowerQuery) ||
                    card.path.toLowerCase().includes(lowerQuery)
                );
            })
            .map((card) => card.id);

        this.sendMessage({
            type: 'search:results',
            matchingCardIds,
            query,
        });
    }

    /**
     * Open a window/workspace
     */
    private async openWindow(cardId: CardId): Promise<void> {
        const state = this.stateManager.getState();
        const card = state.cards.find((c) => c.id === cardId);

        if (!card) {
            return;
        }

        const uri = vscode.Uri.file(card.path);

        // Clear notification when opening
        if (card.notification) {
            await this.stateManager.clearNotification(cardId);
        }

        // Open the folder in a new window
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    }

    /**
     * Send state update to webview
     */
    private sendStateUpdate(state: KanVisState): void {
        // Recalculate isOpen based on lastPingAt before sending
        this.stateManager.syncWindowStatus();

        this.sendMessage({
            type: 'state:update',
            state,
            currentWindowId: this.stateManager.getCurrentWindowId(),
        });
    }

    /**
     * Send history update to webview
     */
    private sendHistoryUpdate(): void {
        this.sendMessage({
            type: 'history:update',
            canUndo: this.stateManager.canUndo(),
            canRedo: this.stateManager.canRedo(),
            undoDescription: this.stateManager.getUndoDescription(),
            redoDescription: this.stateManager.getRedoDescription(),
        });
    }

    /**
     * Send a message to the webview
     */
    private sendMessage(message: ExtensionToWebviewMessage): void {
        if (this.webviewView) {
            this.webviewView.webview.postMessage(message);
        }
    }

    /**
     * Refresh the webview
     */
    public refresh(): void {
        this.sendStateUpdate(this.stateManager.getState());
    }

    /**
     * Get HTML content for the webview
     */
    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = generateNonce();

        // Get URI for bundled webview script
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js')
        );

        // Get URI for styles
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; connect-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>kanvis Board</title>
</head>
<body>
    <div id="app">
        <div class="loading">Loading kanvis...</div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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

