"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode8 = __toESM(require("vscode"));

// src/core/StateManager.ts
var vscode3 = __toESM(require("vscode"));

// src/types/index.ts
var SCHEMA_VERSION = 1;
function createCardId(id) {
  return id;
}
function createColumnId(id) {
  return id;
}
function createWindowId(id) {
  return id;
}
var DEFAULT_BOARD_SETTINGS = {
  showArchivedCards: false,
  compactView: false,
  sortBy: "order",
  sortDirection: "asc",
  showClosedWindows: true,
  autoArchiveAfterDays: 0
};
function createDefaultState(currentWindowId) {
  return {
    version: SCHEMA_VERSION,
    cards: [],
    columns: [
      { id: createColumnId("backlog"), name: "Backlog", order: 0 },
      { id: createColumnId("in-progress"), name: "In Progress", order: 1 },
      { id: createColumnId("review"), name: "Review", order: 2 },
      { id: createColumnId("done"), name: "Done", order: 3 }
    ],
    tags: [],
    activeWindowIds: [],
    settings: { ...DEFAULT_BOARD_SETTINGS },
    lastModifiedAt: Date.now(),
    lastModifiedBy: currentWindowId
  };
}

// src/core/StorageService.ts
var vscode = __toESM(require("vscode"));

// src/utils/errors.ts
var kanvisError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "kanvisError";
  }
};
var StorageError = class extends kanvisError {
  constructor(message, details) {
    super(message, "STORAGE_ERROR", details);
    this.name = "StorageError";
  }
};
var CardNotFoundError = class extends kanvisError {
  constructor(cardId) {
    super(`Card not found: ${cardId}`, "CARD_NOT_FOUND", { cardId });
    this.name = "CardNotFoundError";
  }
};
var ColumnNotFoundError = class extends kanvisError {
  constructor(columnId) {
    super(`Column not found: ${columnId}`, "COLUMN_NOT_FOUND", { columnId });
    this.name = "ColumnNotFoundError";
  }
};
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : void 0;
  console.error(`[KanVis] ${context}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

// src/core/StorageService.ts
var MIGRATIONS = {
  // Example migration from version 0 to 1 (initial version)
  // In the future, add migrations here as:
  // 1: (v0State) => ({ ...v0State, version: 1, newField: 'default' }),
};
var StorageService = class _StorageService {
  constructor(context, currentWindowId) {
    this.context = context;
    this.stateUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      _StorageService.STATE_FILE
    );
    this.tempUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      _StorageService.STATE_FILE + _StorageService.TEMP_SUFFIX
    );
    this.currentWindowId = currentWindowId;
  }
  static STATE_FILE = "kanvis-state.json";
  static TEMP_SUFFIX = ".tmp";
  static SAVE_DEBOUNCE_MS = 500;
  stateUri;
  tempUri;
  currentWindowId;
  saveInProgress = false;
  pendingSave = null;
  /**
   * Get the URI of the state file (for file watching)
   */
  getStateUri() {
    return this.stateUri;
  }
  /**
   * Ensure the storage directory exists
   */
  async ensureDirectory() {
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    } catch {
    }
  }
  /**
   * Load state from disk
   */
  async load() {
    try {
      const data = await vscode.workspace.fs.readFile(this.stateUri);
      const content = Buffer.from(data).toString("utf8");
      const parsed = JSON.parse(content);
      const migrated = this.migrateState(parsed);
      return this.validateState(migrated);
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        console.log("[KanVis] No existing state file, creating new state");
      } else {
        logError("Failed to load state", error);
      }
      return createDefaultState(this.currentWindowId);
    }
  }
  saveDebounceTimeout = null;
  /**
   * Save state to disk with debouncing
   */
  async save(state) {
    if (this.saveDebounceTimeout) {
      clearTimeout(this.saveDebounceTimeout);
    }
    return new Promise((resolve, reject) => {
      this.saveDebounceTimeout = setTimeout(async () => {
        try {
          await this.saveImmediate(state);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, _StorageService.SAVE_DEBOUNCE_MS);
    });
  }
  /**
   * Save state to disk immediately (bypassing debounce)
   */
  async saveImmediate(state) {
    if (this.saveInProgress) {
      this.pendingSave = state;
      return;
    }
    this.saveInProgress = true;
    try {
      await this.ensureDirectory();
      await this.atomicWrite(state);
    } catch (error) {
      logError("Failed to save state", error);
      throw new StorageError("Failed to save state", error);
    } finally {
      this.saveInProgress = false;
      if (this.pendingSave) {
        const pending = this.pendingSave;
        this.pendingSave = null;
        await this.saveImmediate(pending);
      }
    }
  }
  /**
   * Perform an atomic write (write to temp file, then rename)
   */
  async atomicWrite(state) {
    state.lastModifiedAt = Date.now();
    state.lastModifiedBy = this.currentWindowId;
    const content = JSON.stringify(state, null, 2);
    const buffer = Buffer.from(content, "utf8");
    await vscode.workspace.fs.writeFile(this.tempUri, buffer);
    try {
      await vscode.workspace.fs.rename(this.tempUri, this.stateUri, {
        overwrite: true
      });
    } catch {
      await vscode.workspace.fs.writeFile(this.stateUri, buffer);
      try {
        await vscode.workspace.fs.delete(this.tempUri);
      } catch {
      }
    }
  }
  /**
   * Migrate state from older versions
   */
  migrateState(state) {
    let currentState = state;
    let version = state.version ?? 0;
    while (version < SCHEMA_VERSION) {
      const migration = MIGRATIONS[version];
      if (migration) {
        console.log(`[KanVis] Migrating state from v${version} to v${version + 1}`);
        currentState = migration(currentState);
      }
      version++;
    }
    currentState.version = SCHEMA_VERSION;
    return currentState;
  }
  /**
   * Validate and normalize state structure
   */
  validateState(state) {
    const defaultState = createDefaultState(this.currentWindowId);
    const cards = Array.isArray(state.cards) ? state.cards : [];
    const columns = Array.isArray(state.columns) ? state.columns : defaultState.columns;
    const tags = Array.isArray(state.tags) ? state.tags : [];
    const activeWindowIds = Array.isArray(state.activeWindowIds) ? state.activeWindowIds : [];
    const normalizedColumns = columns.map((col, index) => {
      if (typeof col === "string") {
        return {
          id: createColumnId(col.toLowerCase().replace(/\s+/g, "-")),
          name: col,
          order: index
        };
      }
      return {
        ...col,
        order: col.order ?? index
      };
    });
    const normalizedCards = cards.map((card) => ({
      ...card,
      // Ensure columnId exists (upgrade from v1 column string)
      columnId: card.columnId ?? createColumnId(
        card.column?.toLowerCase().replace(/\s+/g, "-") ?? "backlog"
      ),
      // Ensure timestamps exist
      createdAt: card.createdAt ?? Date.now(),
      lastActiveAt: card.lastActiveAt ?? card.lastActive ?? Date.now(),
      // Normalize boolean fields
      isOpen: Boolean(card.isOpen),
      isArchived: Boolean(card.isArchived)
    }));
    return {
      version: SCHEMA_VERSION,
      cards: normalizedCards,
      columns: normalizedColumns,
      tags,
      activeWindowIds,
      settings: {
        ...defaultState.settings,
        ...state.settings ?? {}
      },
      lastModifiedAt: state.lastModifiedAt ?? Date.now(),
      lastModifiedBy: state.lastModifiedBy ?? this.currentWindowId
    };
  }
  /**
   * Delete the state file
   */
  async delete() {
    try {
      await vscode.workspace.fs.delete(this.stateUri);
    } catch {
    }
  }
};

// src/core/SyncService.ts
var vscode2 = __toESM(require("vscode"));

// src/utils/debounce.ts
function debounce(func, wait) {
  let timeoutId = null;
  return function(...args) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, wait);
  };
}

// src/core/SyncService.ts
var SyncService = class _SyncService {
  constructor(storageService, eventBus, currentWindowId, onStateLoaded) {
    this.storageService = storageService;
    this.eventBus = eventBus;
    this.currentWindowId = currentWindowId;
    this.onStateLoaded = onStateLoaded;
  }
  static SYNC_DEBOUNCE_MS = 100;
  fileWatcher;
  lastKnownModifiedAt = 0;
  isLoadingState = false;
  disposables = [];
  /**
   * Start watching for state changes from other windows
   */
  start() {
    this.setupFileWatcher();
  }
  /**
   * Set up file watcher for cross-window synchronization
   */
  setupFileWatcher() {
    const stateUri = this.storageService.getStateUri();
    const pattern = new vscode2.RelativePattern(
      vscode2.Uri.joinPath(stateUri, ".."),
      "*.json"
    );
    this.fileWatcher = vscode2.workspace.createFileSystemWatcher(pattern);
    const handleFileChange = debounce(async () => {
      await this.handleExternalChange();
    }, _SyncService.SYNC_DEBOUNCE_MS);
    this.fileWatcher.onDidChange(handleFileChange);
    this.fileWatcher.onDidCreate(handleFileChange);
    this.disposables.push(this.fileWatcher);
  }
  /**
   * Handle external state changes (from other windows)
   */
  async handleExternalChange() {
    if (this.isLoadingState) {
      return;
    }
    try {
      this.isLoadingState = true;
      const diskState = await this.storageService.load();
      if (diskState.lastModifiedAt > this.lastKnownModifiedAt && diskState.lastModifiedBy !== this.currentWindowId) {
        console.log(
          `[KanVis] External state change detected from window ${diskState.lastModifiedBy}`
        );
        this.lastKnownModifiedAt = diskState.lastModifiedAt;
        this.onStateLoaded(diskState);
        this.eventBus.emit({ type: "state:synced", state: diskState });
      }
    } catch (error) {
      logError("Failed to handle external state change", error);
    } finally {
      this.isLoadingState = false;
    }
  }
  /**
   * Update the last known modified timestamp after saving
   */
  updateLastModified(timestamp) {
    this.lastKnownModifiedAt = timestamp;
  }
  /**
   * Force a sync with disk state
   */
  async forceSync() {
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
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.fileWatcher = void 0;
  }
};

// src/utils/hash.ts
var crypto = __toESM(require("crypto"));
function shortHash(input) {
  return crypto.createHash("md5").update(input).digest("hex").substring(0, 12);
}
function uuid() {
  return crypto.randomUUID();
}
function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes2 = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes2[i] % chars.length];
  }
  return result;
}
function generateNonce() {
  return randomString(32);
}

// src/core/StateManager.ts
var MAX_HISTORY_SIZE = 50;
var StateManager = class {
  state;
  storageService;
  syncService;
  eventBus;
  currentWindowId;
  disposables = [];
  // History for undo/redo
  history = [];
  historyIndex = -1;
  isUndoRedo = false;
  // Event emitter for UI updates
  onStateChangeEmitter = new vscode3.EventEmitter();
  onStateChange = this.onStateChangeEmitter.event;
  constructor(context, currentWindowId, eventBus) {
    this.currentWindowId = currentWindowId;
    this.eventBus = eventBus;
    this.state = createDefaultState(currentWindowId);
    this.storageService = new StorageService(context, currentWindowId);
    this.syncService = new SyncService(
      this.storageService,
      this.eventBus,
      this.currentWindowId,
      (state) => this.handleExternalStateChange(state)
    );
    this.disposables.push(this.onStateChangeEmitter);
  }
  /**
   * Initialize the state manager
   */
  async initialize() {
    this.state = await this.storageService.load();
    this.eventBus.emit({ type: "state:loaded", state: this.state });
    this.syncService.start();
    this.disposables.push(this.syncService);
    this.onStateChangeEmitter.fire(this.state);
  }
  /**
   * Handle state changes from other windows
   */
  handleExternalStateChange(newState) {
    this.state = newState;
    this.onStateChangeEmitter.fire(this.state);
  }
  /**
   * Get the current state
   */
  getState() {
    return this.state;
  }
  /**
   * Get the current window ID
   */
  getCurrentWindowId() {
    return this.currentWindowId;
  }
  // =========================================================================
  // Card Operations
  // =========================================================================
  /**
   * Create a new card
   */
  async createCard(data) {
    const columnId = data.columnId ?? this.state.columns[0]?.id ?? createColumnId("backlog");
    const cardsInColumn = this.state.cards.filter((c) => c.columnId === columnId);
    const card = {
      id: data.id,
      name: data.name,
      path: data.path,
      columnId,
      order: cardsInColumn.length,
      branch: data.branch,
      isOpen: true,
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
      columnHistory: [
        {
          columnId,
          enteredAt: Date.now()
        }
      ]
    };
    this.recordHistory("card:created", `Created card "${card.name}"`, { cards: [...this.state.cards] });
    this.state.cards.push(card);
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:created", card });
    return card;
  }
  /**
   * Get a card by ID
   */
  getCard(cardId) {
    return this.state.cards.find((c) => c.id === cardId);
  }
  /**
   * Update a card's properties
   */
  async updateCard(cardId, updates) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    this.recordHistory("card:updated", `Updated card "${card.name}"`, {
      cards: this.state.cards.map((c) => ({ ...c }))
    });
    Object.assign(card, updates);
    card.lastActiveAt = Date.now();
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:updated", cardId, updates });
    return card;
  }
  /**
   * Move a card to a different column and/or position
   */
  async moveCard(cardId, toColumnId, toOrder) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    const fromColumnId = card.columnId;
    const isColumnChange = fromColumnId !== toColumnId;
    this.recordHistory("card:moved", `Moved card "${card.name}"`, {
      cards: this.state.cards.map((c) => ({ ...c }))
    });
    if (isColumnChange) {
      if (card.columnHistory && card.columnHistory.length > 0) {
        const lastEntry = card.columnHistory[card.columnHistory.length - 1];
        if (!lastEntry.leftAt) {
          lastEntry.leftAt = Date.now();
        }
      }
      card.columnHistory = card.columnHistory ?? [];
      card.columnHistory.push({
        columnId: toColumnId,
        enteredAt: Date.now()
      });
    }
    card.columnId = toColumnId;
    card.order = toOrder;
    card.lastActiveAt = Date.now();
    const cardsInTargetColumn = this.state.cards.filter((c) => c.columnId === toColumnId && c.id !== cardId).sort((a, b) => a.order - b.order);
    cardsInTargetColumn.forEach((c, index) => {
      c.order = index >= toOrder ? index + 1 : index;
    });
    if (isColumnChange) {
      const cardsInSourceColumn = this.state.cards.filter((c) => c.columnId === fromColumnId).sort((a, b) => a.order - b.order);
      cardsInSourceColumn.forEach((c, index) => {
        c.order = index;
      });
    }
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:moved", cardId, fromColumnId, toColumnId, order: toOrder });
    return card;
  }
  /**
   * Delete a card
   */
  async deleteCard(cardId) {
    const cardIndex = this.state.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      return;
    }
    const card = this.state.cards[cardIndex];
    this.recordHistory("card:deleted", `Deleted card "${card.name}"`, {
      cards: [...this.state.cards]
    });
    this.state.cards.splice(cardIndex, 1);
    const cardsInColumn = this.state.cards.filter((c) => c.columnId === card.columnId).sort((a, b) => a.order - b.order);
    cardsInColumn.forEach((c, index) => {
      c.order = index;
    });
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:deleted", cardId });
  }
  /**
   * Archive a card
   */
  async archiveCard(cardId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    this.recordHistory("card:archived", `Archived card "${card.name}"`, {
      cards: this.state.cards.map((c) => ({ ...c }))
    });
    card.isArchived = true;
    card.archivedAt = Date.now();
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:archived", cardId });
    return card;
  }
  /**
   * Restore an archived card
   */
  async restoreCard(cardId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    this.recordHistory("card:restored", `Restored card "${card.name}"`, {
      cards: this.state.cards.map((c) => ({ ...c }))
    });
    card.isArchived = false;
    card.archivedAt = void 0;
    await this.saveAndNotify();
    this.eventBus.emit({ type: "card:restored", cardId });
    return card;
  }
  // =========================================================================
  // Notification Operations
  // =========================================================================
  /**
   * Set a notification on a card
   */
  async setNotification(cardId, message, fromWindowId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    card.notification = {
      message,
      createdAt: Date.now(),
      fromWindowId
    };
    await this.saveAndNotify();
    this.eventBus.emit({ type: "notification:sent", cardId, message });
  }
  /**
   * Clear notification from a card
   */
  async clearNotification(cardId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      return;
    }
    card.notification = void 0;
    await this.saveAndNotify();
    this.eventBus.emit({ type: "notification:cleared", cardId });
  }
  // =========================================================================
  // Column Operations
  // =========================================================================
  /**
   * Create a new column
   */
  async createColumn(name, color) {
    const id = createColumnId(uuid());
    const column = {
      id,
      name,
      order: this.state.columns.length,
      color
    };
    this.recordHistory("column:created", `Created column "${name}"`, {
      columns: [...this.state.columns]
    });
    this.state.columns.push(column);
    await this.saveAndNotify();
    this.eventBus.emit({ type: "column:created", column });
    return column;
  }
  /**
   * Update a column
   */
  async updateColumn(columnId, updates) {
    const column = this.state.columns.find((c) => c.id === columnId);
    if (!column) {
      throw new ColumnNotFoundError(columnId);
    }
    this.recordHistory("column:updated", `Updated column "${column.name}"`, {
      columns: this.state.columns.map((c) => ({ ...c }))
    });
    Object.assign(column, updates);
    await this.saveAndNotify();
    this.eventBus.emit({ type: "column:updated", columnId, updates });
    return column;
  }
  /**
   * Delete a column (moves all cards to first column)
   */
  async deleteColumn(columnId) {
    const columnIndex = this.state.columns.findIndex((c) => c.id === columnId);
    if (columnIndex === -1) {
      return;
    }
    if (this.state.columns.length <= 1) {
      throw new Error("Cannot delete the last column");
    }
    const column = this.state.columns[columnIndex];
    this.recordHistory("column:deleted", `Deleted column "${column.name}"`, {
      columns: [...this.state.columns],
      cards: this.state.cards.map((c) => ({ ...c }))
    });
    const targetColumn = this.state.columns.find((c) => c.id !== columnId);
    const cardsToMove = this.state.cards.filter((c) => c.columnId === columnId);
    const existingCardsInTarget = this.state.cards.filter((c) => c.columnId === targetColumn.id);
    cardsToMove.forEach((card, index) => {
      card.columnId = targetColumn.id;
      card.order = existingCardsInTarget.length + index;
    });
    this.state.columns.splice(columnIndex, 1);
    this.state.columns.forEach((c, index) => {
      c.order = index;
    });
    await this.saveAndNotify();
    this.eventBus.emit({ type: "column:deleted", columnId });
  }
  /**
   * Reorder a column
   */
  async reorderColumn(columnId, newOrder) {
    const column = this.state.columns.find((c) => c.id === columnId);
    if (!column) {
      throw new ColumnNotFoundError(columnId);
    }
    this.recordHistory("column:reordered", `Reordered column "${column.name}"`, {
      columns: this.state.columns.map((c) => ({ ...c }))
    });
    const oldOrder = column.order;
    this.state.columns.forEach((c) => {
      if (c.id === columnId) {
        c.order = newOrder;
      } else if (oldOrder < newOrder && c.order > oldOrder && c.order <= newOrder) {
        c.order--;
      } else if (oldOrder > newOrder && c.order >= newOrder && c.order < oldOrder) {
        c.order++;
      }
    });
    await this.saveAndNotify();
    this.eventBus.emit({ type: "column:reordered", columnId, newOrder });
  }
  // =========================================================================
  // Tag Operations
  // =========================================================================
  /**
   * Create a new tag
   */
  async createTag(name, color) {
    const tag = {
      id: uuid(),
      name,
      color
    };
    this.state.tags.push(tag);
    await this.saveAndNotify();
    this.eventBus.emit({ type: "tag:created", tag });
    return tag;
  }
  /**
   * Delete a tag (removes from all cards)
   */
  async deleteTag(tagId) {
    const tagIndex = this.state.tags.findIndex((t) => t.id === tagId);
    if (tagIndex === -1) {
      return;
    }
    this.state.tags.splice(tagIndex, 1);
    this.state.cards.forEach((card) => {
      if (card.tags) {
        card.tags = card.tags.filter((t) => t !== tagId);
      }
    });
    await this.saveAndNotify();
    this.eventBus.emit({ type: "tag:deleted", tagId });
  }
  /**
   * Add a tag to a card
   */
  async addTagToCard(cardId, tagId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new CardNotFoundError(cardId);
    }
    card.tags = card.tags ?? [];
    if (!card.tags.includes(tagId)) {
      card.tags.push(tagId);
      await this.saveAndNotify();
    }
  }
  /**
   * Remove a tag from a card
   */
  async removeTagFromCard(cardId, tagId) {
    const card = this.state.cards.find((c) => c.id === cardId);
    if (!card || !card.tags) {
      return;
    }
    card.tags = card.tags.filter((t) => t !== tagId);
    await this.saveAndNotify();
  }
  // =========================================================================
  // Window Operations
  // =========================================================================
  /**
   * Register a window as active
   */
  async registerWindow(windowId) {
    if (!this.state.activeWindowIds.includes(windowId)) {
      this.state.activeWindowIds.push(windowId);
    }
    const card = this.state.cards.find((c) => c.id === windowId);
    if (card) {
      card.isOpen = true;
      card.lastActiveAt = Date.now();
      card.lastPingAt = Date.now();
    }
    await this.saveAndNotify();
    this.eventBus.emit({ type: "window:opened", windowId });
  }
  /**
   * Unregister a window (mark as inactive)
   */
  async unregisterWindow(windowId) {
    this.state.activeWindowIds = this.state.activeWindowIds.filter((id) => id !== windowId);
    const card = this.state.cards.find((c) => c.id === windowId);
    if (card) {
      card.isOpen = false;
      card.lastActiveAt = Date.now();
      card.lastPingAt = 0;
    }
    await this.saveAndNotify();
    this.eventBus.emit({ type: "window:closed", windowId });
  }
  /**
   * Sync isOpen status based on heartbeat (4 second timeout)
   */
  syncWindowStatus() {
    const PING_TIMEOUT_MS = 4e3;
    const now = Date.now();
    for (const card of this.state.cards) {
      const lastPing = card.lastPingAt ?? 0;
      card.isOpen = now - lastPing < PING_TIMEOUT_MS;
    }
  }
  /**
   * Send a heartbeat ping for the current window
   */
  async pingWindow(windowId) {
    const card = this.state.cards.find((c) => c.id === windowId);
    if (card) {
      card.lastPingAt = Date.now();
      card.isOpen = true;
      await this.saveAndNotify();
    }
  }
  // =========================================================================
  // Settings Operations
  // =========================================================================
  /**
   * Update board settings
   */
  async updateSettings(updates) {
    this.state.settings = { ...this.state.settings, ...updates };
    await this.saveAndNotify();
    this.eventBus.emit({ type: "settings:updated", settings: updates });
  }
  // =========================================================================
  // History Operations (Undo/Redo)
  // =========================================================================
  /**
   * Record an action for undo/redo
   */
  recordHistory(type, description, previousState) {
    if (this.isUndoRedo) {
      return;
    }
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    const action = {
      id: uuid(),
      type,
      timestamp: Date.now(),
      description,
      previousState,
      nextState: {}
      // Will be populated after the action
    };
    this.history.push(action);
    this.historyIndex = this.history.length - 1;
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.shift();
      this.historyIndex--;
    }
  }
  /**
   * Check if undo is available
   */
  canUndo() {
    return this.historyIndex >= 0;
  }
  /**
   * Check if redo is available
   */
  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }
  /**
   * Get undo description
   */
  getUndoDescription() {
    if (!this.canUndo()) {
      return void 0;
    }
    return this.history[this.historyIndex]?.description;
  }
  /**
   * Get redo description
   */
  getRedoDescription() {
    if (!this.canRedo()) {
      return void 0;
    }
    return this.history[this.historyIndex + 1]?.description;
  }
  /**
   * Undo the last action
   */
  async undo() {
    if (!this.canUndo()) {
      return false;
    }
    this.isUndoRedo = true;
    try {
      const action = this.history[this.historyIndex];
      if (action.previousState.cards) {
        this.state.cards = action.previousState.cards;
      }
      if (action.previousState.columns) {
        this.state.columns = action.previousState.columns;
      }
      if (action.previousState.tags) {
        this.state.tags = action.previousState.tags;
      }
      this.historyIndex--;
      await this.saveAndNotify();
      return true;
    } finally {
      this.isUndoRedo = false;
    }
  }
  /**
   * Redo the last undone action
   */
  async redo() {
    if (!this.canRedo()) {
      return false;
    }
    this.isUndoRedo = true;
    try {
      this.historyIndex++;
      const action = this.history[this.historyIndex];
      if (action.nextState.cards) {
        this.state.cards = action.nextState.cards;
      }
      if (action.nextState.columns) {
        this.state.columns = action.nextState.columns;
      }
      await this.saveAndNotify();
      return true;
    } finally {
      this.isUndoRedo = false;
    }
  }
  // =========================================================================
  // Bulk Operations
  // =========================================================================
  /**
   * Clear all cards
   */
  async clearAllCards() {
    this.recordHistory("cards:cleared", "Cleared all cards", {
      cards: [...this.state.cards]
    });
    this.state.cards = [];
    this.state.activeWindowIds = [];
    await this.saveAndNotify();
  }
  // =========================================================================
  // Internal Helpers
  // =========================================================================
  /**
   * Save state and notify listeners
   */
  async saveAndNotify() {
    try {
      await this.storageService.save(this.state);
      this.syncService.updateLastModified(this.state.lastModifiedAt);
    } catch (error) {
      logError("Failed to save state", error);
    }
    this.onStateChangeEmitter.fire(this.state);
  }
  /**
   * Dispose of resources
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
};

// src/core/EventBus.ts
var EventBus = class {
  listeners = /* @__PURE__ */ new Map();
  /**
   * Subscribe to an event type
   * @returns A dispose function to unsubscribe
   */
  on(eventType, listener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, /* @__PURE__ */ new Set());
    }
    const listeners = this.listeners.get(eventType);
    const wrappedListener = listener;
    listeners.add(wrappedListener);
    return () => {
      listeners.delete(wrappedListener);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }
  /**
   * Subscribe to an event type, but only fire once
   * @returns A dispose function to unsubscribe (if needed before the event fires)
   */
  once(eventType, listener) {
    const dispose = this.on(eventType, (event) => {
      dispose();
      listener(event);
    });
    return dispose;
  }
  /**
   * Emit an event to all listeners
   */
  emit(event) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`[EventBus] Error in listener for ${event.type}:`, error);
        }
      }
    }
  }
  /**
   * Remove all listeners for a specific event type
   */
  removeAllListeners(eventType) {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }
  /**
   * Get the number of listeners for a specific event type
   */
  listenerCount(eventType) {
    return this.listeners.get(eventType)?.size ?? 0;
  }
  /**
   * Dispose of the event bus
   */
  dispose() {
    this.listeners.clear();
  }
};
var globalEventBus = null;
function getEventBus() {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

// src/services/GitService.ts
var vscode4 = __toESM(require("vscode"));
var Deferred = class {
  promise;
  resolve;
  reject;
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
};
var GitService = class _GitService {
  static INIT_TIMEOUT_MS = 2e3;
  api = null;
  ready = new Deferred();
  isReady = false;
  disposables = [];
  branchChangeCallbacks = /* @__PURE__ */ new Map();
  /**
   * Initialize the git service (non-blocking)
   */
  async initialize() {
    try {
      const gitExtension = vscode4.extensions.getExtension("vscode.git");
      if (!gitExtension) {
        console.log("[KanVis] Git extension not found");
        this.ready.resolve();
        return;
      }
      const exports2 = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
      this.api = exports2.getAPI(1);
      this.isReady = true;
      this.ready.resolve();
      this.setupListeners();
      console.log("[KanVis] Git service initialized with", this.api.repositories.length, "repositories");
    } catch (error) {
      logError("Failed to initialize git service", error);
      this.ready.resolve();
    }
  }
  /**
   * Set up listeners for git repository changes
   */
  setupListeners() {
    if (!this.api) {
      return;
    }
    this.disposables.push(
      this.api.onDidOpenRepository((repo) => {
        console.log("[KanVis] Git repository opened:", repo.rootUri.fsPath);
        this.notifyBranchChange(repo);
        this.watchRepository(repo);
      })
    );
    for (const repo of this.api.repositories) {
      this.watchRepository(repo);
    }
  }
  /**
   * Watch a repository for branch changes
   */
  watchRepository(repo) {
    this.disposables.push(
      repo.state.onDidChange(() => {
        this.notifyBranchChange(repo);
      })
    );
  }
  /**
   * Notify listeners of branch change for a repository
   */
  notifyBranchChange(repo) {
    const path2 = repo.rootUri.fsPath.toLowerCase();
    const callbacks = this.branchChangeCallbacks.get(path2);
    if (callbacks) {
      const branch = repo.state.HEAD?.name;
      for (const callback of callbacks) {
        try {
          callback(branch);
        } catch (error) {
          logError("Error in branch change callback", error);
        }
      }
    }
  }
  /**
   * Wait for the service to be ready (with timeout)
   */
  async waitForReady() {
    if (this.isReady) {
      return true;
    }
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve(false), _GitService.INIT_TIMEOUT_MS);
    });
    const ready = this.ready.promise.then(() => true);
    return Promise.race([ready, timeout]);
  }
  /**
   * Get the current branch for a folder path
   */
  async getBranch(folderPath) {
    await this.waitForReady();
    if (!this.api) {
      return void 0;
    }
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
  onBranchChange(folderPath, callback) {
    const normalizedPath = folderPath.toLowerCase();
    if (!this.branchChangeCallbacks.has(normalizedPath)) {
      this.branchChangeCallbacks.set(normalizedPath, /* @__PURE__ */ new Set());
    }
    const callbacks = this.branchChangeCallbacks.get(normalizedPath);
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
  getRepositories() {
    return this.api?.repositories ?? [];
  }
  /**
   * Dispose of resources
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.branchChangeCallbacks.clear();
  }
};

// src/services/WindowTracker.ts
var vscode5 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var WindowTracker = class _WindowTracker {
  constructor(stateManager2, gitService2) {
    this.stateManager = stateManager2;
    this.gitService = gitService2;
    this.currentWindowId = this.generateWindowId();
  }
  static PING_INTERVAL_MS = 2e3;
  // 2 seconds
  currentWindowId;
  disposables = [];
  gitBranchDispose = null;
  pingInterval = null;
  /**
   * Initialize the window tracker
   */
  async initialize() {
    await this.registerCurrentWindow();
    this.startHeartbeat();
    this.setupGitBranchWatching();
    this.disposables.push(
      vscode5.workspace.onDidChangeWorkspaceFolders(() => {
        this.handleWorkspaceFoldersChange();
      })
    );
  }
  /**
   * Start the heartbeat ping interval
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(async () => {
      try {
        await this.stateManager.pingWindow(this.currentWindowId);
      } catch (error) {
        logError("Failed to send heartbeat ping", error);
      }
    }, _WindowTracker.PING_INTERVAL_MS);
  }
  /**
   * Stop the heartbeat ping interval
   */
  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  /**
   * Generate a unique ID for the current window based on workspace
   */
  generateWindowId() {
    const workspaceFolders = vscode5.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const folderPath = workspaceFolders[0].uri.fsPath;
      return createWindowId(shortHash(folderPath));
    }
    return createWindowId(shortHash(Date.now().toString() + Math.random().toString()));
  }
  /**
   * Get the current window's ID
   */
  getCurrentWindowId() {
    return this.currentWindowId;
  }
  /**
   * Get the current window's card ID (same as window ID)
   */
  getCurrentCardId() {
    return this.currentWindowId;
  }
  /**
   * Register the current window in the state
   */
  async registerCurrentWindow() {
    const workspaceFolders = vscode5.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      console.log("[KanVis] No workspace folder open, skipping registration");
      return;
    }
    const folderPath = workspaceFolders[0].uri.fsPath;
    const folderName = path.basename(folderPath);
    try {
      const existingCard = this.stateManager.getCard(this.getCurrentCardId());
      if (existingCard) {
        await this.stateManager.updateCard(this.getCurrentCardId(), {
          name: folderName,
          path: folderPath,
          isOpen: true,
          lastActiveAt: Date.now(),
          branch: await this.gitService.getBranch(folderPath)
        });
      } else {
        await this.stateManager.createCard({
          id: this.getCurrentCardId(),
          name: folderName,
          path: folderPath,
          branch: await this.gitService.getBranch(folderPath)
        });
      }
      await this.stateManager.registerWindow(this.currentWindowId);
      console.log("[KanVis] Registered window:", folderName);
    } catch (error) {
      logError("Failed to register window", error);
    }
  }
  /**
   * Unregister the current window
   */
  async unregisterCurrentWindow() {
    try {
      await this.stateManager.unregisterWindow(this.currentWindowId);
      console.log("[KanVis] Unregistered window");
    } catch (error) {
      logError("Failed to unregister window", error);
    }
  }
  /**
   * Set up watching for git branch changes
   */
  setupGitBranchWatching() {
    const workspaceFolders = vscode5.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }
    const folderPath = workspaceFolders[0].uri.fsPath;
    if (this.gitBranchDispose) {
      this.gitBranchDispose();
    }
    this.gitBranchDispose = this.gitService.onBranchChange(folderPath, async (branch) => {
      try {
        await this.stateManager.updateCard(this.getCurrentCardId(), { branch });
        console.log("[KanVis] Branch changed to:", branch);
      } catch {
      }
    });
  }
  /**
   * Handle workspace folder changes
   */
  async handleWorkspaceFoldersChange() {
    const oldWindowId = this.currentWindowId;
    this.currentWindowId = this.generateWindowId();
    if (oldWindowId !== this.currentWindowId) {
      await this.stateManager.unregisterWindow(oldWindowId);
      await this.registerCurrentWindow();
      this.setupGitBranchWatching();
    }
  }
  /**
   * Add a workspace manually (for adding closed workspaces)
   */
  async addWorkspaceManually(folderPath) {
    const folderName = path.basename(folderPath);
    const id = createCardId(shortHash(folderPath));
    if (this.stateManager.getCard(id)) {
      console.log("[KanVis] Workspace already exists:", folderName);
      return;
    }
    await this.stateManager.createCard({
      id,
      name: folderName,
      path: folderPath,
      branch: await this.gitService.getBranch(folderPath)
    });
    await this.stateManager.updateCard(id, { isOpen: false });
    console.log("[KanVis] Added workspace manually:", folderName);
  }
  /**
   * Refresh window status (sync isOpen with activeWindowIds)
   */
  refreshWindowStatus() {
    this.stateManager.syncWindowStatus();
  }
  /**
   * Dispose of resources
   */
  dispose() {
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
};

// src/services/NotificationService.ts
var vscode6 = __toESM(require("vscode"));
var NotificationService = class {
  constructor(stateManager2, currentWindowId) {
    this.stateManager = stateManager2;
    this.currentWindowId = currentWindowId;
    this.setupListeners();
  }
  disposables = [];
  notificationShown = false;
  /**
   * Set up event listeners for notifications
   */
  setupListeners() {
    this.disposables.push(
      this.stateManager.onStateChange((state) => {
        this.checkForNotifications(state);
      })
    );
  }
  /**
   * Check for notifications targeted at this window
   */
  checkForNotifications(state) {
    const card = state.cards.find(
      (c) => c.id === this.currentWindowId
    );
    if (!card?.notification || this.notificationShown) {
      return;
    }
    const message = card.notification.message;
    const fromWindowId = card.notification.fromWindowId;
    let senderName = "Another window";
    if (fromWindowId) {
      const senderCard = state.cards.find((c) => c.id === fromWindowId);
      if (senderCard) {
        senderName = senderCard.name;
      }
    }
    this.notificationShown = true;
    vscode6.window.showInformationMessage(
      `Message from ${senderName}: ${message}`,
      "Dismiss"
    ).then(() => {
      this.clearNotification();
    });
  }
  /**
   * Send a notification to another window
   */
  async sendNotification(targetCardId, message) {
    await this.stateManager.setNotification(targetCardId, message, this.currentWindowId);
  }
  /**
   * Clear notification for this window
   */
  async clearNotification() {
    this.notificationShown = false;
    await this.stateManager.clearNotification(this.currentWindowId);
  }
  /**
   * Check if this window has an active notification
   */
  hasNotification() {
    const state = this.stateManager.getState();
    const card = state.cards.find(
      (c) => c.id === this.currentWindowId
    );
    return !!card?.notification;
  }
  /**
   * Dispose of resources
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
};

// src/ui/BoardViewProvider.ts
var vscode7 = __toESM(require("vscode"));
var BoardViewProvider = class {
  constructor(extensionUri, stateManager2, onEditCard) {
    this.extensionUri = extensionUri;
    this.stateManager = stateManager2;
    this.onEditCard = onEditCard;
    this.disposables.push(
      this.stateManager.onStateChange((state) => {
        this.sendStateUpdate(state);
      })
    );
  }
  static viewType = "kanvis.boardView";
  webviewView;
  disposables = [];
  /**
   * Called when the webview is created
   */
  resolveWebviewView(webviewView, _context, _token) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode7.Uri.joinPath(this.extensionUri, "dist"),
        vscode7.Uri.joinPath(this.extensionUri, "dist", "webview")
      ]
    };
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage(async (message) => {
        await this.handleMessage(message);
      })
    );
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
  async handleMessage(message) {
    try {
      switch (message.type) {
        case "ready":
          this.sendStateUpdate(this.stateManager.getState());
          this.sendHistoryUpdate();
          break;
        case "refresh":
          this.stateManager.syncWindowStatus();
          this.sendStateUpdate(this.stateManager.getState());
          break;
        case "card:open":
          await this.openWindow(message.cardId);
          break;
        case "card:move":
          await this.stateManager.moveCard(message.cardId, message.toColumnId, message.toOrder);
          break;
        case "card:update":
          await this.stateManager.updateCard(message.cardId, message.updates);
          break;
        case "card:confirmDelete":
          const deleteConfirm = await vscode7.window.showWarningMessage(
            "Delete this card?",
            { modal: true },
            "Delete"
          );
          if (deleteConfirm === "Delete") {
            await this.stateManager.deleteCard(message.cardId);
          }
          break;
        case "card:archive":
          await this.stateManager.archiveCard(message.cardId);
          break;
        case "card:restore":
          await this.stateManager.restoreCard(message.cardId);
          break;
        case "card:edit":
          await this.onEditCard(message.cardId);
          break;
        case "column:create": {
          const name = await vscode7.window.showInputBox({
            prompt: "Enter column name",
            placeHolder: "Column name",
            validateInput: (value) => value?.trim() ? null : "Name is required"
          });
          if (name?.trim()) {
            await this.stateManager.createColumn(name.trim());
          }
          break;
        }
        case "column:rename": {
          const col = this.stateManager.getState().columns.find((c) => c.id === message.columnId);
          if (col) {
            const newName = await vscode7.window.showInputBox({
              prompt: "Enter new column name",
              value: col.name,
              validateInput: (value) => value?.trim() ? null : "Name is required"
            });
            if (newName?.trim()) {
              await this.stateManager.updateColumn(message.columnId, { name: newName.trim() });
            }
          }
          break;
        }
        case "column:delete": {
          const delConfirm = await vscode7.window.showWarningMessage(
            "Delete this column? Cards will be moved to the first column.",
            { modal: true },
            "Delete"
          );
          if (delConfirm === "Delete") {
            await this.stateManager.deleteColumn(message.columnId);
          }
          break;
        }
        case "column:reorder":
          await this.stateManager.reorderColumn(message.columnId, message.newOrder);
          break;
        case "column:toggleCollapse":
          const column = this.stateManager.getState().columns.find((c) => c.id === message.columnId);
          if (column) {
            await this.stateManager.updateColumn(message.columnId, {
              isCollapsed: !column.isCollapsed
            });
          }
          break;
        case "notification:send":
          await this.stateManager.setNotification(
            message.cardId,
            message.message,
            this.stateManager.getCurrentWindowId()
          );
          break;
        case "notification:clear":
          await this.stateManager.clearNotification(message.cardId);
          break;
        case "tag:create":
          await this.stateManager.createTag(message.name, message.color);
          break;
        case "tag:delete":
          await this.stateManager.deleteTag(message.tagId);
          break;
        case "card:addTag":
          await this.stateManager.addTagToCard(message.cardId, message.tagId);
          break;
        case "card:removeTag":
          await this.stateManager.removeTagFromCard(message.cardId, message.tagId);
          break;
        case "settings:update":
          await this.stateManager.updateSettings(message.settings);
          break;
        case "history:undo":
          await this.stateManager.undo();
          this.sendHistoryUpdate();
          break;
        case "history:redo":
          await this.stateManager.redo();
          this.sendHistoryUpdate();
          break;
        case "search:query":
          this.handleSearch(message.query);
          break;
        case "search:clear":
          this.sendMessage({ type: "search:results", matchingCardIds: [], query: "" });
          break;
      }
    } catch (error) {
      logError("Error handling webview message", error);
      this.sendMessage({
        type: "error",
        message: error instanceof Error ? error.message : "An error occurred"
      });
    }
  }
  /**
   * Handle search query
   */
  handleSearch(query) {
    const state = this.stateManager.getState();
    const lowerQuery = query.toLowerCase();
    const matchingCardIds = state.cards.filter((card) => {
      return card.name.toLowerCase().includes(lowerQuery) || card.branch?.toLowerCase().includes(lowerQuery) || card.notes?.toLowerCase().includes(lowerQuery) || card.path.toLowerCase().includes(lowerQuery);
    }).map((card) => card.id);
    this.sendMessage({
      type: "search:results",
      matchingCardIds,
      query
    });
  }
  /**
   * Open a window/workspace
   */
  async openWindow(cardId) {
    const state = this.stateManager.getState();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) {
      return;
    }
    const uri = vscode7.Uri.file(card.path);
    if (card.notification) {
      await this.stateManager.clearNotification(cardId);
    }
    await vscode7.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
  }
  /**
   * Send state update to webview
   */
  sendStateUpdate(state) {
    this.stateManager.syncWindowStatus();
    this.sendMessage({
      type: "state:update",
      state,
      currentWindowId: this.stateManager.getCurrentWindowId()
    });
  }
  /**
   * Send history update to webview
   */
  sendHistoryUpdate() {
    this.sendMessage({
      type: "history:update",
      canUndo: this.stateManager.canUndo(),
      canRedo: this.stateManager.canRedo(),
      undoDescription: this.stateManager.getUndoDescription(),
      redoDescription: this.stateManager.getRedoDescription()
    });
  }
  /**
   * Send a message to the webview
   */
  sendMessage(message) {
    if (this.webviewView) {
      this.webviewView.webview.postMessage(message);
    }
  }
  /**
   * Refresh the webview
   */
  refresh() {
    this.sendStateUpdate(this.stateManager.getState());
  }
  /**
   * Get HTML content for the webview
   */
  getHtmlContent(webview) {
    const nonce = generateNonce();
    const scriptUri = webview.asWebviewUri(
      vscode7.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode7.Uri.joinPath(this.extensionUri, "dist", "webview", "styles.css")
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
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
};

// src/extension.ts
var stateManager;
var windowTracker;
var gitService;
var notificationService;
var boardProvider;
async function activate(context) {
  console.log("[KanVis] Activating extension...");
  try {
    const eventBus = getEventBus();
    const currentWindowId = generateCurrentWindowId();
    gitService = new GitService();
    await gitService.initialize();
    stateManager = new StateManager(context, currentWindowId, eventBus);
    await stateManager.initialize();
    windowTracker = new WindowTracker(stateManager, gitService);
    await windowTracker.initialize();
    notificationService = new NotificationService(stateManager, currentWindowId);
    boardProvider = new BoardViewProvider(
      context.extensionUri,
      stateManager,
      editCard
    );
    context.subscriptions.push(
      vscode8.window.registerWebviewViewProvider(
        BoardViewProvider.viewType,
        boardProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );
    registerCommands(context);
    context.subscriptions.push(
      { dispose: () => gitService.dispose() },
      { dispose: () => stateManager.dispose() },
      { dispose: () => windowTracker.dispose() },
      { dispose: () => notificationService.dispose() },
      { dispose: () => boardProvider.dispose() }
    );
    console.log("[KanVis] Extension activated successfully");
  } catch (error) {
    logError("Failed to activate extension", error);
    throw error;
  }
}
async function deactivate() {
  console.log("[KanVis] Deactivating extension...");
  try {
    if (windowTracker) {
      await windowTracker.unregisterCurrentWindow();
    }
  } catch (error) {
    logError("Error during deactivation", error);
  }
}
function generateCurrentWindowId() {
  const workspaceFolders = vscode8.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const folderPath = workspaceFolders[0].uri.fsPath;
    return createWindowId(shortHash(folderPath));
  }
  return createWindowId(shortHash(Date.now().toString() + Math.random().toString()));
}
function registerCommands(context) {
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.openBoard", () => {
      vscode8.commands.executeCommand("kanvis.boardView.focus");
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.refreshBoard", () => {
      windowTracker.refreshWindowStatus();
      boardProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.setWindowStatus", async () => {
      const columns = stateManager.getState().columns;
      const selected = await vscode8.window.showQuickPick(
        columns.map((c) => ({ label: c.name, id: c.id })),
        { placeHolder: "Select a status for this window" }
      );
      if (selected) {
        const cardId = windowTracker.getCurrentCardId();
        await stateManager.moveCard(cardId, selected.id, 0);
        vscode8.window.showInformationMessage(`Window moved to "${selected.label}"`);
      }
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.notifyWindow", async () => {
      const state = stateManager.getState();
      const currentCardId = windowTracker.getCurrentCardId();
      const otherWindows = state.cards.filter(
        (c) => c.id !== currentCardId && !c.isArchived
      );
      if (otherWindows.length === 0) {
        vscode8.window.showInformationMessage("No other windows to notify");
        return;
      }
      const selected = await vscode8.window.showQuickPick(
        otherWindows.map((w) => ({
          label: w.name,
          description: w.branch,
          id: w.id
        })),
        { placeHolder: "Select a window to notify" }
      );
      if (selected) {
        const message = await vscode8.window.showInputBox({
          placeHolder: "Enter notification message",
          prompt: "This message will be shown on the card"
        });
        if (message) {
          await notificationService.sendNotification(selected.id, message);
          vscode8.window.showInformationMessage(`Notification sent to "${selected.label}"`);
        }
      }
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.addWorkspace", async () => {
      const folderUri = await vscode8.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Add to kanvis Board"
      });
      if (folderUri && folderUri.length > 0) {
        await windowTracker.addWorkspaceManually(folderUri[0].fsPath);
        vscode8.window.showInformationMessage(`Added "${folderUri[0].fsPath}" to board`);
      }
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.clearAll", async () => {
      const confirm = await vscode8.window.showWarningMessage(
        "Clear all cards from the board?",
        { modal: true },
        "Yes"
      );
      if (confirm === "Yes") {
        await stateManager.clearAllCards();
        vscode8.window.showInformationMessage("Board cleared");
      }
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.editCard", async () => {
      await editCard(windowTracker.getCurrentCardId());
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.undo", async () => {
      const success = await stateManager.undo();
      if (!success) {
        vscode8.window.showInformationMessage("Nothing to undo");
      }
    })
  );
  context.subscriptions.push(
    vscode8.commands.registerCommand("kanvis.redo", async () => {
      const success = await stateManager.redo();
      if (!success) {
        vscode8.window.showInformationMessage("Nothing to redo");
      }
    })
  );
  registerMoveToColumnCommands(context);
}
function registerMoveToColumnCommands(context) {
  for (let i = 1; i <= 4; i++) {
    context.subscriptions.push(
      vscode8.commands.registerCommand(`kanvis.moveToColumn${i}`, async () => {
        const columns = stateManager.getState().columns;
        const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
        if (i <= sortedColumns.length) {
          const targetColumn = sortedColumns[i - 1];
          const cardId = windowTracker.getCurrentCardId();
          await stateManager.moveCard(cardId, targetColumn.id, 0);
          vscode8.window.showInformationMessage(`Moved to "${targetColumn.name}"`);
        } else {
          vscode8.window.showWarningMessage(`Column ${i} does not exist`);
        }
      })
    );
  }
}
async function editCard(cardId) {
  const state = stateManager.getState();
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) {
    return;
  }
  const editOption = await vscode8.window.showQuickPick(
    [
      { label: "\u{1F4DD} Edit Notes", value: "notes" },
      { label: "\u{1F3A8} Set Color", value: "color" },
      { label: "\u270F\uFE0F Rename", value: "name" },
      { label: "\u{1F3F7}\uFE0F Manage Tags", value: "tags" }
    ],
    { placeHolder: `Edit "${card.name}"` }
  );
  if (!editOption) {
    return;
  }
  switch (editOption.value) {
    case "notes": {
      const notes = await vscode8.window.showInputBox({
        prompt: "Enter notes for this workspace",
        value: card.notes ?? "",
        placeHolder: "e.g., Waiting on code review"
      });
      if (notes !== void 0) {
        await stateManager.updateCard(cardId, { notes: notes || void 0 });
      }
      break;
    }
    case "color": {
      const colors = [
        { label: "\u{1F534} Red", value: "#ef4444" },
        { label: "\u{1F7E0} Orange", value: "#f97316" },
        { label: "\u{1F7E1} Yellow", value: "#eab308" },
        { label: "\u{1F7E2} Green", value: "#22c55e" },
        { label: "\u{1F535} Blue", value: "#3b82f6" },
        { label: "\u{1F7E3} Purple", value: "#a855f7" },
        { label: "\u26AA None (default)", value: "" }
      ];
      const selected = await vscode8.window.showQuickPick(colors, {
        placeHolder: "Select a color for this card"
      });
      if (selected) {
        await stateManager.updateCard(cardId, {
          color: selected.value || void 0
        });
      }
      break;
    }
    case "name": {
      const name = await vscode8.window.showInputBox({
        prompt: "Enter display name for this workspace",
        value: card.name,
        placeHolder: "Display name"
      });
      if (name) {
        await stateManager.updateCard(cardId, { name });
      }
      break;
    }
    case "tags": {
      await editCardTags(cardId);
      break;
    }
  }
}
async function editCardTags(cardId) {
  const state = stateManager.getState();
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) {
    return;
  }
  const action = await vscode8.window.showQuickPick(
    [
      { label: "\u2795 Add Tag", value: "add" },
      { label: "\u2796 Remove Tag", value: "remove" },
      { label: "\u{1F195} Create New Tag", value: "create" }
    ],
    { placeHolder: "Manage tags" }
  );
  if (!action) {
    return;
  }
  switch (action.value) {
    case "add": {
      const availableTags = state.tags.filter(
        (t) => !card.tags?.includes(t.id)
      );
      if (availableTags.length === 0) {
        vscode8.window.showInformationMessage("No tags available to add");
        return;
      }
      const selected = await vscode8.window.showQuickPick(
        availableTags.map((t) => ({ label: t.name, id: t.id })),
        { placeHolder: "Select a tag to add" }
      );
      if (selected) {
        await stateManager.addTagToCard(cardId, selected.id);
      }
      break;
    }
    case "remove": {
      if (!card.tags || card.tags.length === 0) {
        vscode8.window.showInformationMessage("No tags to remove");
        return;
      }
      const cardTags = card.tags.map((id) => state.tags.find((t) => t.id === id)).filter((t) => t !== void 0);
      const selected = await vscode8.window.showQuickPick(
        cardTags.map((t) => ({ label: t.name, id: t.id })),
        { placeHolder: "Select a tag to remove" }
      );
      if (selected) {
        await stateManager.removeTagFromCard(cardId, selected.id);
      }
      break;
    }
    case "create": {
      const name = await vscode8.window.showInputBox({
        prompt: "Enter tag name",
        placeHolder: "Tag name"
      });
      if (!name) {
        return;
      }
      const colors = [
        { label: "\u{1F534} Red", value: "#ef4444" },
        { label: "\u{1F7E0} Orange", value: "#f97316" },
        { label: "\u{1F7E1} Yellow", value: "#eab308" },
        { label: "\u{1F7E2} Green", value: "#22c55e" },
        { label: "\u{1F535} Blue", value: "#3b82f6" },
        { label: "\u{1F7E3} Purple", value: "#a855f7" }
      ];
      const color = await vscode8.window.showQuickPick(colors, {
        placeHolder: "Select tag color"
      });
      if (color) {
        const tag = await stateManager.createTag(name, color.value);
        await stateManager.addTagToCard(cardId, tag.id);
      }
      break;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
