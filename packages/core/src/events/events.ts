import { z } from 'zod';
import { WindowIdSchema, ColumnIdSchema, EventIdSchema, WindowSchema } from '../types/schema.js';

/**
 * Base event schema
 */
export const BaseEventSchema = z.object({
  id: EventIdSchema,
  timestamp: z.number().int().positive(),
  type: z.string(),
});

/**
 * Window events
 */
export const WindowAddedEventSchema = BaseEventSchema.extend({
  type: z.literal('WindowAdded'),
  window: WindowSchema,
});

export const WindowRemovedEventSchema = BaseEventSchema.extend({
  type: z.literal('WindowRemoved'),
  windowId: WindowIdSchema,
});

export const WindowMovedEventSchema = BaseEventSchema.extend({
  type: z.literal('WindowMoved'),
  windowId: WindowIdSchema,
  fromColumnId: ColumnIdSchema,
  toColumnId: ColumnIdSchema,
  toOrder: z.number().int().nonnegative(),
});

export const WindowUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('WindowUpdated'),
  windowId: WindowIdSchema,
  updates: z.object({
    name: z.string().optional(),
    branch: z.string().optional(),
    isOpen: z.boolean().optional(),
    lastActiveAt: z.number().optional(),
  }),
});

/**
 * Column events
 */
export const ColumnAddedEventSchema = BaseEventSchema.extend({
  type: z.literal('ColumnAdded'),
  columnId: ColumnIdSchema,
  name: z.string(),
  order: z.number().int().nonnegative(),
  color: z.string().optional(),
});

export const ColumnRemovedEventSchema = BaseEventSchema.extend({
  type: z.literal('ColumnRemoved'),
  columnId: ColumnIdSchema,
});

export const ColumnUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('ColumnUpdated'),
  columnId: ColumnIdSchema,
  updates: z.object({
    name: z.string().optional(),
    color: z.string().optional(),
  }),
});

/**
 * Union of all events
 */
export const BoardEventSchema = z.discriminatedUnion('type', [
  WindowAddedEventSchema,
  WindowRemovedEventSchema,
  WindowMovedEventSchema,
  WindowUpdatedEventSchema,
  ColumnAddedEventSchema,
  ColumnRemovedEventSchema,
  ColumnUpdatedEventSchema,
]);

export type BoardEvent = z.infer<typeof BoardEventSchema>;
export type WindowAddedEvent = z.infer<typeof WindowAddedEventSchema>;
export type WindowRemovedEvent = z.infer<typeof WindowRemovedEventSchema>;
export type WindowMovedEvent = z.infer<typeof WindowMovedEventSchema>;
export type WindowUpdatedEvent = z.infer<typeof WindowUpdatedEventSchema>;
export type ColumnAddedEvent = z.infer<typeof ColumnAddedEventSchema>;
export type ColumnRemovedEvent = z.infer<typeof ColumnRemovedEventSchema>;
export type ColumnUpdatedEvent = z.infer<typeof ColumnUpdatedEventSchema>;

/**
 * Event store interface
 */
export interface EventStore {
  append(event: BoardEvent): Promise<void>;
  getEvents(fromTimestamp?: number): Promise<BoardEvent[]>;
  getAllEvents(): Promise<BoardEvent[]>;
}

/**
 * In-memory event store implementation
 */
export class MemoryEventStore implements EventStore {
  private events: BoardEvent[] = [];

  async append(event: BoardEvent): Promise<void> {
    this.events.push(event);
  }

  async getEvents(fromTimestamp?: number): Promise<BoardEvent[]> {
    if (fromTimestamp === undefined) {
      return [...this.events];
    }
    return this.events.filter(e => e.timestamp >= fromTimestamp);
  }

  async getAllEvents(): Promise<BoardEvent[]> {
    return [...this.events];
  }

  // For testing
  clear(): void {
    this.events = [];
  }

  size(): number {
    return this.events.length;
  }
}
