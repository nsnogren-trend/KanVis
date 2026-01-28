/**
 * kanvis Extension Entry Point
 * A rewritten Kanban board extension for managing VS Code workspaces
 */

import * as vscode from 'vscode';
import { StateManager } from './core/StateManager.js';
import { getEventBus } from './core/EventBus.js';
import { GitService } from './services/GitService.js';
import { WindowTracker } from './services/WindowTracker.js';
import { NotificationService } from './services/NotificationService.js';
import { BoardViewProvider } from './ui/BoardViewProvider.js';
import { CardId, createWindowId } from './types/index.js';
import { shortHash } from './utils/hash.js';
import { logError } from './utils/errors.js';

// Global references
let stateManager: StateManager;
let windowTracker: WindowTracker;
let gitService: GitService;
let notificationService: NotificationService;
let boardProvider: BoardViewProvider;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('[KanVis] Activating extension...');

    try {
        // Initialize event bus
        const eventBus = getEventBus();

        // Generate current window ID
        const currentWindowId = generateCurrentWindowId();

        // Initialize services
        gitService = new GitService();
        await gitService.initialize();

        stateManager = new StateManager(context, currentWindowId, eventBus);
        await stateManager.initialize();

        windowTracker = new WindowTracker(stateManager, gitService);
        await windowTracker.initialize();

        notificationService = new NotificationService(stateManager, currentWindowId);

        // Create and register the webview provider
        boardProvider = new BoardViewProvider(
            context.extensionUri,
            stateManager,
            editCard
        );

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                BoardViewProvider.viewType,
                boardProvider,
                { webviewOptions: { retainContextWhenHidden: true } }
            )
        );

        // Register commands
        registerCommands(context);

        // Add services to subscriptions for cleanup
        context.subscriptions.push(
            { dispose: () => gitService.dispose() },
            { dispose: () => stateManager.dispose() },
            { dispose: () => windowTracker.dispose() },
            { dispose: () => notificationService.dispose() },
            { dispose: () => boardProvider.dispose() }
        );

        console.log('[KanVis] Extension activated successfully');
    } catch (error) {
        logError('Failed to activate extension', error);
        throw error;
    }
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
    console.log('[KanVis] Deactivating extension...');
    
    try {
        if (windowTracker) {
            await windowTracker.unregisterCurrentWindow();
        }
    } catch (error) {
        logError('Error during deactivation', error);
    }
}

/**
 * Generate a unique ID for the current window
 */
function generateCurrentWindowId() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (workspaceFolders && workspaceFolders.length > 0) {
        const folderPath = workspaceFolders[0].uri.fsPath;
        return createWindowId(shortHash(folderPath));
    }
    
    return createWindowId(shortHash(Date.now().toString() + Math.random().toString()));
}

/**
 * Register all commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Open board command
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.openBoard', () => {
            vscode.commands.executeCommand('kanvis.boardView.focus');
        })
    );

    // Refresh board
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.refreshBoard', () => {
            windowTracker.refreshWindowStatus();
            boardProvider.refresh();
        })
    );

    // Set window status (move to column)
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.setWindowStatus', async () => {
            const columns = stateManager.getState().columns;
            const selected = await vscode.window.showQuickPick(
                columns.map((c) => ({ label: c.name, id: c.id })),
                { placeHolder: 'Select a status for this window' }
            );

            if (selected) {
                const cardId = windowTracker.getCurrentCardId();
                await stateManager.moveCard(cardId, selected.id, 0);
                vscode.window.showInformationMessage(`Window moved to "${selected.label}"`);
            }
        })
    );

    // Notify another window
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.notifyWindow', async () => {
            const state = stateManager.getState();
            const currentCardId = windowTracker.getCurrentCardId();
            const otherWindows = state.cards.filter(
                (c) => c.id !== currentCardId && !c.isArchived
            );

            if (otherWindows.length === 0) {
                vscode.window.showInformationMessage('No other windows to notify');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                otherWindows.map((w) => ({
                    label: w.name,
                    description: w.branch,
                    id: w.id,
                })),
                { placeHolder: 'Select a window to notify' }
            );

            if (selected) {
                const message = await vscode.window.showInputBox({
                    placeHolder: 'Enter notification message',
                    prompt: 'This message will be shown on the card',
                });

                if (message) {
                    await notificationService.sendNotification(selected.id, message);
                    vscode.window.showInformationMessage(`Notification sent to "${selected.label}"`);
                }
            }
        })
    );

    // Add workspace manually
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.addWorkspace', async () => {
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Add to kanvis Board',
            });

            if (folderUri && folderUri.length > 0) {
                await windowTracker.addWorkspaceManually(folderUri[0].fsPath);
                vscode.window.showInformationMessage(`Added "${folderUri[0].fsPath}" to board`);
            }
        })
    );

    // Clear all cards
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.clearAll', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Clear all cards from the board?',
                { modal: true },
                'Yes'
            );
            if (confirm === 'Yes') {
                await stateManager.clearAllCards();
                vscode.window.showInformationMessage('Board cleared');
            }
        })
    );

    // Edit current card
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.editCard', async () => {
            await editCard(windowTracker.getCurrentCardId());
        })
    );

    // Undo
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.undo', async () => {
            const success = await stateManager.undo();
            if (!success) {
                vscode.window.showInformationMessage('Nothing to undo');
            }
        })
    );

    // Redo
    context.subscriptions.push(
        vscode.commands.registerCommand('kanvis.redo', async () => {
            const success = await stateManager.redo();
            if (!success) {
                vscode.window.showInformationMessage('Nothing to redo');
            }
        })
    );

    // Move to column shortcuts
    registerMoveToColumnCommands(context);
}

/**
 * Register keyboard shortcuts for moving to columns
 */
