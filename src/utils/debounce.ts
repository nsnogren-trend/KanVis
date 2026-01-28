/**
 * Debounce utility functions
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func.apply(this, args);
            timeoutId = null;
        }, wait);
    };
}

/**
 * Creates a debounced async function that returns a promise.
 * Only the last call will actually execute; previous calls will resolve
 * with the result of the final execution.
 */
export function debounceAsync<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
    func: T,
    wait: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let pendingPromise: Promise<Awaited<ReturnType<T>>> | null = null;
    let resolve: ((value: Awaited<ReturnType<T>>) => void) | null = null;
    let reject: ((reason: unknown) => void) | null = null;

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        if (!pendingPromise) {
            pendingPromise = new Promise<Awaited<ReturnType<T>>>((res, rej) => {
                resolve = res;
                reject = rej;
            });
        }

        timeoutId = setTimeout(async () => {
            try {
                const result = await func.apply(this, args);
                resolve?.(result as Awaited<ReturnType<T>>);
            } catch (error) {
                reject?.(error);
            } finally {
                pendingPromise = null;
                resolve = null;
                reject = null;
                timeoutId = null;
            }
        }, wait);

        return pendingPromise;
    };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
        const now = Date.now();
        const remaining = wait - (now - lastCall);

        if (remaining <= 0) {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            func.apply(this, args);
        } else if (timeoutId === null) {
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                func.apply(this, args);
            }, remaining);
        }
    };
}

