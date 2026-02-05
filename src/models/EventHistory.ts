/**
 * Event-based state tracking for KanVis
 * Enables undo/redo and provides an audit trail
 */

import { Window } from './Window.js';

export type KanVisEvent = 
  | { kind: 'window_added'; window: Window; timestamp: number }
  | { kind: 'window_removed'; windowId: string; timestamp: number }
  | { kind: 'window_moved'; windowId: string; fromCol: string; toCol: string; fromOrder: number; toOrder: number; timestamp: number }
  | { kind: 'window_updated'; windowId: string; changes: Partial<Window>; timestamp: number };

/**
 * Tracks state changes as events for history/undo functionality
 */
export class EventHistory {
  private events: KanVisEvent[] = [];
  private position: number = -1; // Current position in history
  private maxSize: number;
  
  constructor(maxHistorySize: number = 100) {
    this.maxSize = maxHistorySize;
  }
  
  /**
   * Record a new event (clears any "redo" history)
   */
  recordEvent(event: KanVisEvent): void {
    // Remove any events after current position (they're now invalid)
    this.events = this.events.slice(0, this.position + 1);
    
    // Add new event
    this.events.push(event);
    this.position++;
    
    // Trim to max size if needed
    if (this.events.length > this.maxSize) {
      const excess = this.events.length - this.maxSize;
      this.events = this.events.slice(excess);
      this.position -= excess;
    }
  }
  
  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.position >= 0;
  }
  
  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.position < this.events.length - 1;
  }
  
  /**
   * Get the event to undo (moves position back)
   */
  undo(): KanVisEvent | null {
    if (!this.canUndo()) {
      return null;
    }
    
    const event = this.events[this.position];
    this.position--;
    return event;
  }
  
  /**
   * Get the event to redo (moves position forward)
   */
  redo(): KanVisEvent | null {
    if (!this.canRedo()) {
      return null;
    }
    
    this.position++;
    return this.events[this.position];
  }
  
  /**
   * Get all events up to current position
   */
  getCurrentHistory(): readonly KanVisEvent[] {
    return this.events.slice(0, this.position + 1);
  }
  
  /**
   * Get statistics about the history
   */
  getStats(): { total: number; position: number; canUndo: boolean; canRedo: boolean } {
    return {
      total: this.events.length,
      position: this.position,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.events = [];
    this.position = -1;
  }
}
