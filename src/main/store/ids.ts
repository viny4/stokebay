import { monotonicFactory } from 'ulid';

// Monotonic so ids created in the same millisecond still sort in creation order.
const next = monotonicFactory();

export function newId(): string {
  return next();
}
