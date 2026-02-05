import { describe, it, expect } from 'vitest';
import { WindowSchema, ColumnSchema, BoardStateSchema, parseWindow, parseBoard } from '../types/schema.js';

describe('Schema Validation', () => {
  describe('WindowSchema', () => {
    it('should validate a valid window', () => {
      const validWindow = {
        id: 'window-1',
        columnId: 'active',
        order: 0,
        path: '/path/to/project',
        name: 'Project',
        branch: 'main',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      
      const result = WindowSchema.safeParse(validWindow);
      expect(result.success).toBe(true);
    });
    
    it('should reject window with negative order', () => {
      const invalidWindow = {
        id: 'window-1',
        columnId: 'active',
        order: -1,
        path: '/path/to/project',
        name: 'Project',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      
      const result = WindowSchema.safeParse(invalidWindow);
      expect(result.success).toBe(false);
    });
    
    it('should reject window with empty name', () => {
      const invalidWindow = {
        id: 'window-1',
        columnId: 'active',
        order: 0,
        path: '/path/to/project',
        name: '',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      
      const result = WindowSchema.safeParse(invalidWindow);
      expect(result.success).toBe(false);
    });
  });
  
  describe('ColumnSchema', () => {
    it('should validate a valid column', () => {
      const validColumn = {
        id: 'active',
        name: 'Active',
        order: 0,
        color: '#0d6efd',
      };
      
      const result = ColumnSchema.safeParse(validColumn);
      expect(result.success).toBe(true);
    });
    
    it('should reject invalid color format', () => {
      const invalidColumn = {
        id: 'active',
        name: 'Active',
        order: 0,
        color: 'blue',
      };
      
      const result = ColumnSchema.safeParse(invalidColumn);
      expect(result.success).toBe(false);
    });
  });
  
  describe('parseWindow', () => {
    it('should return success for valid window', () => {
      const validWindow = {
        id: 'window-1',
        columnId: 'active',
        order: 0,
        path: '/path/to/project',
        name: 'Project',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      
      const result = parseWindow(validWindow);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('window-1');
      }
    });
    
    it('should return error for invalid window', () => {
      const invalidWindow = {
        id: 'window-1',
        columnId: 'active',
        order: -1,
        path: '/path/to/project',
        name: '',
        isOpen: true,
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      
      const result = parseWindow(invalidWindow);
      expect(result.success).toBe(false);
    });
  });
});
