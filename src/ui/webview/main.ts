/**
 * kanvis Webview Main Entry Point
 */

import type { 
    KanVisState, 
    Card, 
    Column, 
    CardId, 
    ColumnId, 
    WindowId 
} from '../../types/index.js';
import type { 
    WebviewToExtensionMessage, 
    ExtensionToWebviewMessage 
} from '../../types/messages.js';

// ============================================================================
// VS Code API
// ============================================================================

interface VSCodeAPI {
    postMessage(message: WebviewToExtensionMessage): void;
    getState<T>(): T | undefined;
    setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

// ============================================================================
// State
// ============================================================================

let state: KanVisState | null = null;
let currentWindowId: WindowId | null = null;
let draggedCardId: CardId | null = null;
let searchQuery = '';
let matchingCardIds: CardId[] = [];
let canUndo = false;
let canRedo = false;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Restore previous state if available
    const savedState = vscode.getState<{ state: KanVisState; currentWindowId: WindowId }>();
    if (savedState) {
        state = savedState.state;
        currentWindowId = savedState.currentWindowId;
        renderBoard();
    }

    // Notify extension we're ready
    vscode.postMessage({ type: 'ready' });

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
});

// Handle messages from extension
window.addEventListener('message', (event) => {
    const message = event.data as ExtensionToWebviewMessage;

    switch (message.type) {
        case 'state:update':
            state = message.state;
            currentWindowId = message.currentWindowId;
            vscode.setState({ state, currentWindowId });
            renderBoard();
            break;

        case 'history:update':
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateToolbar();
            break;

        case 'search:results':
            matchingCardIds = message.matchingCardIds;
            searchQuery = message.query;
            renderBoard();
            break;

        case 'error':
            showError(message.message);
            break;
    }
});

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            vscode.postMessage({ type: 'history:undo' });
        }
        
        // Ctrl/Cmd + Shift + Z for redo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            vscode.postMessage({ type: 'history:redo' });
        }

        // Escape to clear search
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('searchInput') as HTMLInputElement;
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                vscode.postMessage({ type: 'search:clear' });
            }
        }
    });
}

// ============================================================================
// Rendering
// ============================================================================

function renderBoard(): void {
    const app = document.getElementById('app');
    if (!app) {return;}

    if (!state || state.cards.length === 0) {
        app.innerHTML = `
            <div class="toolbar">
                ${renderToolbar()}
            </div>
            <div class="empty-message">
                <div class="empty-icon">📋</div>
                <div class="empty-title">No workspaces tracked yet</div>
                <div class="empty-subtitle">Open workspace folders to see them here</div>
            </div>
        `;
        attachToolbarListeners();
        return;
    }

    // Sort columns by order
    const sortedColumns = [...state.columns].sort((a, b) => a.order - b.order);

    // Filter cards based on settings and search
    const visibleCards = state.cards.filter((card) => {
        // Filter archived
        if (card.isArchived && !state?.settings.showArchivedCards) {
            return false;
        }
        // Filter closed windows
        if (!card.isOpen && !state?.settings.showClosedWindows) {
            return false;
        }
        // Filter by search
        if (searchQuery && !matchingCardIds.includes(card.id)) {
            return false;
        }
        return true;
    });

    let html = `<div class="toolbar">${renderToolbar()}</div>`;
    html += '<div class="board">';

    for (const column of sortedColumns) {
        const cardsInColumn = visibleCards
            .filter((card) => card.columnId === column.id)
            .sort((a, b) => {
                const sortBy = state?.settings.sortBy ?? 'order';
                const dir = state?.settings.sortDirection === 'desc' ? -1 : 1;
                
                switch (sortBy) {
                    case 'name':
                        return a.name.localeCompare(b.name) * dir;
                    case 'lastActive':
                        return (a.lastActiveAt - b.lastActiveAt) * dir;
                    case 'createdAt':
                        return (a.createdAt - b.createdAt) * dir;
                    default:
                        return (a.order - b.order) * dir;
                }
            });

        html += renderColumn(column, cardsInColumn);
    }

    html += '</div>';
    app.innerHTML = html;

    attachEventListeners();
    attachToolbarListeners();
}

