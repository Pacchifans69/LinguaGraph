/**
 * Workspace response normalization (M0.3).
 *
 * The backend returns flat collections (report section 9); the frontend
 * normalizes them into lookup maps so panels, metadata and (future)
 * alignment layers can address entities by id without repeated scans.
 * Version order is the deterministic server order ((sort_order,
 * created_at, id)) — NOT the panel drag order, which is a local preference.
 */

import type {
  AlignmentGroup,
  AlignmentMember,
  TextVersion,
  WorkspaceSnapshot,
  WorkspaceSpan,
} from './api';
import type { ParallelDocument } from '../documents/api';

export interface NormalizedWorkspace {
  document: ParallelDocument;
  /** Versions in deterministic server order. */
  textVersions: TextVersion[];
  versionsById: Record<string, TextVersion>;
  spans: WorkspaceSpan[];
  spansById: Record<string, WorkspaceSpan>;
  spansByVersion: Record<string, WorkspaceSpan[]>;
  alignmentGroups: AlignmentGroup[];
  groupsById: Record<string, AlignmentGroup>;
  alignmentMembers: AlignmentMember[];
  membersByGroup: Record<string, AlignmentMember[]>;
}

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const item of items) {
    map[item.id] = item;
  }
  return map;
}

export function normalizeWorkspace(snapshot: WorkspaceSnapshot): NormalizedWorkspace {
  const textVersions = [...snapshot.text_versions];
  const versionsById = indexById(textVersions);
  const spansById = indexById(snapshot.spans);
  const groupsById = indexById(snapshot.alignment_groups);

  const spansByVersion: Record<string, WorkspaceSpan[]> = {};
  for (const span of snapshot.spans) {
    (spansByVersion[span.text_version_id] ??= []).push(span);
  }

  const membersByGroup: Record<string, AlignmentMember[]> = {};
  for (const member of snapshot.alignment_members) {
    (membersByGroup[member.alignment_group_id] ??= []).push(member);
  }

  return {
    document: snapshot.document,
    textVersions,
    versionsById,
    spans: snapshot.spans,
    spansById,
    spansByVersion,
    alignmentGroups: snapshot.alignment_groups,
    groupsById,
    alignmentMembers: snapshot.alignment_members,
    membersByGroup,
  };
}
