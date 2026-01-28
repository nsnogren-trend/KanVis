/**
 * EventBus - Typed event system for decoupled communication
 */

import type { KanVisEvent } from '../types/index.js';

/**
 * Event listener function type
 */
export type EventListener<T extends KanVisEvent['type']> = (
    event: Extract<KanVisEvent, { type: T }>
) => void;

// Internal type for storing listeners without strict type checking
type AnyEventListener = (event: KanVisEvent) => void;

/**
 * EventBus provides a typed pub/sub system for kanvis events
 */
export class EventBus {
    private listeners = new Map<string, Set<AnyEventListener>>();

    /**
     * Subscribe to an event type
     * @returns A dispose function to unsubscribe
     */
    on<T extends KanVisEvent['type']>(
        eventType: T,
        listener: EventListener<T>
    ): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        
        const listeners = this.listeners.get(eventType)!;
        const wrappedListener = listener as unknown as AnyEventListener;
        listeners.add(wrappedListener);

        // Return dispose function
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
    once<T extends KanVisEvent['type']>(
        eventType: T,
        listener: EventListener<T>
    ): () => void {
        const dispose = this.on(eventType, (event) => {
            dispose();
            listener(event);
        });
        return dispose;
    }

    /**
     * Emit an event to all listeners
     */
    emit(event: KanVisEvent): void {
        const listeners = this.listeners.get(event.type);
        if (listeners) {
            for (const listener of listeners) {
                try {
                    listener(event as Extract<KanVisEvent, { type: typeof event.type }>);
                } catch (error) {
                    console.error(`[EventBus] Error in listener for ${event.type}:`, error);
                }
            }
        }
    }

    /**
     * Remove all listeners for a specific event type
     */
    removeAllListeners(eventType?: KanVisEvent['type']): void {
        if (eventType) {
            this.listeners.delete(eventType);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Get the number of listeners for a specific event type
     */
    listenerCount(eventType: KanVisEvent['type']): number {
        return this.listeners.get(eventType)?.size ?? 0;
    }

    /**
     * Dispose of the event bus
     */
    dispose(): void {
        this.listeners.clear();
    }
}

/**
 * Singleton instance of the event bus
 */
let globalEventBus: EventBus | null = null;

/**
 * Get the global event bus instance
 */
export function getEventBus(): EventBus {
    if (!globalEventBus) {
        globalEventBus = new EventBus();
    }
    return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export function resetEventBus(): void {
    globalEventBus?.dispose();
    globalEventBus = null;
}

