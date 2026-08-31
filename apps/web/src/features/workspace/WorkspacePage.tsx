/**
 * Document workspace: M0 semantics with M1 presentation/interaction hierarchy.
 * Canonical text rendering, selection, registry and connector routing remain
 * owned by their existing frozen modules.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeleteTextVersion, useWorkspace, type TextVersion } from './api';
import { normalizeWorkspace } from './normalize';
import { segmentText } from '../../shared/text/segmentation';
import type { RunDescriptor } from '../../shared/text/types';
import { RenderedSpanRegistry } from '../../shared/rendering/spanRegistry';
import { TextPanel } from './TextPanel';
import { AlignmentTray } from './AlignmentTray';
import { ConnectorOverlay } from './ConnectorOverlay';
import { ImportPanel } from './ImportPanel';
import {
  useCreateAlignment,
  pendingToMemberInput,
} from '../alignments/api';
import { AlignmentInspector } from '../alignments/AlignmentInspector';
import { SavedAlignments } from '../alignments/SavedAlignments';
import { WorkspaceProvider } from './state/WorkspaceProvider';
import { useWorkspaceState } from './state/workspaceContext';
import { isApiError } from '../../shared/api/errors';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { Button } from '../../shared/ui/Button';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Toolbar } from '../../shared/ui/Toolbar';
import { useWorkspaceKeyboard } from './useWorkspaceKeyboard';

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
  spanRegistry,
  survivingGroupIds,
}: {
  documentId: string;
  versionsById: Record<string, TextVersion>;
  runsByVersion: Record<string, RunDescriptor[]>;
  savedAlignments: {
    groups: ReturnType<typeof normalizeWorkspace>['alignmentGroups'];
    groupsById: ReturnType<typeof normalizeWorkspace>['groupsById'];
    membersByGroup: ReturnType<typeof normalizeWorkspace>['membersByGroup'];
    spansById: ReturnType<typeof normalizeWorkspace>['spansById'];
    versionsById: ReturnType<typeof normalizeWorkspace>['versionsById'];
  };
  createMutation: ReturnType<typeof useCreateAlignment>;
  spanRegistry: RenderedSpanRegistry;
  survivingGroupIds: ReadonlySet<string>;
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
    hoveredAlignmentId,
    activeAlignmentId,
    setHoveredAlignment,
    setActiveAlignment,
    isMutatingAlignment,
  } = useWorkspaceState();
  const deleteMutation = useDeleteTextVersion(documentId);
  const [pendingForceDelete, setPendingForceDelete] =
    useState<PendingForceDelete | null>(null);

  // Frozen M0.6 precedence: active wins over hovered.
  const effectiveAlignmentId = activeAlignmentId ?? hoveredAlignmentId;

  // Frontend UX mirror only; backend remains authoritative.
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
        onSuccess: () => {
          // Ephemeral tray becomes persisted state only after server success.
          clearPendingTray();
        },
      },
    );
  }

  useWorkspaceKeyboard({
    clearSelection,
    onCreateAlignment: handleCreateAlignment,
    canCreateAlignment,
    isCreatingAlignment: createMutation.isPending,
  });

  const visible = panelOrder.filter((id) => visiblePanels.includes(id));
  const hidden = panelOrder.filter((id) => !visiblePanels.includes(id));
  const indexOf = (id: string) => panelOrder.indexOf(id);
  const lastIndex = panelOrder.length - 1;

  // Existing connector invalidation contract: panel order/visibility changes
  // must invalidate geometry even when container dimensions are unchanged.
  const layoutKey = `${panelOrder.join('|')}#${visiblePanels.join('|')}`;

  function requestDelete(versionId: string, label: string) {
    deleteMutation.mutate(
      { versionId, force: false },
      {
        onError: (error) => {
          if (isApiError(error) && error.isCode('TEXT_HAS_ANNOTATIONS')) {
            setPendingForceDelete({ versionId, label });
          }
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
      {(deleteMutation.isError || createMutation.isError) ? (
        <div className="workspace-feedback-stack" aria-label="Workspace errors">
          {deleteMutation.isError ? (
            <ErrorMessage error={deleteMutation.error} />
          ) : null}
          {createMutation.isError ? (
            <ErrorMessage error={createMutation.error} />
          ) : null}
        </div>
      ) : null}

      {hidden.length > 0 ? (
        <Toolbar
          label="Hidden panels"
          className="hidden-panels workspace-toolbar"
          density="compact"
        >
          <span className="toolbar-label">Hidden text versions</span>
          {hidden.map((id) => (
            <Button
              key={id}
              type="button"
              variant="quiet"
              size="sm"
              className="reopen-button"
              onClick={() => openPanel(id)}
            >
              Open {versionsById[id]?.label ?? id}
            </Button>
          ))}
        </Toolbar>
      ) : null}

      <div className="workspace-section-heading">
        <div>
          <p className="section-kicker">Text workspace</p>
          <h3>Aligned text versions</h3>
          <p>Drag-select canonical text, then stage the selection from its panel.</p>
        </div>
        <span className="workspace-panel-count">
          {visible.length} open / {panelOrder.length} total
        </span>
      </div>

      <div className="panels-container">
        {visible.length === 0 ? (
          <EmptyState>
            No panels open. Add a text version or open one from the hidden list.
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
                <Toolbar
                  label="Panel controls"
                  className="panel-controls"
                  density="compact"
                >
                  <span className="panel-controls-label">Panel</span>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    disabled={index <= 0}
                    aria-label={`Move ${version.label} left`}
                    onClick={() => reorderPanels(index, index - 1)}
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    disabled={index >= lastIndex}
                    aria-label={`Move ${version.label} right`}
                    onClick={() => reorderPanels(index, index + 1)}
                  >
                    →
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    aria-label={`Delete ${version.label}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => requestDelete(version.id, version.label)}
                  >
                    Delete
                  </Button>
                </Toolbar>
                <TextPanel
                  version={version}
                  runs={runsByVersion[id] ?? []}
                  onHide={() => hidePanel(id)}
                  spanRegistry={spanRegistry}
                  survivingGroupIds={survivingGroupIds}
                />
              </div>
            );
          })
        )}

        <ConnectorOverlay
          alignmentId={effectiveAlignmentId}
          membersByGroup={savedAlignments.membersByGroup}
          registry={spanRegistry}
          layoutKey={layoutKey}
        />
      </div>

      <div className="workbench-stack" aria-label="Alignment workflow">
        <AlignmentTray
          members={pendingMembers}
          versionsById={versionsById}
          onRemove={removePendingMember}
          onClear={clearPendingTray}
          canCreate={canCreateAlignment}
          onCreate={handleCreateAlignment}
          isCreating={createMutation.isPending}
        />

        <AlignmentInspector
          documentId={documentId}
          activeAlignmentId={activeAlignmentId}
          groupsById={savedAlignments.groupsById}
          membersByGroup={savedAlignments.membersByGroup}
          spansById={savedAlignments.spansById}
          versionsById={savedAlignments.versionsById}
          onClose={() => setActiveAlignment(null)}
        />

        <SavedAlignments
          groups={savedAlignments.groups}
          membersByGroup={savedAlignments.membersByGroup}
          spansById={savedAlignments.spansById}
          versionsById={savedAlignments.versionsById}
          onActivate={setActiveAlignment}
          onHover={setHoveredAlignment}
          disabled={isMutatingAlignment}
        />

        <ImportPanel documentId={documentId} />
      </div>

      {pendingForceDelete ? (
        <ConfirmDialog
          headingId="force-delete-heading"
          onClose={() => setPendingForceDelete(null)}
          closeDisabled={deleteMutation.isPending}
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
            <Button
              type="button"
              variant="secondary"
              disabled={deleteMutation.isPending}
              onClick={() => setPendingForceDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              className="danger"
              disabled={deleteMutation.isPending}
              onClick={confirmForceDelete}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

export function WorkspacePage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  return <DocumentWorkspacePage key={documentId} documentId={documentId} />;
}

function DocumentWorkspacePage({ documentId }: { documentId: string }) {
  const workspaceQuery = useWorkspace(documentId);
  const createMutation = useCreateAlignment(documentId);

  const normalized = useMemo(
    () => (workspaceQuery.data ? normalizeWorkspace(workspaceQuery.data) : null),
    [workspaceQuery.data],
  );

  // One registry per document workspace; remount on documentId change.
  const spanRegistry = useMemo(() => new RenderedSpanRegistry(), []);

  // Frozen M0 boundary segmentation: canonical content + persisted Span
  // boundaries -> flat runs. This is rendering segmentation, not linguistics.
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
      <section className="workspace-page page-stack" aria-labelledby="workspace-loading-heading">
        <PageHeader
          eyebrow="Document workspace"
          title="Workspace"
          titleId="workspace-loading-heading"
          description="Loading document context and canonical text versions."
        />
        <LoadingMessage>Loading workspace…</LoadingMessage>
      </section>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <section className="workspace-page page-stack" aria-labelledby="workspace-error-heading">
        <PageHeader
          eyebrow="Document workspace"
          title="Workspace unavailable"
          titleId="workspace-error-heading"
          description="The workspace could not be loaded. No local alignment state was changed."
        />
        <ErrorMessage error={workspaceQuery.error} />
        <Link className="back-link" to="/projects">Back to projects</Link>
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
  const serverAlignmentGroupIds = normalized.alignmentGroups.map(
    (group) => group.id,
  );

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/projects">Projects</Link>
      <span aria-hidden="true">/</span>
      <span>{normalized.document.title}</span>
    </nav>
  );

  return (
    <WorkspaceProvider
      documentId={documentId}
      serverVersions={serverVersions}
      serverAlignmentGroupIds={serverAlignmentGroupIds}
      isCreatingAlignment={createMutation.isPending}
    >
      <section className="workspace-page page-stack" aria-labelledby="workspace-heading">
        <PageHeader
          eyebrow="Document workspace"
          title={`Workspace — ${normalized.document.title}`}
          titleId="workspace-heading"
          description="Select canonical spans, stage them in the tray, then create and inspect persistent alignments."
          breadcrumb={breadcrumb}
        />
        {workspaceQuery.isFetching ? (
          <div className="workspace-refresh-status">
            <LoadingMessage>Refreshing…</LoadingMessage>
          </div>
        ) : null}
        <WorkspaceBody
          documentId={documentId}
          versionsById={normalized.versionsById}
          runsByVersion={runsByVersion}
          savedAlignments={{
            groups: normalized.alignmentGroups,
            groupsById: normalized.groupsById,
            membersByGroup: normalized.membersByGroup,
            spansById: normalized.spansById,
            versionsById: normalized.versionsById,
          }}
          createMutation={createMutation}
          spanRegistry={spanRegistry}
          survivingGroupIds={new Set(serverAlignmentGroupIds)}
        />
      </section>
    </WorkspaceProvider>
  );
}
