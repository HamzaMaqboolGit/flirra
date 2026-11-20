// Compatibility exports for existing call sites. The implementation is
// PostgreSQL-backed; this module contains no Redis client or network service.
export { coordination as redis } from './postgres-coordination';
export { rateLimit, RateLimitUnavailableError } from './postgres-rate-limit';
