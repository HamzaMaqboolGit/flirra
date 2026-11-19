import { AsyncLocalStorage } from 'node:async_hooks';

// Next 15 reads this global when its server modules initialize. Node 26 omits it.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
await import('./index.ts');
