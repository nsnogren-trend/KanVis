/**
 * KanVis 4 Webview Main Script
 */

import type { BoardState } from '../models/Board';
import type { Column } from '../models/Column';
import type { Window } from '../models/Window';

// VS Code API
declare function acquireVsCodeApi(): any;
const vscode = acquireVsCodeApi();

// State
let state: BoardState | null = null;
let currentWindowId: string | null = null;
let draggedWindowId: string | null = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  vscode.postMessage({ type: 'ready' });
});

// Handle messages from extension
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  
  switch (message.type) {
    case 'state':
      state = message.state;
      currentWindowId = message.currentWindowId;
      renderBoard();
      break;
      
    case 'error':
      showError(message.message);
      break;
  }
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });
}

// Render the board
function renderBoard() {
  const boardEl = document.getElementById('board');
  const loadingEl = document.getElementById('loading');
  
  if (!state || !boardEl) {
    return;
  }
  
  loadingEl && (loadingEl.style.display = 'none');
  boardEl.innerHTML = '';
  
  // Render each column
  state.columns
    .sort((a, b) => a.order - b.order)
    .forEach(column => {
      const columnEl = createColumnElement(column);
      boardEl.appendChild(columnEl);
    });
}

// Create a column element
function createColumnElement(column: Column) {
  const columnEl = document.createElement('div');
  columnEl.className = 'column';
  columnEl.dataset.columnId = column.id;
  
  // Column header
  const header = document.createElement('div');
  header.className = 'column-header';
  if (column.color) {
    header.style.borderLeftColor = column.color;
  }
  
  const title = document.createElement('h3');
  title.textContent = column.name;
  header.appendChild(title);
  
  const windows = state?.windows.filter(w => w.columnId === column.id) || [];
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = windows.length.toString();
  header.appendChild(count);
  
  columnEl.appendChild(header);
  
  // Column content (cards)
  const content = document.createElement('div');
  content.className = 'column-content';
  
  windows
    .sort((a, b) => a.order - b.order)
    .forEach(window => {
      const card = createCardElement(window);
      content.appendChild(card);
    });
  
  columnEl.appendChild(content);
  
  // Setup drop zone
  setupDropZone(content, column.id);
  
  return columnEl;
}

// Create a card element
function createCardElement(window: Window) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.windowId = window.id;
  card.draggable = true;
  
  if (window.id === currentWindowId) {
    card.classList.add('current');
  }
  
  if (!window.isOpen) {
    card.classList.add('closed');
  }
  
  if (window.color) {
    card.style.borderLeftColor = window.color;
  }
  
  // Card content
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = window.name;
  card.appendChild(name);
  
  if (window.branch) {
    const branch = document.createElement('div');
    branch.className = 'card-branch';
    branch.textContent = `⎇ ${window.branch}`;
    card.appendChild(branch);
  }
  
  const path = document.createElement('div');
  path.className = 'card-path';
  path.textContent = window.path;
  card.appendChild(path);
  
  // Status indicator
  const status = document.createElement('div');
  status.className = 'card-status';
  status.textContent = window.isOpen ? '●' : '○';
  status.title = window.isOpen ? 'Open' : 'Closed';
  card.appendChild(status);
  
  // Setup drag
  card.addEventListener('dragstart', () => {
    draggedWindowId = window.id;
    card.classList.add('dragging');
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedWindowId = null;
  });
  
  // Click to open window
  card.addEventListener('click', () => {
    if (window.id !== currentWindowId) {
      vscode.postMessage({ 
        type: 'window:open', 
        windowId: window.id 
      });
    }
  });
  
  // Right-click menu
  card.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    // For simplicity, just delete on right-click
    // eslint-disable-next-line no-restricted-globals
    if (confirm('Delete this window from the board?')) {
      vscode.postMessage({ 
        type: 'window:delete', 
        windowId: window.id 
      });
    }
  });
  
  return card;
}

// Setup drop zone for a column
function setupDropZone(columnContent: HTMLElement, columnId: string) {
  columnContent.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    
    if (!draggedWindowId) {return;}
    
    const afterElement = getDragAfterElement(columnContent, e.clientY);
    const dragging = document.querySelector('.dragging');
    
    if (!dragging) {
      return;
    }
    
    if (afterElement === null || afterElement === undefined) {
      columnContent.appendChild(dragging);
    } else {
      columnContent.insertBefore(dragging, afterElement);
    }
  });
  
  columnContent.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    
    if (!draggedWindowId) {
      return;
    }
    
    // Calculate new order
    const cards = [...columnContent.querySelectorAll<HTMLElement>('.card')];
    const newOrder = cards.findIndex(card => card.dataset.windowId === draggedWindowId);
    
    if (newOrder >= 0) {
      vscode.postMessage({
        type: 'window:move',
        windowId: draggedWindowId,
        toColumnId: columnId,
        toOrder: newOrder
      });
    }
  });
}

// Get the element after which to insert dragged item
function getDragAfterElement(container: HTMLElement, y: number): Element | undefined {
  const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
  
  return draggableElements.reduce<{ offset: number; element?: Element }>((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Show error message
function showError(message: string) {
  const boardEl = document.getElementById('board');
  const error = document.createElement('div');
  error.className = 'error';
  error.textContent = `Error: ${message}`;
  boardEl?.prepend(error);
  
  setTimeout(() => error.remove(), 5000);
}
