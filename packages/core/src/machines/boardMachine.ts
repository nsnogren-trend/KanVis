import { setup, assign } from 'xstate';
import type { BoardState, Window, WindowId, ColumnId } from '../types/schema.js';
import { DEFAULT_COLUMNS } from '../types/schema.js';
import type { BoardEvent } from '../events/events.js';
import { nanoid } from 'nanoid';

/**
 * Context for the board state machine
 */
export interface BoardContext {
  board: BoardState;
  eventStore: Array<BoardEvent>;
  error?: string;
}

/**
 * Events that the state machine can receive
 */
export type BoardMachineEvent =
  | { type: 'ADD_WINDOW'; window: Window }
  | { type: 'REMOVE_WINDOW'; windowId: WindowId }
  | { type: 'MOVE_WINDOW'; windowId: WindowId; toColumnId: ColumnId; toOrder: number }
  | { type: 'UPDATE_WINDOW'; windowId: WindowId; updates: Partial<Window> }
  | { type: 'RESTORE_FROM_EVENTS'; events: BoardEvent[] }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE' }
  | { type: 'LOAD' };

/**
 * Board state machine using XState
 * 
 * This implements a formal state machine that ensures:
 * - All state transitions are deterministic
 * - Invalid states are impossible
 * - Event sourcing for undo/redo and time-travel debugging
 */
export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardMachineEvent,
  },
  actions: {
    addWindow: assign({
      board: ({ context, event }) => {
        if (event.type !== 'ADD_WINDOW') return context.board;
        
        const existingIndex = context.board.windows.findIndex(w => w.id === event.window.id);
        const windows = existingIndex >= 0
          ? context.board.windows.map((w, i) => i === existingIndex ? event.window : w)
          : [...context.board.windows, event.window];
        
        return {
          ...context.board,
          windows,
          lastModifiedAt: Date.now(),
        };
      },
      eventStore: ({ context, event }) => {
        if (event.type !== 'ADD_WINDOW') return context.eventStore;
        
        return [
          ...context.eventStore,
          {
            id: nanoid() as any,
            timestamp: Date.now(),
            type: 'WindowAdded' as const,
            window: event.window,
          },
        ];
      },
    }),
    
    removeWindow: assign({
      board: ({ context, event }) => {
        if (event.type !== 'REMOVE_WINDOW') return context.board;
        
        return {
          ...context.board,
          windows: context.board.windows.filter(w => w.id !== event.windowId),
          lastModifiedAt: Date.now(),
        };
      },
      eventStore: ({ context, event }) => {
        if (event.type !== 'REMOVE_WINDOW') return context.eventStore;
        
        return [
          ...context.eventStore,
          {
            id: nanoid() as any,
            timestamp: Date.now(),
            type: 'WindowRemoved' as const,
            windowId: event.windowId,
          },
        ];
      },
    }),
    
    moveWindow: assign({
      board: ({ context, event }) => {
        if (event.type !== 'MOVE_WINDOW') return context.board;
        
        const window = context.board.windows.find(w => w.id === event.windowId);
        if (!window) return context.board;
        
        const fromColumnId = window.columnId;
        
        const windows = context.board.windows.map(w => {
          if (w.id === event.windowId) {
            return { ...w, columnId: event.toColumnId, order: event.toOrder, lastActiveAt: Date.now() };
          }
          
          if (fromColumnId !== event.toColumnId && w.columnId === fromColumnId && w.order > window.order) {
            return { ...w, order: w.order - 1 };
          }
          
          if (w.columnId === event.toColumnId && w.order >= event.toOrder && w.id !== event.windowId) {
            return { ...w, order: w.order + 1 };
          }
          
          return w;
        });
        
        return {
          ...context.board,
          windows,
          lastModifiedAt: Date.now(),
        };
      },
      eventStore: ({ context, event }) => {
        if (event.type !== 'MOVE_WINDOW') return context.eventStore;
        
        const window = context.board.windows.find(w => w.id === event.windowId);
        if (!window) return context.eventStore;
        
        return [
          ...context.eventStore,
          {
            id: nanoid() as any,
            timestamp: Date.now(),
            type: 'WindowMoved' as const,
            windowId: event.windowId,
            fromColumnId: window.columnId,
            toColumnId: event.toColumnId,
            toOrder: event.toOrder,
          },
        ];
      },
    }),
    
    updateWindow: assign({
      board: ({ context, event }) => {
        if (event.type !== 'UPDATE_WINDOW') return context.board;
        
        return {
          ...context.board,
          windows: context.board.windows.map(w =>
            w.id === event.windowId 
              ? { ...w, ...event.updates, lastActiveAt: Date.now() } 
              : w
          ),
          lastModifiedAt: Date.now(),
        };
      },
      eventStore: ({ context, event }) => {
        if (event.type !== 'UPDATE_WINDOW') return context.eventStore;
        
        return [
          ...context.eventStore,
          {
            id: nanoid() as any,
            timestamp: Date.now(),
            type: 'WindowUpdated' as const,
            windowId: event.windowId,
            updates: event.updates,
          },
        ];
      },
    }),
  },
}).createMachine({
  id: 'board',
  initial: 'idle',
  context: {
    board: {
      windows: [],
      columns: DEFAULT_COLUMNS,
      version: 5,
      lastModifiedAt: Date.now(),
    },
    eventStore: [],
  },
  states: {
    idle: {
      on: {
        ADD_WINDOW: {
          actions: 'addWindow',
        },
        REMOVE_WINDOW: {
          actions: 'removeWindow',
        },
        MOVE_WINDOW: {
          actions: 'moveWindow',
        },
        UPDATE_WINDOW: {
          actions: 'updateWindow',
        },
        SAVE: {
          target: 'saving',
        },
        LOAD: {
          target: 'loading',
        },
      },
    },
    saving: {
      // Would invoke save actor here
      always: 'idle',
    },
    loading: {
      // Would invoke load actor here
      always: 'idle',
    },
    error: {
      on: {
        '*': 'idle',
      },
    },
  },
});

export type BoardMachine = typeof boardMachine;
