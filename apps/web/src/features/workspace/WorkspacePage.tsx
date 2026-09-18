/**
 * Document workspace: M0 semantics with M1 presentation/interaction hierarchy.
 * Canonical text rendering, selection, registry and connector routing remain
 * owned by their existing frozen modules.
 *
 * The complete workspace opts out of browser translation. Translation engines
 * rewrite owned text nodes outside React, which invalidates canonical text
 * offsets and can break reconciliation while dynamic alignment UI unmounts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useBlocker } from 'react-router-dom';
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
import { SegmentationPanel } from '../segmentation/SegmentationPanel';
import { TokenSegmentationPanel } from '../segmentation/TokenSegmentationPanel';
import { LemmaAnnotationPanel } from '../lemma/LemmaAnnotationPanel';
import { PosAnnotationPanel } from '../pos/PosAnnotationPanel';
import { WorkbenchTaskNavigation } from './WorkbenchTaskNavigation';
import {
  LINGUISTIC_MODES,
  WORKBENCH_MODE_LABELS,
  nextVisibleTarget,
  sameSessionStatus,
  sessionKey,
  sessionStatusPrecedence,
  sessionVersionId,
  type EditorSessionStatus,
  type WorkbenchMode,
} from './workbenchIa';

/**
 * M6-G2-F04: one TextVersion deletion can destroy several different kinds of
 * mounted unsaved work. The confirmation must name the affected categories
 * instead of claiming a generic "linguistic" loss.
 */
interface PendingDelete {
  versionId: string;
  label: string;
  /** Human-readable unsaved categories this deletion may discard. */
  unsaved: string[];
}

const ALIGNMENT_NOTE_CATEGORY = 'Alignment note';

/**
 * M6-PRR-F01: the document-local TextVersion destructive lifecycle target.
 *
 * It is deliberately NOT `deleteMutation.isPending`: the delete lifecycle
 * begins BEFORE the ordinary request is sent and only ends when the
 * authoritative workspace snapshot no longer contains the target (or the
 * lifecycle terminates). It therefore also spans the ordinary 409 →
 * force-confirmation handoff and the gap between a 204 response and the
 * authoritative workspace refetch/reconciliation.
 */
interface ActiveDeleteTarget {
  versionId: string;
  label: string;
  unsaved: string[];
}

function unsavedSummary(unsaved: readonly string[]): string {
  return unsaved.join(', ');
}

/**
 * M6-PRR-F03 / M6-PRR-F01 (C1.2): the bounded session state of ONE hidden
 * TextVersion, derived from the existing session coordination vocabulary. It
 * exposes no draft content and creates no new authority.
 *
 * The aggregate uses the GLOBAL severity precedence
 * `Conflict > Pending > Error > Unsaved > null` (order-independent), so the
 * badge can never understate a hidden version merely because a milder session
 * happened to be visited last.
 */
function hiddenVersionStatus(
  versionId: string,
  sessionStatuses: Record<string, EditorSessionStatus>,
): string | null {
  return sessionStatusPrecedence(
    LINGUISTIC_MODES.map((mode) => sessionStatuses[sessionKey(versionId, mode)]),
  );
}

