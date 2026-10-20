import { describe, expect, it } from 'vitest';
import { ProjectService, UserError } from '../src/main/services/projects';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { needsReview } from '../src/shared/review';
import { DAY } from '../src/shared/time';
import { tempDir } from './helpers';

const NOW = Date.UTC(2026, 9, 20, 12);

async function setup() {
  const store = await SqliteStore.open(await tempDir());
  let now = NOW;
  const service = new ProjectService(store, () => now);
  return { service, store, advance: (ms: number) => (now += ms) };
}

describe('ProjectService weekly review', () => {
  it('"keep going" records project_reviewed and the project stops looking cold', async () => {
    const { service, store, advance } = await setup();
    const p = await service.create({ title: 'Synth', status: 'active', worldIds: [], path: null });
    advance(45 * DAY);
    expect(needsReview(service.summary(p.id), NOW + 45 * DAY)).toBe(true);

    const kept = await service.reviewKeep(p.id);
    expect(kept.lastActivityAt).toBe(NOW + 45 * DAY);
    expect(kept.status).toBe('active');
    expect(needsReview(kept, NOW + 45 * DAY)).toBe(false);
    expect(store.listEvents(p.id)[0]).toMatchObject({
      type: 'project_reviewed',
      projectId: p.id,
    });
  });

  it('refuses archived projects', async () => {
    const { service } = await setup();
    const p = await service.create({ title: 'Old', status: 'active', worldIds: [], path: null });
    await service.archive(p.id);
    await expect(service.reviewKeep(p.id)).rejects.toBeInstanceOf(UserError);
  });

  it('finishing the review stores when it happened', async () => {
    const { service, advance } = await setup();
    advance(DAY);
    const settings = await service.finishReview();
    expect(settings.lastReviewAt).toBe(NOW + DAY);
    expect(service.bootstrap().settings.lastReviewAt).toBe(NOW + DAY);
  });
});