function registerMoveToColumnCommands(context: vscode.ExtensionContext): void {
    for (let i = 1; i <= 4; i++) {
        context.subscriptions.push(
            vscode.commands.registerCommand(`kanvis.moveToColumn${i}`, async () => {
                const columns = stateManager.getState().columns;
                const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
                
                if (i <= sortedColumns.length) {
                    const targetColumn = sortedColumns[i - 1];
                    const cardId = windowTracker.getCurrentCardId();
                    await stateManager.moveCard(cardId, targetColumn.id, 0);
                    vscode.window.showInformationMessage(`Moved to "${targetColumn.name}"`);
                } else {
                    vscode.window.showWarningMessage(`Column ${i} does not exist`);
                }
            })
        );
    }
}

/**
 * Edit a card via VS Code input dialogs
 */
async function editCard(cardId: CardId): Promise<void> {
    const state = stateManager.getState();
    const card = state.cards.find((c) => c.id === cardId);

    if (!card) {
        return;
    }

    const editOption = await vscode.window.showQuickPick(
        [
            { label: '📝 Edit Notes', value: 'notes' },
            { label: '🎨 Set Color', value: 'color' },
            { label: '✏️ Rename', value: 'name' },
            { label: '🏷️ Manage Tags', value: 'tags' },
        ],
        { placeHolder: `Edit "${card.name}"` }
    );

    if (!editOption) {
        return;
    }

    switch (editOption.value) {
        case 'notes': {
            const notes = await vscode.window.showInputBox({
                prompt: 'Enter notes for this workspace',
                value: card.notes ?? '',
                placeHolder: 'e.g., Waiting on code review',
            });
            if (notes !== undefined) {
                await stateManager.updateCard(cardId, { notes: notes || undefined });
            }
            break;
        }

        case 'color': {
            const colors = [
                { label: '🔴 Red', value: '#ef4444' },
                { label: '🟠 Orange', value: '#f97316' },
                { label: '🟡 Yellow', value: '#eab308' },
                { label: '🟢 Green', value: '#22c55e' },
                { label: '🔵 Blue', value: '#3b82f6' },
                { label: '🟣 Purple', value: '#a855f7' },
                { label: '⚪ None (default)', value: '' },
            ];
            const selected = await vscode.window.showQuickPick(colors, {
                placeHolder: 'Select a color for this card',
            });
            if (selected) {
                await stateManager.updateCard(cardId, {
                    color: selected.value || undefined,
                });
            }
            break;
        }

        case 'name': {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter display name for this workspace',
                value: card.name,
                placeHolder: 'Display name',
            });
            if (name) {
                await stateManager.updateCard(cardId, { name });
            }
            break;
        }

        case 'tags': {
            await editCardTags(cardId);
            break;
        }
    }
}

/**
 * Edit tags for a card
 */
async function editCardTags(cardId: CardId): Promise<void> {
    const state = stateManager.getState();
    const card = state.cards.find((c) => c.id === cardId);

    if (!card) {
        return;
    }

    const action = await vscode.window.showQuickPick(
        [
            { label: '➕ Add Tag', value: 'add' },
            { label: '➖ Remove Tag', value: 'remove' },
            { label: '🆕 Create New Tag', value: 'create' },
        ],
        { placeHolder: 'Manage tags' }
    );

    if (!action) {
        return;
    }

    switch (action.value) {
        case 'add': {
            const availableTags = state.tags.filter(
                (t) => !card.tags?.includes(t.id)
            );
            if (availableTags.length === 0) {
                vscode.window.showInformationMessage('No tags available to add');
                return;
            }
            const selected = await vscode.window.showQuickPick(
                availableTags.map((t) => ({ label: t.name, id: t.id })),
                { placeHolder: 'Select a tag to add' }
            );
            if (selected) {
                await stateManager.addTagToCard(cardId, selected.id);
            }
            break;
        }

        case 'remove': {
            if (!card.tags || card.tags.length === 0) {
                vscode.window.showInformationMessage('No tags to remove');
                return;
            }
            const cardTags = card.tags
                .map((id) => state.tags.find((t) => t.id === id))
                .filter((t): t is NonNullable<typeof t> => t !== undefined);
            const selected = await vscode.window.showQuickPick(
                cardTags.map((t) => ({ label: t.name, id: t.id })),
                { placeHolder: 'Select a tag to remove' }
            );
            if (selected) {
                await stateManager.removeTagFromCard(cardId, selected.id);
            }
            break;
        }

        case 'create': {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter tag name',
                placeHolder: 'Tag name',
            });
            if (!name) {
                return;
            }
            const colors = [
                { label: '🔴 Red', value: '#ef4444' },
                { label: '🟠 Orange', value: '#f97316' },
                { label: '🟡 Yellow', value: '#eab308' },
                { label: '🟢 Green', value: '#22c55e' },
                { label: '🔵 Blue', value: '#3b82f6' },
                { label: '🟣 Purple', value: '#a855f7' },
            ];
            const color = await vscode.window.showQuickPick(colors, {
                placeHolder: 'Select tag color',
            });
            if (color) {
                const tag = await stateManager.createTag(name, color.value);
                await stateManager.addTagToCard(cardId, tag.id);
            }
            break;
        }
    }
}

