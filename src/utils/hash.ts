/**
 * Hash utility functions
 */

import * as crypto from 'crypto';

/**
 * Generate a short hash from a string (12 characters)
 */
export function shortHash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex').substring(0, 12);
}

/**
 * Generate a UUID v4
 */
export function uuid(): string {
    return crypto.randomUUID();
}

/**
 * Generate a random alphanumeric string of given length
 */
export function randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % chars.length];
    }
    return result;
}

/**
 * Generate a nonce for Content Security Policy
 */
export function generateNonce(): string {
    return randomString(32);
}

