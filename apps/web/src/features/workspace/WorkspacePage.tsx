/**
 * Workspace page (M0.3): side-by-side TextPanels for one ParallelDocument.
 *
 * - fetches + normalizes the workspace snapshot (TanStack Query);
 * - owns per-document panel visibility/order via WorkspaceProvider
 *   (persisted to localStorage, reconciled against server versions);
 * - supports panel reorder (local preference only — never PATCHes server
 *   sort_order), hide/reopen, add/import versions, and delete with an
 *   explicit force-delete confirmation warning.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeleteTextVersion, useWorkspace, type TextVersion } from './api';
import { normalizeWorkspace } from './normalize';
import { TextPanel } from './TextPanel';
import { ImportPanel } from './ImportPanel';
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
}: {
  documentId: string;
  versionsById: Record<string, TextVersion>;
}) {
  const { panelOrder, visiblePanels, openPanel, hidePanel, reorderPanels } =
    useWorkspaceState();
  const deleteMutation = useDeleteTextVersion(documentId);
  const [pendingForceDelete, setPendingForceDelete] =
    useState<PendingForceDelete | null>(null);

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
                <TextPanel version={version} onHide={() => hidePanel(id)} />
              </div>
            );
          })
        )}
      </div>

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
  const workspaceQuery = useWorkspace(documentId);

  const normalized = useMemo(
    () => (workspaceQuery.data ? normalizeWorkspace(workspaceQuery.data) : null),
    [workspaceQuery.data],
  );

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

  const serverVersionIds = normalized.textVersions.map((version) => version.id);

  return (
    <WorkspaceProvider documentId={documentId} serverVersionIds={serverVersionIds}>
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
        />
      </section>
    </WorkspaceProvider>
  );
}
