/**
 * Render smoke test: every screen must render its initial (pre-effect) markup without touching
 * browser globals. Catches render-time crashes; effects and network are not exercised here.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../App.js';
import { HistoryScreen } from './History.js';
import { HomeScreen } from './Home.js';
import { ReadinessScreen } from './Readiness.js';
import { SessionScreen } from './Session.js';
import { SettingsScreen } from './Settings.js';
import { VolumeScreen } from './Volume.js';
import { ExerciseCard } from '../components/ExerciseCard.js';
import type { WorkoutExerciseDetail } from '@omega/core';

const noop = () => undefined;

describe('screens render', () => {
  it('home', () => {
    const html = renderToStaticMarkup(<HomeScreen setFromCache={noop} />);
    expect(html).toContain('Start a session');
    expect(html).toContain('Morning readiness');
  });
  it('readiness', () => {
    const html = renderToStaticMarkup(<ReadinessScreen setFromCache={noop} />);
    expect(html).toContain('Bodyweight');
    expect(html).toContain('Rough day');
  });
  it('volume / history / settings', () => {
    expect(renderToStaticMarkup(<VolumeScreen setFromCache={noop} />)).toContain('screen');
    expect(renderToStaticMarkup(<HistoryScreen setFromCache={noop} />)).toContain('screen');
    const settings = renderToStaticMarkup(<SettingsScreen />);
    expect(settings).toContain('Test connection');
    expect(settings).toContain('Add to Home Screen');
  });
  it('session (loading state) and read-only workout', () => {
    expect(renderToStaticMarkup(<SessionScreen id="w1" readOnly={false} />)).toContain('Loading');
    expect(renderToStaticMarkup(<SessionScreen id="w1" readOnly />)).toContain('Loading');
  });
  it('app shell', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('bottomnav');
  });

  it('exercise card shows prescription, flags, notes, previous numbers, rows and controls', () => {
    const ex: WorkoutExerciseDetail = {
      workout_exercise: {
        id: 'we1', workout_id: 'w1', exercise_id: 'e1', order: 1, target_sets: 3, target_rep_low: 15, target_rep_high: 15,
        target_rir: 1, suggested_weight_kg: 5, rest_seconds: 90, notes: null, target_reps_by_set: null, target_tempo: '3-0-3-0', constraint_max_weight_kg: 5,
        last_set_amrap: true, reason: 'first_time', rationale: 'No qualifying history yet. Injury constraint applies: starting at the 5 kg cap.',
        flags: ['constrained'], constraint_notes: ['Rehab phase. Seated only.'], based_on_workout_id: null, is_compromised: false,
      },
      exercise: {
        id: 'e1', name: 'Incline Dumbbell Curl', aliases: [], equipment: 'dumbbell', movement_pattern: 'elbow_flexion', is_unilateral: true,
        lengthened_bias: true, default_rep_low: 10, default_rep_high: 12, default_rir_target: 1, default_rest_seconds: 90,
        weight_increment_kg: 1, uses_bodyweight: false, demo_video_url: null, cues: null, archived: false, created_at: '2026-01-01T00:00:00.000Z',
      },
      prescription: null,
      previous: { workout_id: 'w0', date: '2026-09-03', sets: [
        { set_index: 1, side: 'left', weight_kg: 4, reps: 15, rir: 1, is_warmup: false, is_amrap: false },
        { set_index: 1, side: 'right', weight_kg: 4, reps: 14, rir: 1, is_warmup: false, is_amrap: false },
      ] },
      sets: [{ id: 's1', workout_exercise_id: 'we1', set_index: 1, side: 'left', is_warmup: false, is_amrap: false, weight_kg: 5, reps: 15, rir: 1, tempo: '3-0-3-0', rest_taken_seconds: null, pain_severity: 'niggle', pain_note: 'tingle', media_id: null, completed_at: '2026-09-07T10:00:00.000Z' }],
    };
    const html = renderToStaticMarkup(
      <ExerciseCard ex={ex} extraRows={0} onExtraRows={noop} drafts={{}} onDraft={noop} onLog={async () => null} onPatch={async () => null} onDelete={async () => undefined} readOnly={false} busy={false} />,
    );
    expect(html).toContain('Incline Dumbbell Curl');
    expect(html).toContain('3 × 15–15 @ RIR 1');
    expect(html).toContain('tempo 3-0-3-0');
    expect(html).toContain('Suggested 5 kg');
    expect(html).toContain('first time');
    expect(html).toContain('constrained');
    expect(html).toContain('Rehab phase. Seated only.');
    expect(html).toContain('Last: 4 kg × L 15 / R 14 @ RIR 1');
    expect(html).toContain('niggle');          // logged set shows its pain tag
    expect(html).toContain('1R');              // right side row still open
    expect(html).toContain('aria-label="Log set"');
    expect(html).toContain('Reps in reserve'); // RIR chip row
    expect(html).toContain('+ Add set');
    // read-only: no log button, empty rows greyed
    const ro = renderToStaticMarkup(
      <ExerciseCard ex={ex} extraRows={0} onExtraRows={noop} drafts={{}} onDraft={noop} onLog={async () => null} onPatch={async () => null} onDelete={async () => undefined} readOnly busy={false} />,
    );
    expect(ro).not.toContain('aria-label="Log set"');
    expect(ro).toContain('not logged');
  });
});
