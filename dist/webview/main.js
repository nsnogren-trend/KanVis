"use strict";
(() => {
  // src/ui/webview/main.ts
  var vscode = acquireVsCodeApi();
  var state = null;
  var currentWindowId = null;
  var draggedCardId = null;
  var searchQuery = "";
  var matchingCardIds = [];
  var canUndo = false;
  var canRedo = false;
  document.addEventListener("DOMContentLoaded", () => {
    const savedState = vscode.getState();
    if (savedState) {
      state = savedState.state;
      currentWindowId = savedState.currentWindowId;
      renderBoard();
    }
    vscode.postMessage({ type: "ready" });
    setupKeyboardShortcuts();
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "state:update":
        state = message.state;
        currentWindowId = message.currentWindowId;
        vscode.setState({ state, currentWindowId });
        renderBoard();
        break;
      case "history:update":
        canUndo = message.canUndo;
        canRedo = message.canRedo;
        updateToolbar();
        break;
      case "search:results":
        matchingCardIds = message.matchingCardIds;
        searchQuery = message.query;
        renderBoard();
        break;
      case "error":
        showError(message.message);
        break;
    }
  });
  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        vscode.postMessage({ type: "history:undo" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        vscode.postMessage({ type: "history:redo" });
      }
      if (e.key === "Escape") {
        const searchInput = document.getElementById("searchInput");
        if (searchInput && searchInput.value) {
          searchInput.value = "";
          vscode.postMessage({ type: "search:clear" });
        }
      }
    });
  }
  function renderBoard() {
    const app = document.getElementById("app");
    if (!app) {
      return;
    }
    if (!state || state.cards.length === 0) {
      app.innerHTML = `
            <div class="toolbar">
                ${renderToolbar()}
            </div>
            <div class="empty-message">
                <div class="empty-icon">\u{1F4CB}</div>
                <div class="empty-title">No workspaces tracked yet</div>
                <div class="empty-subtitle">Open workspace folders to see them here</div>
            </div>
        `;
      attachToolbarListeners();
      return;
    }
    const sortedColumns = [...state.columns].sort((a, b) => a.order - b.order);
    const visibleCards = state.cards.filter((card) => {
      if (card.isArchived && !state?.settings.showArchivedCards) {
        return false;
      }
      if (!card.isOpen && !state?.settings.showClosedWindows) {
        return false;
      }
      if (searchQuery && !matchingCardIds.includes(card.id)) {
        return false;
      }
      return true;
    });
    let html = `<div class="toolbar">${renderToolbar()}</div>`;
    html += '<div class="board">';
    for (const column of sortedColumns) {
      const cardsInColumn = visibleCards.filter((card) => card.columnId === column.id).sort((a, b) => {
        const sortBy = state?.settings.sortBy ?? "order";
        const dir = state?.settings.sortDirection === "desc" ? -1 : 1;
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "lastActive":
            return (a.lastActiveAt - b.lastActiveAt) * dir;
          case "createdAt":
            return (a.createdAt - b.createdAt) * dir;
          default:
            return (a.order - b.order) * dir;
        }
      });
      html += renderColumn(column, cardsInColumn);
    }
    html += "</div>";
    app.innerHTML = html;
    attachEventListeners();
    attachToolbarListeners();
  }
  function renderToolbar() {
    return `
        <div class="toolbar-left">
            <button id="refreshBtn" class="toolbar-btn" title="Refresh">\u21BB</button>
            <button id="undoBtn" class="toolbar-btn" title="Undo" ${!canUndo ? "disabled" : ""}>\u21A9</button>
            <button id="redoBtn" class="toolbar-btn" title="Redo" ${!canRedo ? "disabled" : ""}>\u21AA</button>
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
  function renderColumn(column, cards) {
    const isCollapsed = column.isCollapsed ?? false;
    const wipWarning = column.wipLimit && cards.length > column.wipLimit;
    let html = `
        <div class="column ${isCollapsed ? "collapsed" : ""}" data-column-id="${column.id}">
            <div class="column-header" style="${column.color ? `border-top: 3px solid ${column.color}` : ""}">
                <button class="column-collapse" data-column-id="${column.id}">
                    ${isCollapsed ? "\u25B6" : "\u25BC"}
                </button>
                <span class="column-name">${escapeHtml(column.name)}</span>
                <span class="column-count ${wipWarning ? "wip-warning" : ""}">
                    ${cards.length}${column.wipLimit ? `/${column.wipLimit}` : ""}
                </span>
                <div class="column-actions">
                    <button class="column-action edit-column-btn" data-column-id="${column.id}" title="Edit">\u270E</button>
                    <button class="column-action delete-column-btn" data-column-id="${column.id}" title="Delete">\xD7</button>
                </div>
            </div>
    `;
    if (!isCollapsed) {
      html += `<div class="cards" data-column-id="${column.id}">`;
      for (const card of cards) {
        html += renderCard(card);
      }
      html += "</div>";
    }
    html += "</div>";
    return html;
  }
  function renderCard(card) {
    const isCurrent = card.id === currentWindowId;
    const hasNotification = !!card.notification;
    const isSearchMatch = searchQuery && matchingCardIds.includes(card.id);
    const classes = ["card"];
    if (!card.isOpen) {
      classes.push("closed");
    }
    if (isCurrent) {
      classes.push("current");
    }
    if (hasNotification) {
      classes.push("notification");
    }
    if (card.isArchived) {
      classes.push("archived");
    }
    if (isSearchMatch) {
      classes.push("search-match");
    }
    if (state?.settings.compactView) {
      classes.push("compact");
    }
    const colorStyle = card.color ? `border-left: 3px solid ${card.color};` : "";
    let html = `
        <div class="${classes.join(" ")}" data-card-id="${card.id}" draggable="true" style="${colorStyle}">
            <div class="card-actions">
                <button class="card-action edit-btn" data-card-id="${card.id}" title="Edit">\u270E</button>
                ${hasNotification ? `<button class="card-action clear-btn" data-card-id="${card.id}" title="Clear notification">\u2713</button>` : ""}
                ${card.isArchived ? `<button class="card-action restore-btn" data-card-id="${card.id}" title="Restore">\u21A9</button>` : `<button class="card-action archive-btn" data-card-id="${card.id}" title="Archive">\u{1F4E5}</button>`}
                <button class="card-action delete-btn" data-card-id="${card.id}" title="Delete">\xD7</button>
            </div>
            <div class="card-header">
                <span class="card-status ${card.isOpen ? "open" : "closed"}"></span>
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
        const tagHtml = card.tags.map((tagId) => {
          const tag = state.tags.find((t) => t.id === tagId);
          return tag ? `<span class="tag" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>` : "";
        }).filter(Boolean).join("");
        if (tagHtml) {
          html += `<div class="card-tags">${tagHtml}</div>`;
        }
      }
    }
    html += "</div>";
    return html;
  }
  function updateToolbar() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) {
      undoBtn.disabled = !canUndo;
    }
    if (redoBtn) {
      redoBtn.disabled = !canRedo;
    }
  }
  function attachToolbarListeners() {
    const refreshBtn = document.getElementById("refreshBtn");
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    const searchInput = document.getElementById("searchInput");
    const addColumnBtn = document.getElementById("addColumnBtn");
    refreshBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "refresh" });
    });
    undoBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "history:undo" });
    });
    redoBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "history:redo" });
    });
    searchInput?.addEventListener("input", () => {
      const query = searchInput.value.trim();
      if (query) {
        vscode.postMessage({ type: "search:query", query });
      } else {
        vscode.postMessage({ type: "search:clear" });
      }
    });
    addColumnBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "column:create" });
    });
  }
  function attachEventListeners() {
    document.querySelectorAll(".card").forEach((cardEl) => {
      const card = cardEl;
      const cardId = card.dataset.cardId;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-action")) {
          return;
        }
        if (cardId !== currentWindowId) {
          vscode.postMessage({ type: "card:open", cardId });
        }
      });
      card.addEventListener("dragstart", (e) => {
        draggedCardId = cardId;
        card.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
        }
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        draggedCardId = null;
        document.querySelectorAll(".cards").forEach((el) => el.classList.remove("drag-over"));
      });
    });
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        vscode.postMessage({ type: "card:edit", cardId });
      });
    });
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        vscode.postMessage({ type: "card:confirmDelete", cardId });
      });
    });
    document.querySelectorAll(".archive-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        vscode.postMessage({ type: "card:archive", cardId });
      });
    });
    document.querySelectorAll(".restore-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        vscode.postMessage({ type: "card:restore", cardId });
      });
    });
    document.querySelectorAll(".clear-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardId = btn.dataset.cardId;
        vscode.postMessage({ type: "notification:clear", cardId });
      });
    });
    document.querySelectorAll(".cards").forEach((dropZone) => {
      const zone = dropZone;
      const columnId = zone.dataset.columnId;
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        if (draggedCardId && columnId) {
          const cardsInColumn = state?.cards.filter((c) => c.columnId === columnId) ?? [];
          vscode.postMessage({
            type: "card:move",
            cardId: draggedCardId,
            toColumnId: columnId,
            toOrder: cardsInColumn.length
          });
        }
      });
    });
    document.querySelectorAll(".column-collapse").forEach((btn) => {
      btn.addEventListener("click", () => {
        const columnId = btn.dataset.columnId;
        vscode.postMessage({ type: "column:toggleCollapse", columnId });
      });
    });
    document.querySelectorAll(".edit-column-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const columnId = btn.dataset.columnId;
        vscode.postMessage({ type: "column:rename", columnId });
      });
    });
    document.querySelectorAll(".delete-column-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const columnId = btn.dataset.columnId;
        vscode.postMessage({ type: "column:delete", columnId });
      });
    });
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function showError(message) {
    console.error("[KanVis]", message);
  }
})();
//# sourceMappingURL=main.js.map
