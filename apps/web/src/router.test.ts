import { describe, expect, it } from 'vitest';
import { matchRoute, normalizeHash } from './router.js';

describe('router', () => {
  it('normalises hashes', () => {
    expect(normalizeHash('')).toBe('/');
    expect(normalizeHash('#')).toBe('/');
    expect(normalizeHash('#/')).toBe('/');
    expect(normalizeHash('#/volume/')).toBe('/volume');
    expect(normalizeHash('#/history?x=1')).toBe('/history');
    expect(normalizeHash('volume')).toBe('/volume');
  });

  it('matches static and parameterised routes', () => {
    expect(matchRoute('#/').name).toBe('home');
    expect(matchRoute('').name).toBe('home');
    expect(matchRoute('#/session/abc-123')).toEqual({ name: 'session', params: { id: 'abc-123' }, path: '/session/abc-123' });
    expect(matchRoute('#/workout/w1').params.id).toBe('w1');
    expect(matchRoute('#/readiness').name).toBe('readiness');
    expect(matchRoute('#/settings').name).toBe('settings');
    expect(matchRoute('#/nope/x/y').name).toBe('not_found');
    expect(matchRoute('#/session').name).toBe('not_found');
  });
});
