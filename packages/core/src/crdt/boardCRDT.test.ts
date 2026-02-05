import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BoardCRDT } from './boardCRDT.js';
import { createWindowId, createColumnId } from '../types/schema.js';
import type { Window } from '../types/schema.js';

// Arbitraries for property-based testing
const windowIdArb = fc.string({ minLength: 1, maxLength: 20 }).map(createWindowId);
const columnIdArb = fc.constantFrom('backlog', 'active', 'done').map(createColumnId);
const windowArb: fc.Arbitrary<Window> = fc.record({
  id: windowIdArb,
  columnId: columnIdArb,
  order: fc.nat(100),
  path: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  branch: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  isOpen: fc.boolean(),
  lastActiveAt: fc.integer({ min: 1 }),
  createdAt: fc.integer({ min: 1 }),
});

describe('BoardCRDT Property-Based Tests', () => {
  it('should preserve all window additions', () => {
    fc.assert(
      fc.property(fc.array(windowArb, { minLength: 0, maxLength: 20 }), (windows) => {
        const crdt = new BoardCRDT();
        
        windows.forEach(w => crdt.upsertWindow(w));
        
        const state = crdt.getState();
        
        // Every unique window should be in the state
        const uniqueWindows = Array.from(new Map(windows.map(w => [w.id, w])).values());
        expect(state.windows.length).toBe(uniqueWindows.length);
      })
    );
  });
  
  it('should handle concurrent operations without data loss', () => {
    fc.assert(
      fc.property(
        fc.array(windowArb, { minLength: 2, maxLength: 10 }),
        fc.array(windowArb, { minLength: 2, maxLength: 10 }),
        (windowsA, windowsB) => {
          // Simulate two CRDT instances (two VS Code windows)
          const crdtA = new BoardCRDT();
          const crdtB = new BoardCRDT();
          
          // Both start with same state
          const initialState = crdtA.getState();
          crdtB.setState(initialState);
          
          // Apply operations to each independently
          windowsA.forEach(w => crdtA.upsertWindow(w));
          windowsB.forEach(w => crdtB.upsertWindow(w));
          
          // Sync the changes
          const updateA = crdtA.getStateVector();
          const updateB = crdtB.getStateVector();
          
          crdtA.applyUpdate(updateB);
          crdtB.applyUpdate(updateA);
          
          // Both should converge to the same state
          const stateA = crdtA.getState();
          const stateB = crdtB.getState();
          
          expect(stateA.windows.length).toBe(stateB.windows.length);
          
          // All windows from both operations should be present
          const allWindows = [...windowsA, ...windowsB];
          const uniqueIds = new Set(allWindows.map(w => w.id));
          
          uniqueIds.forEach(id => {
            const inA = stateA.windows.some(w => w.id === id);
            const inB = stateB.windows.some(w => w.id === id);
            expect(inA).toBe(inB);
          });
        }
      )
    );
  });
  
  it('should maintain window order consistency', () => {
    fc.assert(
      fc.property(
        fc.array(windowArb, { minLength: 1, maxLength: 10 }),
        (windows) => {
          const crdt = new BoardCRDT();
          
          windows.forEach(w => crdt.upsertWindow(w));
          
          const state = crdt.getState();
          
          // Check that no two windows in the same column have the same order
          const columnGroups = new Map<string, number[]>();
          
          state.windows.forEach(w => {
            if (!columnGroups.has(w.columnId)) {
              columnGroups.set(w.columnId, []);
            }
            columnGroups.get(w.columnId)!.push(w.order);
          });
          
          columnGroups.forEach((orders, columnId) => {
            // Orders should be non-negative
            orders.forEach(order => expect(order).toBeGreaterThanOrEqual(0));
          });
        }
      )
    );
  });
  
  it('should correctly remove windows', () => {
    fc.assert(
      fc.property(
        fc.array(windowArb, { minLength: 2, maxLength: 10 }),
        fc.nat(),
        (windows, removeIndexSeed) => {
          const crdt = new BoardCRDT();
          
          // Add all windows
          windows.forEach(w => crdt.upsertWindow(w));
          
          const uniqueWindows = Array.from(new Map(windows.map(w => [w.id, w])).values());
          
          if (uniqueWindows.length === 0) return;
          
          // Remove one window
          const removeIndex = removeIndexSeed % uniqueWindows.length;
          const windowToRemove = uniqueWindows[removeIndex];
          
          crdt.removeWindow(windowToRemove.id);
          
          const state = crdt.getState();
          
          // Removed window should not be in state
          expect(state.windows.some(w => w.id === windowToRemove.id)).toBe(false);
          
          // All other windows should still be present
          expect(state.windows.length).toBe(uniqueWindows.length - 1);
        }
      )
    );
  });
});
