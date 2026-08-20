/**
 * Workspace page (M0.3 + M0.4): side-by-side TextPanels for one
 * ParallelDocument.
 *
 * - fetches + normalizes the workspace snapshot (TanStack Query);
 * - owns per-document panel visibility/order via WorkspaceProvider
 *   (persisted to localStorage, reconciled against server versions);
 * - M0.4: computes boundary-segmented runs for every panel, hosts the
 *   pending Alignment Tray, and handles Escape (clears the current
 *   selection + native Selection; NEVER the staged tray);
 * - supports panel reorder (local preference only — never PATCHes server
 *   sort_order), hide/reopen, add/import versions, and delete with an
 *   explicit force-delete confirmation warning.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeleteTextVersion, useWorkspace, type TextVersion } from './api';
import { normalizeWorkspace } from './normalize';
import { segmentText } from '../../shared/text/segmentation';
import type { RunDescriptor } from '../../shared/text/types';
import { TextPanel } from './TextPanel';
import { AlignmentTray } from './AlignmentTray';
import { ImportPanel } from './ImportPanel';
import {
  useCreateAlignment,
  pendingToMemberInput,
} from '../alignments/api';
import { SavedAlignments } from '../alignments/SavedAlignments';
import {
  WorkspaceProvider,
} from './state/WorkspaceProvider';
import { useWorkspaceState } from './state/workspaceContext';
import { isApiError } from '../../shared/api/errors';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';

interface PendingForceDelete {
  versionId: string;
  label: string;
}

function WorkspaceBody({
  documentId,
  versionsById,
  runsByVersion,
  savedAlignments,
  createMutation,
}: {
  documentId: string;
  versionsById: Record<string, TextVersion>;
  runsByVersion: Record<string, RunDescriptor[]>;
  savedAlignments: {
    groups: ReturnType<typeof normalizeWorkspace>['alignmentGroups'];
    membersByGroup: ReturnType<typeof normalizeWorkspace>['membersByGroup'];
    spansById: ReturnType<typeof normalizeWorkspace>['spansById'];
    versionsById: ReturnType<typeof normalizeWorkspace>['versionsById'];
  };
  createMutation: ReturnType<typeof useCreateAlignment>;
}) {
  const {
    panelOrder,
    visiblePanels,
    openPanel,
    hidePanel,
    reorderPanels,
    pendingMembers,
    clearSelection,
    removePendingMember,
    clearPendingTray,
  } = useWorkspaceState();
  const deleteMutation = useDeleteTextVersion(documentId);
  const [pendingForceDelete, setPendingForceDelete] =
    useState<PendingForceDelete | null>(null);

  // M0.5 Create Alignment validity (frozen contract section 20): at least 2
  // members AND at least 2 distinct TextVersions. Frontend UX mirror only —
  // the backend validates every invariant authoritatively.
  const canCreateAlignment =
    pendingMembers.length >= 2 &&
    new Set(pendingMembers.map((member) => member.textVersionId)).size >= 2;

  function handleCreateAlignment() {
    if (!canCreateAlignment || createMutation.isPending) {
      return;
    }
    createMutation.mutate(
      { members: pendingMembers.map(pendingToMemberInput) },
      {
        // The successful server mutation is the boundary between ephemeral
        // tray state and persisted state: the tray is cleared ONLY here,
        // never before (frozen contract section 22).
        onSuccess: () => {
          clearPendingTray();
        },
      },
    );
  }

  // Escape: cancels the current selection (and the native browser
  // Selection) only. Already-staged pending tray members are never
  // destroyed by Escape — removal is always explicit.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        clearSelection();
        window.getSelection()?.removeAllRanges();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const visible = panelOrder.filter((id) => visiblePanels.includes(id));
  const hidden = panelOrder.filter((id) => !visiblePanels.includes(id));
  const indexOf = (id: string) => panelOrder.indexOf(id);
  const lastIndex = panelOrder.length - 1;

  function requestDelete(versionId: string, label: string) {
    deleteMutation.mutate(
      { versionId, force: false },
      {
        onError: (error) => {
          if (isApiError(error) && error.isCode('TEXT_HAS_ANNOTATIONS')) {
            // Explicit destructive flow: confirm before force-deleting.
            setPendingForceDelete({ versionId, label });
          }
          // Other errors stay visible via the toolbar ErrorMessage.
        },
      },
    );
  }

  function confirmForceDelete() {
    if (!pendingForceDelete) {
      return;
    }
    deleteMutation.mutate(
      { versionId: pendingForceDelete.versionId, force: true },
      {
        onSettled: () => setPendingForceDelete(null),
      },
    );
  }

  return (
    <div className="workspace">
      {deleteMutation.isError ? (
        <ErrorMessage error={deleteMutation.error} />
      ) : null}
      {createMutation.isError ? (
        <ErrorMessage error={createMutation.error} />
      ) : null}

      {hidden.length > 0 ? (
        <div className="hidden-panels" role="group" aria-label="Hidden panels">
          <span className="toolbar-label">Hidden:</span>
          {hidden.map((id) => (
            <button
              key={id}
              type="button"
              className="reopen-button"
              onClick={() => openPanel(id)}
            >
              Open {versionsById[id]?.label ?? id}
            </button>
          ))}
        </div>
      ) : null}

      <div className="panels-container">
        {visible.length === 0 ? (
          <EmptyState>
            No panels open. Add a text version or open one from the hidden
            list below.
          </EmptyState>
        ) : (
          visible.map((id) => {
            const version = versionsById[id];
            if (!version) {
              return null;
            }
            const index = indexOf(id);
            return (
              <div key={id} className="panel-slot">
                <div className="panel-controls" role="group" aria-label="Panel controls">
                  <button
                    type="button"
                    disabled={index <= 0}
                    aria-label={`Move ${version.label} left`}
                    onClick={() => reorderPanels(index, index - 1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={index >= lastIndex}
                    aria-label={`Move ${version.label} right`}
                    onClick={() => reorderPanels(index, index + 1)}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${version.label}`}
                    onClick={() => requestDelete(version.id, version.label)}
                  >
                    Delete
                  </button>
                </div>
                <TextPanel
                  version={version}
                  runs={runsByVersion[id] ?? []}
                  onHide={() => hidePanel(id)}
                />
              </div>
            );
          })
        )}
      </div>

      <AlignmentTray
        members={pendingMembers}
        versionsById={versionsById}
        onRemove={removePendingMember}
        onClear={clearPendingTray}
        canCreate={canCreateAlignment}
        onCreate={handleCreateAlignment}
        isCreating={createMutation.isPending}
      />

      {/* M0.5: minimal read-only persisted alignment representation,
          derived entirely from the authoritative workspace snapshot. */}
      <SavedAlignments
        groups={savedAlignments.groups}
        membersByGroup={savedAlignments.membersByGroup}
        spansById={savedAlignments.spansById}
        versionsById={savedAlignments.versionsById}
      />

      <ImportPanel documentId={documentId} />

      {pendingForceDelete ? (
        <div className="confirm-dialog-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="force-delete-heading"
          >
            <h3 id="force-delete-heading">Delete text version permanently?</h3>
            <p>
              “{pendingForceDelete.label}” is part of one or more alignments.
              Deleting it will permanently remove its annotations, and any
              alignment group that becomes invalid (for example, a group left
              with members from a single text version) will also be deleted.
              This cannot be undone.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setPendingForceDelete(null)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmForceDelete}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspacePage() {
  const { documentId = '' } = useParams<{ documentId: string }>();

  // Document-scoped inner component (HR-F01): keyed by documentId, so a
  // same-route parameter transition (/documents/doc-A/workspace ->
  // /documents/doc-B/workspace) remounts the WHOLE document workspace
  // subtree — including the create-alignment MutationObserver. A
  // pending/error mutation from doc A can therefore never leak its
  // isPending/frozen/error state into doc B.
  return <DocumentWorkspacePage key={documentId} documentId={documentId} />;
}

function DocumentWorkspacePage({ documentId }: { documentId: string }) {
  const workspaceQuery = useWorkspace(documentId);

  // M0.5 (Gate 2 fix): the create mutation lives at the page level (before
  // any early return — hooks must be unconditional) so the in-flight flag
  // can freeze the pending tray (WorkspaceProvider) while the request is
  // pending: a member staged after the request began must never be silently
  // discarded by the success-path tray clear. HR-F01: this hook's observer
  // is document-scoped because the whole component remounts on documentId
  // change (and the mutation carries a document-scoped mutationKey as
  // defense in depth).
  const createMutation = useCreateAlignment(documentId);

  const normalized = useMemo(
    () => (workspaceQuery.data ? normalizeWorkspace(workspaceQuery.data) : null),
    [workspaceQuery.data],
  );

  // M0.4 boundary segmentation: canonical content + persisted spans +
  // alignment memberships -> flat runs per TextVersion. Recomputed only when
  // the server snapshot changes.
  const runsByVersion = useMemo(() => {
    const map: Record<string, RunDescriptor[]> = {};
    if (!normalized) {
      return map;
    }
    for (const version of normalized.textVersions) {
      map[version.id] = segmentText(
        version.content,
        normalized.spansByVersion[version.id] ?? [],
        (spanId) =>
          (normalized.membersBySpan[spanId] ?? []).map(
            (member) => member.alignment_group_id,
          ),
      );
    }
    return map;
  }, [normalized]);

  if (workspaceQuery.isPending) {
    return (
      <section className="workspace-page">
        <LoadingMessage>Loading workspace…</LoadingMessage>
      </section>
    );
  }
  if (workspaceQuery.isError) {
    return (
      <section className="workspace-page">
        <ErrorMessage error={workspaceQuery.error} />
        <Link to="/projects">Back to projects</Link>
      </section>
    );
  }
  if (!normalized) {
    return null;
  }

  const serverVersions = normalized.textVersions.map((version) => ({
    id: version.id,
    contentHash: version.content_hash,
  }));

  return (
    // No key here: the DocumentWorkspacePage component above is keyed by
    // documentId, so the whole subtree (provider + hooks) already remounts
    // on a document change — ephemeral selection state is cleared and panel
    // preferences re-initialize for the new document.
    <WorkspaceProvider
      documentId={documentId}
      serverVersions={serverVersions}
      isCreatingAlignment={createMutation.isPending}
    >
      <section className="workspace-page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/projects">Projects</Link>
          <span aria-hidden="true"> / </span>
          <span>{normalized.document.title}</span>
        </nav>
        <h2>Workspace — {normalized.document.title}</h2>
        {workspaceQuery.isFetching ? (
          <LoadingMessage>Refreshing…</LoadingMessage>
        ) : null}
        <WorkspaceBody
          documentId={documentId}
          versionsById={normalized.versionsById}
          runsByVersion={runsByVersion}
          savedAlignments={{
            groups: normalized.alignmentGroups,
            membersByGroup: normalized.membersByGroup,
            spansById: normalized.spansById,
            versionsById: normalized.versionsById,
          }}
          createMutation={createMutation}
        />
      </section>
    </WorkspaceProvider>
  );
}