function renderToolbar(): string {
    return `
        <div class="toolbar-left">
            <button id="refreshBtn" class="toolbar-btn" title="Refresh">↻</button>
            <button id="undoBtn" class="toolbar-btn" title="Undo" ${!canUndo ? 'disabled' : ''}>↩</button>
            <button id="redoBtn" class="toolbar-btn" title="Redo" ${!canRedo ? 'disabled' : ''}>↪</button>
        </div>
        <div class="toolbar-center">
            <input 
                type="text" 
                id="searchInput" 
                class="search-input" 
                placeholder="Search cards..." 
                value="${escapeHtml(searchQuery)}"
            >
        </div>
        <div class="toolbar-right">
            <button id="addColumnBtn" class="toolbar-btn" title="Add Column">+ Column</button>
        </div>
    `;
}

function renderColumn(column: Column, cards: Card[]): string {
    const isCollapsed = column.isCollapsed ?? false;
    const wipWarning = column.wipLimit && cards.length > column.wipLimit;
    
    let html = `
        <div class="column ${isCollapsed ? 'collapsed' : ''}" data-column-id="${column.id}">
            <div class="column-header" style="${column.color ? `border-top: 3px solid ${column.color}` : ''}">
                <button class="column-collapse" data-column-id="${column.id}">
                    ${isCollapsed ? '▶' : '▼'}
                </button>
                <span class="column-name">${escapeHtml(column.name)}</span>
                <span class="column-count ${wipWarning ? 'wip-warning' : ''}">
                    ${cards.length}${column.wipLimit ? `/${column.wipLimit}` : ''}
                </span>
                <div class="column-actions">
                    <button class="column-action edit-column-btn" data-column-id="${column.id}" title="Edit">✎</button>
                    <button class="column-action delete-column-btn" data-column-id="${column.id}" title="Delete">×</button>
                </div>
            </div>
    `;

    if (!isCollapsed) {
        html += `<div class="cards" data-column-id="${column.id}">`;
        for (const card of cards) {
            html += renderCard(card);
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function renderCard(card: Card): string {
    const isCurrent = card.id === (currentWindowId as unknown as CardId);
    const hasNotification = !!card.notification;
    const isSearchMatch = searchQuery && matchingCardIds.includes(card.id);

    const classes = ['card'];
    if (!card.isOpen) {classes.push('closed');}
    if (isCurrent) {classes.push('current');}
    if (hasNotification) {classes.push('notification');}
    if (card.isArchived) {classes.push('archived');}
    if (isSearchMatch) {classes.push('search-match');}
    if (state?.settings.compactView) {classes.push('compact');}

    const colorStyle = card.color ? `border-left: 3px solid ${card.color};` : '';

    let html = `
        <div class="${classes.join(' ')}" data-card-id="${card.id}" draggable="true" style="${colorStyle}">
            <div class="card-actions">
                <button class="card-action edit-btn" data-card-id="${card.id}" title="Edit">✎</button>
                ${hasNotification ? `<button class="card-action clear-btn" data-card-id="${card.id}" title="Clear notification">✓</button>` : ''}
                ${card.isArchived ? `<button class="card-action restore-btn" data-card-id="${card.id}" title="Restore">↩</button>` : `<button class="card-action archive-btn" data-card-id="${card.id}" title="Archive">📥</button>`}
                <button class="card-action delete-btn" data-card-id="${card.id}" title="Delete">×</button>
            </div>
            <div class="card-header">
                <span class="card-status ${card.isOpen ? 'open' : 'closed'}"></span>
                <span class="card-name" title="${escapeHtml(card.path)}">${escapeHtml(card.name)}</span>
            </div>
    `;

    if (!state?.settings.compactView) {
        if (card.branch) {
            html += `<div class="card-branch">${escapeHtml(card.branch)}</div>`;
        }
        if (card.notes) {
            html += `<div class="card-notes">${escapeHtml(card.notes)}</div>`;
        }
        if (hasNotification && card.notification) {
            html += `<div class="card-notification">${escapeHtml(card.notification.message)}</div>`;
        }
        if (card.tags && card.tags.length > 0 && state) {
            const tagHtml = card.tags
                .map((tagId) => {
                    const tag = state!.tags.find((t) => t.id === tagId);
                    return tag ? `<span class="tag" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>` : '';
                })
                .filter(Boolean)
                .join('');
            if (tagHtml) {
                html += `<div class="card-tags">${tagHtml}</div>`;
            }
        }
    }

    html += '</div>';
    return html;
}

function updateToolbar(): void {
    const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement;
    const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement;
    
    if (undoBtn) {undoBtn.disabled = !canUndo;}
    if (redoBtn) {redoBtn.disabled = !canRedo;}
}

// ============================================================================
// Event Listeners
// ============================================================================

function attachToolbarListeners(): void {
    const refreshBtn = document.getElementById('refreshBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const addColumnBtn = document.getElementById('addColumnBtn');

    refreshBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    undoBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'history:undo' });
    });

    redoBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'history:redo' });
    });

    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (query) {
            vscode.postMessage({ type: 'search:query', query });
        } else {
            vscode.postMessage({ type: 'search:clear' });
        }
    });

    addColumnBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'column:create' });
    });
}

