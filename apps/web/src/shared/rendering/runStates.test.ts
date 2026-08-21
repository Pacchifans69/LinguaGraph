/**
 * Run visual-state classification tests (M0.6 Round 1) — the pure mapping
 * from (run, hovered, active) to the annotation/hover/active visual states
 * (frozen contract sections B, C, D, E, N).
 */

import { describe, expect, it } from 'vitest';
import { computeRunStates, runClassNames } from './runStates';
import type { RunDescriptor } from '../text/types';

function run(alignmentGroupIds: string[]): RunDescriptor {
  return {
    start: 0,
    end: 4,
    text: 'test',
    spanIds: [],
    alignmentGroupIds,
  };
}

describe('computeRunStates', () => {
  it('unaligned runs have no annotation state', () => {
    const states = computeRunStates(run([]), null, null);
    expect(states).toEqual({
      aligned: false,
      ambiguous: false,
      hovered: false,
      active: false,
    });
  });

  it('a run with exactly one group is aligned (idle indicator) but not ambiguous', () => {
    const states = computeRunStates(run(['g1']), null, null);
    expect(states.aligned).toBe(true);
    expect(states.ambiguous).toBe(false);
    expect(states.hovered).toBe(false);
    expect(states.active).toBe(false);
  });

  it('a run with several groups is aligned AND ambiguous', () => {
    const states = computeRunStates(run(['g1', 'g2']), null, null);
    expect(states.aligned).toBe(true);
    expect(states.ambiguous).toBe(true);
  });

  it('hovers every member of the hovered group (counterpart propagation)', () => {
    const member = computeRunStates(run(['g1']), 'g1', null);
    expect(member.hovered).toBe(true);
    const memberOfOtherGroup = computeRunStates(run(['g2']), 'g1', null);
    expect(memberOfOtherGroup.hovered).toBe(false);
    // A run in several groups including the hovered one is a member too.
    const overlapping = computeRunStates(run(['g1', 'g3']), 'g1', null);
    expect(overlapping.hovered).toBe(true);
  });

  it('active styling persists independently of hover', () => {
    const states = computeRunStates(run(['g1']), null, 'g1');
    expect(states.active).toBe(true);
    expect(states.hovered).toBe(false);
  });

  it('active and secondary hover coexist and are distinguishable', () => {
    // Group A is active, group B is hovered: the A-run is active-only, the
    // B-run is hovered-only.
    const runA = computeRunStates(run(['gA']), 'gB', 'gA');
    expect(runA.active).toBe(true);
    expect(runA.hovered).toBe(false);
    const runB = computeRunStates(run(['gB']), 'gB', 'gA');
    expect(runB.active).toBe(false);
    expect(runB.hovered).toBe(true);
  });

  it('a run belonging to both the active and the hovered group reports both', () => {
    const states = computeRunStates(run(['gA', 'gB']), 'gB', 'gA');
    expect(states.active).toBe(true);
    expect(states.hovered).toBe(true);
  });

  it('null hover/active ids never match', () => {
    const states = computeRunStates(run(['g1']), null, null);
    expect(states.hovered).toBe(false);
    expect(states.active).toBe(false);
  });
});

describe('runClassNames', () => {
  it('emits the idle annotation indicator class for aligned runs', () => {
    expect(runClassNames(run(['g1']), null, null)).toBe('run-aligned');
  });

  it('emits the ambiguous class for multi-group runs', () => {
    expect(runClassNames(run(['g1', 'g2']), null, null)).toBe(
      'run-aligned run-ambiguous',
    );
  });

  it('emits hovered class for members of the hovered group', () => {
    expect(runClassNames(run(['g1']), 'g1', null)).toBe('run-aligned run-hovered');
  });

  it('emits active class for members of the active group', () => {
    expect(runClassNames(run(['g1']), null, 'g1')).toBe('run-aligned run-active');
  });

  it('emits both hovered and active classes when a run is in both groups', () => {
    expect(runClassNames(run(['g1', 'g2']), 'g2', 'g1')).toBe(
      'run-aligned run-ambiguous run-hovered run-active',
    );
  });

  it('emits nothing for unaligned runs', () => {
    expect(runClassNames(run([]), 'g1', 'g1')).toBe('');
  });
});