function WorkspaceBody({
  documentId,
  versionsById,
  runsByVersion,
  savedAlignments,
  createMutation,
  spanRegistry,
  survivingGroupIds,
  segmentation,
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
  segmentation: {
    layersByVersion: ReturnType<typeof normalizeWorkspace>['segmentationLayersByVersion'];
    layersByVersionAndGranularity: ReturnType<typeof normalizeWorkspace>['segmentationLayersByVersionAndGranularity'];
    segmentsByLayer: ReturnType<typeof normalizeWorkspace>['segmentsByLayer'];
    lemmaAnnotationByTokenSegmentId: ReturnType<typeof normalizeWorkspace>['lemmaAnnotationByTokenSegmentId'];
    posAnnotationByTokenSegmentId: ReturnType<typeof normalizeWorkspace>['posAnnotationByTokenSegmentId'];
  };
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
    useState<PendingDelete | null>(null);
  const [pendingDirtyDelete, setPendingDirtyDelete] =
    useState<PendingDelete | null>(null);
  const [activeDeleteTarget, setActiveDeleteTarget] =
    useState<ActiveDeleteTarget | null>(null);
  /**
   * M6-PRR-F01: whether the active delete target was ever observed in the
   * authoritative panel order. Combined with "no longer present", this makes
   * the lifecycle end on the authoritative snapshot transition rather than on
   * a snapshot that never contained the target.
   */
  const pendingDeleteSeenRef = useRef(false);
  const [activeMode, setActiveMode] = useState<WorkbenchMode>('alignment');
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, EditorSessionStatus>>({});
  const [importOpen, setImportOpen] = useState(false);

  const visible = panelOrder.filter((id) => visiblePanels.includes(id));
  const hidden = panelOrder.filter((id) => !visiblePanels.includes(id));

  useEffect(() => {
    setActiveTargetId((current) => nextVisibleTarget(panelOrder, visiblePanels, current));
  }, [panelOrder, visiblePanels]);

  const reportSessionStatus = useCallback((key: string, status: EditorSessionStatus) => {
    setSessionStatuses((current) =>
      sameSessionStatus(current[key], status) ? current : { ...current, [key]: status },
    );
  }, []);

  const sessionReporters = useMemo(() => {
    const reporters: Record<string, (status: EditorSessionStatus) => void> = {};
    for (const versionId of panelOrder) {
      for (const mode of LINGUISTIC_MODES) {
        const key = sessionKey(versionId, mode);
        reporters[key] = (status) => reportSessionStatus(key, status);
      }
    }
    reporters.alignment = (status) => reportSessionStatus('alignment', status);
    reporters.import = (status) => reportSessionStatus('import', status);
    return reporters;
  }, [panelOrder, reportSessionStatus]);

  useEffect(() => {
    const surviving = new Set(panelOrder);
    setSessionStatuses((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => {
          const versionId = sessionVersionId(key);
          if (versionId === null) return true;
          return surviving.has(versionId);
        }),
      ),
    );
  }, [panelOrder]);

  const anyDirty = Object.values(sessionStatuses).some((status) => status.dirty);
  const anySessionDialogOpen = Object.values(sessionStatuses).some((status) => status.dialogOpen);
  const navigationLocked = anySessionDialogOpen || pendingDirtyDelete !== null || pendingForceDelete !== null;

  /**
   * M6-PRR-F01 (C1.2): the WORKSPACE-OWNED TextVersion destructive lifecycle /
   * dialog lock. Its meaning is exactly "a workspace-owned TextVersion
   * deletion owns interaction", i.e. it spans the dirty-delete warning, the
   * force confirmation and the in-flight ordinary/force request.
   *
   * It deliberately does NOT include `anySessionDialogOpen`: a session's OWN
   * dialog (Alignment Inspector, Sentence/Token editor) must never feed its
   * own freeze back into itself — that would disable the dialog's Cancel and
   * self-deadlock. Every control that can open such a dialog therefore keys
   * its freeze on THIS signal, never on `taskInteractionLocked`.
   */
  const workspaceDestructiveLocked =
    pendingDirtyDelete !== null ||
    pendingForceDelete !== null ||
    activeDeleteTarget !== null;

  /**
   * M6-PRR-F01: the broad task-interaction freeze. While a TextVersion
   * destructive lifecycle is active, no new task-editor draft or task
   * mutation may be started, because the pending authoritative reconciliation
   * can remove the target TextVersion and silently discard that work without
   * the Human ever disposing of it.
   *
   * This is a superset of `navigationLocked`: it also holds across the
   * ordinary 409 → force handoff and across the success → authoritative
   * refetch gap, where `deleteMutation.isPending` is already false.
   */
  const taskInteractionLocked = navigationLocked || activeDeleteTarget !== null;

  /**
   * The lifecycle terminates exactly when the AUTHORITATIVE snapshot no longer
   * contains the target TextVersion. `versionsById` is derived directly from
   * the normalized server snapshot (not from the local panel preference), so
   * "the target is absent from the authoritative version set" IS the
   * reconciliation that may have destroyed the version's work.
   *
   * Success-only: the terminating signal is an authoritative SNAPSHOT, never
   * the mutation settling. A failed delete leaves the version present, so the
   * mutation handlers below release the lock explicitly instead.
   */
  useEffect(() => {
    if (activeDeleteTarget === null) return;
    if (Object.prototype.hasOwnProperty.call(versionsById, activeDeleteTarget.versionId)) {
      pendingDeleteSeenRef.current = true;
      return;
    }
    if (pendingDeleteSeenRef.current) {
      setActiveDeleteTarget(null);
    }
  }, [activeDeleteTarget, versionsById]);

  // Full page unload (refresh / close / external navigation) keeps using the
  // native browser warning; client-side route transitions are handled by the
  // router blocker below.
  useEffect(() => {
    if (!anyDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [anyDirty]);

  /**
   * M6-G2-F10 / M6-G2-F11: every client-side route transition that would leave
   * this document workspace — `Link`, browser Back/Forward and in-app
   * programmatic navigation — is blocked by the router itself while a mounted
   * session owns unsaved work, or while a workspace confirmation is open. A
   * `document`-level click handler could not see Back/Forward, and pairing it
   * with a route blocker would double-prompt the same navigation.
   *
   * Ordinary mode/target switches never change the route, and a clean
   * workspace with no open confirmation never blocks.
   */
  const leaveBlocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) {
      return false;
    }
    return anyDirty || navigationLocked;
  });

  /**
   * M6-G2-F11: an already-open workspace confirmation (session destructive
   * dialog, dirty-delete or force-delete dialog) owns the interaction. The
   * leave is still BLOCKED — never allowed through — but it must not stack a
   * second `aria-modal` on top of that dialog nor tear down its pending
   * feedback. The pending navigation is cancelled instead, leaving the route,
   * the mounted sessions and the original dialog exactly as they were; the
   * Human must dispose of that dialog before a leave can be confirmed.
   */
  const leaveBlocked = leaveBlocker.state === 'blocked';
  const resetLeaveBlocker = leaveBlocker.reset;
  useEffect(() => {
    if (leaveBlocked && navigationLocked) {
      resetLeaveBlocker?.();
    }
  }, [leaveBlocked, navigationLocked, resetLeaveBlocker]);

  // Frozen M0.6 precedence: active wins over hovered.
  const effectiveAlignmentId = activeAlignmentId ?? hoveredAlignmentId;

  // Frontend UX mirror only; backend remains authoritative.
  const canCreateAlignment =
    pendingMembers.length >= 2 &&
    new Set(pendingMembers.map((member) => member.textVersionId)).size >= 2;

  function handleCreateAlignment() {
    if (!canCreateAlignment || createMutation.isPending || taskInteractionLocked) {
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
    navigationLocked: taskInteractionLocked,
  });

  const indexOf = (id: string) => panelOrder.indexOf(id);
  const lastIndex = panelOrder.length - 1;

  // Existing connector invalidation contract: panel order/visibility changes
  // must invalidate geometry even when container dimensions are unchanged.
  const layoutKey = `${panelOrder.join('|')}#${visiblePanels.join('|')}`;

  /**
   * M6-G2-F04 / M6-HSDR-F03: authoritative deletion (`force=true`) removes the
   * TextVersion's alignment members and retains the affected AlignmentGroup
   * whenever its REMAINING members still satisfy the frozen M0 alignment
   * invariants. The active Alignment Inspector's unsaved note draft is mounted
   * state, not persisted authority, so it is only at risk when the deletion
   * would actually invalidate (cascade-delete) the active group.
   *
   * The active group is already authoritative and valid, so removing members
   * cannot newly introduce duplicate span membership, cross-document
   * membership or same-TextVersion overlap. The post-deletion survival
   * conditions are therefore exactly: >= 2 surviving members spanning >= 2
   * distinct TextVersions.
   *
   * This is deliberately NOT a re-implementation of the backend validator. When
   * authoritative member or span identity cannot be resolved it fails
   * conservative: the dirty note stays classified as potentially affected
   * instead of being falsely assured safe.
   */
  function activeAlignmentWouldBeDeletedWithVersion(versionId: string): boolean {
    if (activeAlignmentId === null) {
      return false;
    }
    const members = savedAlignments.membersByGroup[activeAlignmentId] ?? [];
    if (members.length === 0) {
      // No authoritative membership for the active group: it cannot be proven
      // to survive, so the dirty note stays classified as at risk.
      return true;
    }
    const survivingTextVersionIds = new Set<string>();
    let survivingMemberCount = 0;
    for (const member of members) {
      const span = savedAlignments.spansById[member.span_id];
      if (!span) {
        // Unresolved member/span identity: fail conservative.
        return true;
      }
      if (span.text_version_id === versionId) {
        continue;
      }
      survivingMemberCount += 1;
      survivingTextVersionIds.add(span.text_version_id);
    }
    return survivingMemberCount < 2 || survivingTextVersionIds.size < 2;
  }

  /**
   * The unsaved work that this TextVersion's deletion could discard, named by
   * category so the Human sees exactly what is at stake. Import drafts are
   * deliberately excluded: they are owned by the canvas-level Import session
   * and are unaffected by deleting an existing TextVersion.
   */
  function affectedUnsavedWork(versionId: string): string[] {
    const categories: string[] = [];
    for (const mode of LINGUISTIC_MODES) {
      if (sessionStatuses[sessionKey(versionId, mode)]?.dirty) {
        categories.push(WORKBENCH_MODE_LABELS[mode]);
      }
    }
    if (
      sessionStatuses.alignment?.dirty &&
      activeAlignmentWouldBeDeletedWithVersion(versionId)
    ) {
      categories.push(ALIGNMENT_NOTE_CATEGORY);
    }
    return categories;
  }

  function performDelete(versionId: string, label: string, unsaved: string[]) {
    // The lifecycle lock starts BEFORE the request is sent, so a draft created
    // while the mutation is still pending can never be swallowed by this
    // deletion.
    pendingDeleteSeenRef.current = false;
    setActiveDeleteTarget({ versionId, label, unsaved });
    deleteMutation.mutate(
      { versionId, force: false },
      {
        onError: (error) => {
          if (isApiError(error) && error.isCode('TEXT_HAS_ANNOTATIONS')) {
            // The unsaved-work context survives the ordinary -> force
            // confirmation handoff so the destructive dialog keeps naming
            // exactly what is still at risk. The lifecycle lock stays held.
            setPendingForceDelete({ versionId, label, unsaved });
            return;
          }
          setActiveDeleteTarget(null);
        },
      },
    );
  }

  function requestDelete(versionId: string, label: string) {
    if (taskInteractionLocked) {
      return;
    }
    const unsaved = affectedUnsavedWork(versionId);
    if (unsaved.length > 0) {
      setPendingDirtyDelete({ versionId, label, unsaved });
      return;
    }
    performDelete(versionId, label, unsaved);
  }

  function confirmDirtyDelete() {
    if (!pendingDirtyDelete) return;
    const target = pendingDirtyDelete;
    setPendingDirtyDelete(null);
    performDelete(target.versionId, target.label, target.unsaved);
  }

  /**
   * M6-G2-F01: a caption-less canvas action must never move a dialog-owning
   * session into a hidden/inert surface. Hide and Delete both remove or
   * deactivate the version's mounted sessions, so both are refused while the
   * workspace navigation lock is held.
   */
  function requestHide(versionId: string) {
    if (navigationLocked) {
      return;
    }
    hidePanel(versionId);
  }

  function changeMode(mode: WorkbenchMode) {
    if (navigationLocked || mode === activeMode) return;
    if (activeMode === 'alignment') setHoveredAlignment(null);
    setActiveMode(mode);
  }

  /**
   * M6-PRR-F01: the force confirmation is the same destructive lifecycle, so
   * cancelling it terminates that lifecycle and releases the lock (the target
   * TextVersion still exists and its drafts are preserved).
   */
  function cancelForceDelete() {
    setPendingForceDelete(null);
    setActiveDeleteTarget(null);
  }

  function confirmForceDelete() {
    if (!pendingForceDelete) {
      return;
    }
    const target = pendingForceDelete;
    pendingDeleteSeenRef.current = false;
    setActiveDeleteTarget({
      versionId: target.versionId,
      label: target.label,
      unsaved: target.unsaved,
    });
    deleteMutation.mutate(
      { versionId: target.versionId, force: true },
      {
        /*
         * REAL BACKEND SEMANTICS (apps/api/app/services/text_version_service.py
         * `delete_text_version`): both `TEXT_HAS_ANNOTATIONS` guards are
         * `... and not force`, so an authoritative `force=true` request can
         * NEVER produce that code. Its possible failures are `NOT_FOUND` (404)
         * and unexpected server errors; neither is recoverable by retrying the
         * same confirmation.
         *
         * Distinct success/failure termination (never `onSettled`, which runs
         * on BOTH):
         *
         * - SUCCESS: the server accepted the destructive operation, so the
         *   workspace confirmation no longer needs to stay open — but the
         *   authoritative refetch is still pending and the OLD snapshot is
         *   still mounted. `activeDeleteTarget` therefore MUST stay set:
         *   lifecycle termination belongs exclusively to the authoritative
         *   `versionsById` reconciliation effect above. Releasing here would
         *   make the target editor writable again for a draft the pending
         *   reconciliation is about to destroy.
         * - FAILURE: the server did NOT delete the target. The dialog closes,
         *   the lifecycle is explicitly terminated, and the existing
         *   `ErrorMessage` surface stays available for a fresh attempt.
         */
        onSuccess: () => {
          setPendingForceDelete(null);
        },
        onError: () => {
          setPendingForceDelete(null);
          setActiveDeleteTarget(null);
        },
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
          {hidden.map((id) => {
            const label = versionsById[id]?.label ?? id;
            const status = hiddenVersionStatus(id, sessionStatuses);
            return (
              <span key={id} className="hidden-version-item">
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  className="reopen-button"
                  onClick={() => openPanel(id)}
                >
                  Open {label}
                </Button>
                {/*
                  M6-PRR-F03 / contract section 17: the hidden-version
                  management surface itself must expose the bounded
                  unsaved-session state of each hidden TextVersion. Derived
                  from the existing session coordination state; it copies no
                  draft and adds no authority.
                */}
                {status !== null ? (
                  <span
                    className={`hidden-version-status session-state session-state-${status.toLowerCase()}`}
                    role="status"
                    aria-label={`${label} session status`}
                  >
                    {label} — {status}
                  </span>
                ) : null}
              </span>
            );
          })}
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

      {/*
        M6-HRA-D01: `data-visible-panel-count` is a PURE derived
        presentation hook. It is computed directly from the existing
        `visible` collection and lets CSS choose a deterministic canonical
        track count; it adds no state, no layout preference, no
        persistence, no toggle and no domain meaning.
      */}
      <div className="panels-container" data-visible-panel-count={visible.length}>
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
                    disabled={deleteMutation.isPending || navigationLocked}
                    onClick={() => requestDelete(version.id, version.label)}
                  >
                    Delete
                  </Button>
                </Toolbar>
                <TextPanel
                  version={version}
                  runs={runsByVersion[id] ?? []}
                  onHide={() => requestHide(id)}
                  hideDisabled={navigationLocked}
                  spanRegistry={spanRegistry}
                  survivingGroupIds={survivingGroupIds}
                  interactionLocked={taskInteractionLocked}
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

      <section className="canvas-tools" aria-label="Text version tools">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-expanded={importOpen}
          aria-controls="text-version-import"
          disabled={navigationLocked}
          onClick={() => setImportOpen((open) => !open)}
        >
          {importOpen ? 'Close add text version' : 'Add text version'}
        </Button>
        <div id="text-version-import" hidden={!importOpen}>
          <ImportPanel documentId={documentId} onSessionStateChange={sessionReporters.import} />
        </div>
      </section>

      <WorkbenchTaskNavigation
        activeMode={activeMode}
        activeTargetId={activeTargetId}
        visibleVersions={visible}
        versionsById={versionsById}
        sessionStatuses={sessionStatuses}
        trayCount={pendingMembers.length}
        canCreateAlignment={canCreateAlignment}
        navigationLocked={navigationLocked}
        onModeChange={changeMode}
        onTargetChange={setActiveTargetId}
      />

      {/*
        M6-PRR-F01: while a TextVersion destructive lifecycle is active the
        linguistic editor sessions receive an explicit `frozen` coordination
        input, so a new draft or draft mutation can never be created and then
        swallowed by the pending authoritative reconciliation. Every editor
        stays MOUNTED (existing drafts, session state and dialog ownership are
        preserved) and only the drafting controls become inert.

        Controls that OPEN a session-owned destructive dialog (Delete
        segmentation / Delete tokens, Inspector Remove / Delete Alignment,
        Inspector Close) are driven by `workspaceDestructiveLocked` instead of
        the broad `taskInteractionLocked`: their own dialog contributes to
        `navigationLocked`, and feeding that back would disable the dialog's
        own Cancel and self-deadlock. `workspaceDestructiveLocked` carries the
        same workspace-owned TextVersion destructive lifetime, so a second
        destructive surface can never stack behind it, while the pre-existing
        focus restoration for a normally-opened session dialog is preserved.
      */}
      <div className="workbench-task-deck" aria-label="Active workbench task">
        <div
          id="workbench-session-alignment"
          className="workbench-task-session"
          role="tabpanel"
          aria-label="Alignment task"
          hidden={activeMode !== 'alignment'}
        >
          <AlignmentTray
            members={pendingMembers}
            versionsById={versionsById}
            onRemove={removePendingMember}
            onClear={clearPendingTray}
            canCreate={canCreateAlignment}
            onCreate={handleCreateAlignment}
            isCreating={createMutation.isPending}
            interactionLocked={taskInteractionLocked}
          />

          <AlignmentInspector
            documentId={documentId}
            activeAlignmentId={activeAlignmentId}
            groupsById={savedAlignments.groupsById}
            membersByGroup={savedAlignments.membersByGroup}
            spansById={savedAlignments.spansById}
            versionsById={savedAlignments.versionsById}
            onClose={() => setActiveAlignment(null)}
            interactionLocked={workspaceDestructiveLocked}
            onSessionStateChange={sessionReporters.alignment}
          />

          <SavedAlignments
            groups={savedAlignments.groups}
            membersByGroup={savedAlignments.membersByGroup}
            spansById={savedAlignments.spansById}
            versionsById={savedAlignments.versionsById}
            onActivate={setActiveAlignment}
            onHover={setHoveredAlignment}
            disabled={isMutatingAlignment}
            interactionLocked={taskInteractionLocked}
          />
        </div>

        {LINGUISTIC_MODES.map((mode) => (
          <div
            key={mode}
            id={`workbench-session-${mode}`}
            className="workbench-task-session"
            role="tabpanel"
            aria-label={`${mode === 'pos' ? 'POS' : mode} task`}
            hidden={activeMode !== mode}
          >
            {panelOrder.map((id) => {
              const version = versionsById[id];
              if (!version) return null;
              const layers = segmentation.layersByVersionAndGranularity[id];
              const sentenceLayer = layers?.sentence;
              const tokenLayer = layers?.token;
              const reporter = sessionReporters[sessionKey(id, mode)];
              return (
                <div
                  key={id}
                  className="linguistic-editor-session"
                  data-session-key={sessionKey(id, mode)}
                  hidden={activeTargetId !== id || !visiblePanels.includes(id)}
                >
                  {mode === 'sentence' ? (
                    <SegmentationPanel
                      documentId={documentId}
                      version={version}
                      savedLayer={sentenceLayer}
                      savedSegments={sentenceLayer ? segmentation.segmentsByLayer[sentenceLayer.id] ?? [] : []}
                      frozen={taskInteractionLocked}
                      workspaceDestructiveLocked={workspaceDestructiveLocked}
                      onSessionStateChange={reporter}
                    />
                  ) : null}
                  {mode === 'token' ? (
                    <TokenSegmentationPanel
                      documentId={documentId}
                      version={version}
                      sentenceLayer={sentenceLayer}
                      sentenceSegments={sentenceLayer ? segmentation.segmentsByLayer[sentenceLayer.id] ?? [] : []}
                      savedLayer={tokenLayer}
                      savedSegments={tokenLayer ? segmentation.segmentsByLayer[tokenLayer.id] ?? [] : []}
                      frozen={taskInteractionLocked}
                      workspaceDestructiveLocked={workspaceDestructiveLocked}
                      onSessionStateChange={reporter}
                    />
                  ) : null}
                  {mode === 'lemma' ? (
                    <LemmaAnnotationPanel
                      documentId={documentId}
                      version={version}
                      tokenLayer={tokenLayer}
                      tokenSegments={tokenLayer ? segmentation.segmentsByLayer[tokenLayer.id] ?? [] : []}
                      annotationsByTokenSegmentId={segmentation.lemmaAnnotationByTokenSegmentId}
                      frozen={taskInteractionLocked}
                      onSessionStateChange={reporter}
                    />
                  ) : null}
                  {mode === 'pos' ? (
                    <PosAnnotationPanel
                      documentId={documentId}
                      version={version}
                      tokenLayer={tokenLayer}
                      tokenSegments={tokenLayer ? segmentation.segmentsByLayer[tokenLayer.id] ?? [] : []}
                      posAnnotationsByTokenSegmentId={segmentation.posAnnotationByTokenSegmentId}
                      lemmaTokenSegmentIds={new Set(Object.keys(segmentation.lemmaAnnotationByTokenSegmentId))}
                      frozen={taskInteractionLocked}
                      onSessionStateChange={reporter}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {activeDeleteTarget !== null ? (
        <p className="workbench-delete-lock" role="status">
          Deleting “{activeDeleteTarget.label}” — linguistic drafting is frozen
          until the authoritative workspace confirms the deletion.
        </p>
      ) : null}

      {activeMode !== 'alignment' && activeTargetId === null ? (
        <EmptyState>Open a text version to use linguistic tools.</EmptyState>
      ) : null}

      {pendingDirtyDelete ? (
        <ConfirmDialog
          headingId="dirty-delete-heading"
          onClose={() => setPendingDirtyDelete(null)}
          closeDisabled={deleteMutation.isPending}
        >
          <h3 id="dirty-delete-heading">Discard drafts and delete text version?</h3>
          <p>
            “{pendingDirtyDelete.label}” has unsaved work:{' '}
            {unsavedSummary(pendingDirtyDelete.unsaved)}. Continuing will
            discard those drafts if the authoritative deletion succeeds.
          </p>
          <div className="confirm-dialog-actions">
            <Button type="button" variant="secondary" disabled={deleteMutation.isPending} onClick={() => setPendingDirtyDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={deleteMutation.isPending} onClick={confirmDirtyDelete}>
              Continue delete
            </Button>
          </div>
        </ConfirmDialog>
      ) : null}

      {pendingForceDelete ? (
        <ConfirmDialog
          headingId="force-delete-heading"
          onClose={cancelForceDelete}
          closeDisabled={deleteMutation.isPending}
        >
          <h3 id="force-delete-heading">Delete text version permanently?</h3>
          <p>
            “{pendingForceDelete.label}” has persisted annotations.
            Deleting it will permanently remove its annotations, including
            alignments and segmentation, and any
            alignment group that becomes invalid (for example, a group left
            with members from a single text version) will also be deleted.
            This cannot be undone.
          </p>
          {pendingForceDelete.unsaved.length > 0 ? (
            <p className="force-delete-unsaved" role="status">
              Unsaved work in this text version (
              {unsavedSummary(pendingForceDelete.unsaved)}) will also be
              discarded if the deletion succeeds.
            </p>
          ) : null}
          <div className="confirm-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={deleteMutation.isPending}
              onClick={cancelForceDelete}
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

      {/* M6-G2-F10: exactly one confirmation owns dirty in-app route
          transitions (Link, Back/Forward, programmatic navigation).
          M6-G2-F11: when another workspace confirmation is already open the
          leave is cancelled instead (see above), so no second modal mounts. */}
      {leaveBlocker.state === 'blocked' && !navigationLocked ? (
        <ConfirmDialog
          headingId="leave-workspace-heading"
          onClose={() => leaveBlocker.reset()}
        >
          <h3 id="leave-workspace-heading">Leave this document workspace?</h3>
          <p>
            Unsaved editor drafts in this workspace will be discarded when you
            leave.
          </p>
          <div className="confirm-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => leaveBlocker.reset()}
            >
              Stay
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => leaveBlocker.proceed()}
            >
              Leave
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
      <section
        className="workspace-page page-stack"
        aria-labelledby="workspace-loading-heading"
        translate="no"
      >
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
      <section
        className="workspace-page page-stack"
        aria-labelledby="workspace-error-heading"
        translate="no"
      >
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
      <section
        className="workspace-page page-stack"
        aria-labelledby="workspace-heading"
        translate="no"
      >
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
          segmentation={{
            layersByVersion: normalized.segmentationLayersByVersion,
            layersByVersionAndGranularity:
              normalized.segmentationLayersByVersionAndGranularity,
            segmentsByLayer: normalized.segmentsByLayer,
            lemmaAnnotationByTokenSegmentId:
              normalized.lemmaAnnotationByTokenSegmentId,
            posAnnotationByTokenSegmentId:
              normalized.posAnnotationByTokenSegmentId,
          }}
        />
      </section>
    </WorkspaceProvider>
  );
}