function attachEventListeners(): void {
    // Card events
    document.querySelectorAll('.card').forEach((cardEl) => {
        const card = cardEl as HTMLElement;
        const cardId = card.dataset.cardId as CardId;

        // Click to open
        card.addEventListener('click', (e) => {
            // Don't open if clicking on an action button
            if ((e.target as HTMLElement).closest('.card-action')) {return;}
            
            if (cardId !== (currentWindowId as unknown as CardId)) {
                vscode.postMessage({ type: 'card:open', cardId });
            }
        });

        // Drag start
        card.addEventListener('dragstart', (e) => {
            draggedCardId = cardId;
            card.classList.add('dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        // Drag end
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            draggedCardId = null;
            document.querySelectorAll('.cards').forEach((el) => el.classList.remove('drag-over'));
        });
    });

    // Card action buttons
    document.querySelectorAll('.edit-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = (btn as HTMLElement).dataset.cardId as CardId;
            vscode.postMessage({ type: 'card:edit', cardId });
        });
    });

    document.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = (btn as HTMLElement).dataset.cardId as CardId;
            vscode.postMessage({ type: 'card:confirmDelete', cardId });
        });
    });

    document.querySelectorAll('.archive-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = (btn as HTMLElement).dataset.cardId as CardId;
            vscode.postMessage({ type: 'card:archive', cardId });
        });
    });

    document.querySelectorAll('.restore-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = (btn as HTMLElement).dataset.cardId as CardId;
            vscode.postMessage({ type: 'card:restore', cardId });
        });
    });

    document.querySelectorAll('.clear-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = (btn as HTMLElement).dataset.cardId as CardId;
            vscode.postMessage({ type: 'notification:clear', cardId });
        });
    });

    // Drop zones
    document.querySelectorAll('.cards').forEach((dropZone) => {
        const zone = dropZone as HTMLElement;
        const columnId = zone.dataset.columnId as ColumnId;

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            if (draggedCardId && columnId) {
                const cardsInColumn = state?.cards.filter((c) => c.columnId === columnId) ?? [];
                vscode.postMessage({
                    type: 'card:move',
                    cardId: draggedCardId,
                    toColumnId: columnId,
                    toOrder: cardsInColumn.length,
                });
            }
        });
    });

    // Column collapse
    document.querySelectorAll('.column-collapse').forEach((btn) => {
        btn.addEventListener('click', () => {
            const columnId = (btn as HTMLElement).dataset.columnId as ColumnId;
            vscode.postMessage({ type: 'column:toggleCollapse', columnId });
        });
    });

    // Column edit
    document.querySelectorAll('.edit-column-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const columnId = (btn as HTMLElement).dataset.columnId as ColumnId;
            vscode.postMessage({ type: 'column:rename', columnId });
        });
    });

    // Column delete
    document.querySelectorAll('.delete-column-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const columnId = (btn as HTMLElement).dataset.columnId as ColumnId;
            vscode.postMessage({ type: 'column:delete', columnId });
        });
    });
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showError(message: string): void {
    console.error('[KanVis]', message);
    // Could show a toast notification here
}

