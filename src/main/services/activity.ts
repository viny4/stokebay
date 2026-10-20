import type { ActivityEvent, EventType, Id } from '../../shared/types';
import type { RepositoryTx } from '../store/repository';

/**
 * Records one activity event inside a transaction. Events drive the timeline, resume cards
 * and glow, so payloads hold ids and field names only, never the user's text.
 */
export function recordEvent(
  tx: RepositoryTx,
  type: EventType,
  projectId: Id,
  at: number,
  payload: ActivityEvent['payload'] = {},
): ActivityEvent {
  return tx.addEvent({ type, projectId, payload, createdAt: at });
}
