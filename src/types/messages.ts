/**
 * Message types for webview <-> extension communication
 */

import { BoardState } from '../models/Board.js';
import { Window } from '../models/Window.js';

// Messages from webview to extension
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'window:open'; windowId: string }
  | { type: 'window:move'; windowId: string; toColumnId: string; toOrder: number }
  | { type: 'window:update'; windowId: string; updates: Partial<Window> }
  | { type: 'window:delete'; windowId: string };

// Messages from extension to webview
export type ExtensionMessage =
  | { type: 'state'; state: BoardState; currentWindowId?: string }
  | { type: 'error'; message: string };
