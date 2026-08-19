/**
 * Workspace response normalization tests (M0.3): the flat backend snapshot
 * (report section 9) must normalize into lookup maps.
 */

import { describe, expect, it } from 'vitest';
import { normalizeWorkspace } from './normalize';
import type { WorkspaceSnapshot } from './api';

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    document: {
      id: 'doc-1',
      project_id: 'proj-1',
      title: 'Chapter 1',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    text_versions: [
      {
        id: 'tv-en',
        document_id: 'doc-1',
        language_tag: 'en',
        label: 'English',
        content: 'Hello',
        content_hash: 'h1',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tv-de',
        document_id: 'doc-1',
        language_tag: 'de',
        label: 'German',
        content: 'Hallo',
        content_hash: 'h2',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    spans: [
      {
        id: 'sp-1',
        text_version_id: 'tv-en',
        start_offset: 0,
        end_offset: 5,
        exact_text: 'Hello',
        prefix: '',
        suffix: '',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    alignment_groups: [
      {
        id: 'grp-1',
        document_id: 'doc-1',
        note: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    alignment_members: [
      {
        id: 'mem-1',
        alignment_group_id: 'grp-1',
        span_id: 'sp-1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

describe('normalizeWorkspace', () => {
  it('keeps versions in deterministic server order and indexes by id', () => {
    const normalized = normalizeWorkspace(snapshot());
    expect(normalized.document.id).toBe('doc-1');
    expect(normalized.textVersions.map((v) => v.id)).toEqual(['tv-en', 'tv-de']);
    expect(normalized.versionsById['tv-de']).toBe(normalized.textVersions[1]);
  });

  it('indexes spans by id and groups them by text version', () => {
    const normalized = normalizeWorkspace(snapshot());
    expect(normalized.spansById['sp-1'].exact_text).toBe('Hello');
    expect(normalized.spansByVersion['tv-en']).toHaveLength(1);
    expect(normalized.spansByVersion['tv-de'] ?? []).toHaveLength(0);
  });

  it('indexes alignment groups and members by group', () => {
    const normalized = normalizeWorkspace(snapshot());
    expect(normalized.groupsById['grp-1'].id).toBe('grp-1');
    expect(normalized.membersByGroup['grp-1'].map((m) => m.span_id)).toEqual(['sp-1']);
  });

  it('indexes alignment members by span (M0.4 run membership lookup)', () => {
    const normalized = normalizeWorkspace(snapshot());
    expect(normalized.membersBySpan['sp-1'].map((m) => m.alignment_group_id)).toEqual(['grp-1']);
    expect(normalized.membersBySpan['sp-missing'] ?? []).toEqual([]);
  });

  it('normalizes an empty snapshot without throwing', () => {
    const empty = snapshot({
      text_versions: [],
      spans: [],
      alignment_groups: [],
      alignment_members: [],
    });
    const normalized = normalizeWorkspace(empty);
    expect(normalized.textVersions).toEqual([]);
    expect(normalized.spansByVersion).toEqual({});
    expect(normalized.membersByGroup).toEqual({});
    expect(normalized.membersBySpan).toEqual({});
  });
});
