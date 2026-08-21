/**
 * Run visual-state classification (M0.6 Round 1) — pure helper mapping a
 * RunDescriptor + the workspace hovered/active alignment ids to the CSS
 * visual states of the run element (frozen contract sections B, C, D, E, N).
 *
 * States:
 *
 * - ``aligned``   — the run carries at least one persisted alignment group:
 *                   the IDLE annotation indicator (light presentation only;
 *                   never the whole graph);
 * - ``ambiguous`` — the run carries MORE than one group: an ambiguous
 *                   persisted-alignment target; plain hover must NOT pick a
 *                   group (section F);
 * - ``hovered``   — the run is a member of the currently hovered concrete
 *                   group: counterpart hover styling;
 * - ``active``    — the run is a member of the currently active concrete
 *                   group: persistent active styling.
 *
 * The state model allows active + hover to coexist (section E): the active
 * group keeps its styling while the hovered group receives secondary
 * styling. ``computeRunStates`` therefore reports both independently; the
 * CSS layer (not this function) resolves the visual precedence when a run
 * belongs to both groups.
 */

import type { RunDescriptor } from '../text/types';

export interface RunVisualStates {
  aligned: boolean;
  ambiguous: boolean;
  hovered: boolean;
  active: boolean;
}

export function computeRunStates(
  run: Pick<RunDescriptor, 'alignmentGroupIds'>,
  hoveredAlignmentId: string | null,
  activeAlignmentId: string | null,
): RunVisualStates {
  const groups = run.alignmentGroupIds;
  return {
    aligned: groups.length > 0,
    ambiguous: groups.length > 1,
    hovered:
      hoveredAlignmentId !== null && groups.includes(hoveredAlignmentId),
    active: activeAlignmentId !== null && groups.includes(activeAlignmentId),
  };
}

/**
 * Class names applied to the run element. ``run-aligned`` / ``run-ambiguous``
 * are idle annotation cues; ``run-hovered`` / ``run-active`` are the concrete
 * group states. Ordering matters for CSS cascade: active is declared after
 * hovered so a run belonging to both groups renders as active.
 */
export function runClassNames(
  run: Pick<RunDescriptor, 'alignmentGroupIds'>,
  hoveredAlignmentId: string | null,
  activeAlignmentId: string | null,
): string {
  const states = computeRunStates(run, hoveredAlignmentId, activeAlignmentId);
  const names: string[] = [];
  if (states.aligned) {
    names.push('run-aligned');
  }
  if (states.ambiguous) {
    names.push('run-ambiguous');
  }
  if (states.hovered) {
    names.push('run-hovered');
  }
  if (states.active) {
    names.push('run-active');
  }
  return names.join(' ');
}
