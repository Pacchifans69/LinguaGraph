/**
 * Per-document workspace panel preferences (M0.3).
 *
 * Persisted to localStorage under the accepted namespace
 * ``linguagraph.workspace.preferences.v1.<documentId>``
 * (report section 10). Stored panel order/visibility are local UI
 * preferences — they are NEVER written back to TextVersion ``sort_order``
 * (server ordering is a separate concern).
 *
 * Reconciliation keeps preferences consistent with the current server
 * TextVersion ids: deleted ids are dropped, newly created versions are
 * incorporated (appended in server order), and documents never leak state
 * between each other (the namespace is per-documentId).
 */

export interface WorkspacePreferences {
  panelOrder: string[];
  visiblePanels: string[];
}

export const PREFERENCE_NAMESPACE = 'linguagraph.workspace.preferences.v1';

export function preferenceKey(documentId: string): string {
  return `${PREFERENCE_NAMESPACE}.${documentId}`;
}

export function loadPreferences(
  documentId: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): WorkspacePreferences | null {
  try {
    const raw = storage.getItem(preferenceKey(documentId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as WorkspacePreferences).panelOrder) &&
      Array.isArray((parsed as WorkspacePreferences).visiblePanels)
    ) {
      const prefs = parsed as WorkspacePreferences;
      return {
        panelOrder: prefs.panelOrder.filter((id): id is string => typeof id === 'string'),
        visiblePanels: prefs.visiblePanels.filter(
          (id): id is string => typeof id === 'string',
        ),
      };
    }
    return null;
  } catch {
    // Corrupt/legacy payloads are treated as absent, never as a crash.
    return null;
  }
}

export function savePreferences(
  documentId: string,
  prefs: WorkspacePreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  storage.setItem(
    preferenceKey(documentId),
    JSON.stringify({ panelOrder: prefs.panelOrder, visiblePanels: prefs.visiblePanels }),
  );
}

/**
 * Reconcile persisted preferences against the current server version ids.
 *
 * - removes any id that no longer exists on the server;
 * - keeps the existing preferred order and appends newly-seen server
 *   versions (in server order) so created versions are incorporated;
 * - guarantees every id in both lists refers to an existing version.
 */
export function reconcilePreferences(
  prefs: WorkspacePreferences,
  serverVersionIds: string[],
): WorkspacePreferences {
  const serverSet = new Set(serverVersionIds);

  const panelOrder = prefs.panelOrder.filter((id) => serverSet.has(id));
  const visiblePanels = prefs.visiblePanels.filter((id) => serverSet.has(id));

  const seen = new Set(panelOrder);
  for (const id of serverVersionIds) {
    if (!seen.has(id)) {
      panelOrder.push(id);
      seen.add(id);
    }
  }

  return {
    panelOrder,
    visiblePanels: visiblePanels.filter((id) => serverSet.has(id)),
  };
}
