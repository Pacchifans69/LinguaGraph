# ADR-014: Mode-oriented Workbench information architecture

## Status

Accepted for the M6 implementation candidate

## Context

Through M5, every visible TextVersion slot permanently rendered canonical text
followed by the Sentence, Token, Lemma, and POS panels. The four linguistic
workflows were therefore repeated for every visible version, while Alignment
Tray, Inspector, and saved alignments appeared only after that complete stack.
The resulting page height grew with both the number of TextVersions and the
number of linguistic layers. Human finding `HRA-F01` records that this density
and navigation cost is unacceptable.

The redesign cannot treat the panels as disposable views. Sentence and token
editors own unsaved partition drafts; lemma and POS editors own occurrence
drafts; Alignment Inspector and Import TextVersion own local form state. The
canonical text roots also participate in native Selection/Range conversion,
the RenderedSpanRegistry, and connector geometry. Unmounting these surfaces as
an incidental result of navigation would risk silent draft loss or break the
canonical selection/connector boundary.

## Decision

M6 uses a persistent canonical Text Canvas plus one bounded task deck.

- The Text Canvas continues to render every visible TextVersion as canonical
  flat runs inside the existing connector coordinate container. Mode changes
  never unmount or rewrite canonical text and never change the connector
  routing algorithm.
- The task deck exposes exactly five destinations: `Alignment`, `Sentence`,
  `Token`, `Lemma`, and `POS`. Exactly one destination is visible at a time.
- Linguistic destinations have one explicit active TextVersion target. Target
  choice is independent of which TextVersions are visible in the canvas and
  does not alter stored panel order.
- Mode and active-target state are document-scoped and ephemeral. They do not
  enter the workspace snapshot, TanStack Query, backend storage, or the
  existing localStorage preference schema. Initial mode is `Alignment`; the
  initial linguistic target is the first visible TextVersion in deterministic
  panel order.
- Task sessions remain mounted for the lifetime of the document workspace.
  Inactive sessions use the HTML `hidden` state and are removed from layout,
  focus order, and the accessibility tree without losing local drafts,
  feedback, or confirmation dialogs.
- Dirty, pending, error, conflict, and dialog status is summarized outside the
  hidden session. Navigation remains available while a save is pending, but
  destructive/dialog flows lock navigation. Dirty state must never disappear
  silently.
- If authoritative sentence/token basis changes while an affected local draft
  is dirty, that editor enters a fail-closed conflict state. Stale drafts remain
  visible but cannot be submitted until explicitly discarded or reconciled.
- A compact Alignment Tray status remains visible in every mode. The complete
  Tray, Inspector, and Saved Alignments surface is the `Alignment` destination;
  pending members and active alignment survive mode changes.
- Import TextVersion is an on-demand, mount-preserved auxiliary session rather
  than a sixth task destination.
- Hiding an active linguistic target deterministically selects the next visible
  TextVersion. The existing hide semantics for selection and staged tray
  members remain authoritative.
- Dirty sessions install a native document-leave warning. In-app document
  navigation also requires explicit confirmation. Deleting a TextVersion with
  dirty sessions names those sessions in the existing confirmation flow.

No backend route, schema, migration, domain identity, canonical-text structure,
Selection Engine, RenderedSpanRegistry semantics, or connector routing rule is
changed by this decision.

## Alternatives considered

- Persistent canvas plus a fixed contextual side rail: rejected for M6 because
  it compresses multi-version text width, changes wrapping and connector
  geometry substantially, and has a weak 1280×720 fallback.
- Per-TextVersion progressive disclosure: rejected because it retains repeated
  navigation chrome and continues to scale the workbench structure by the
  number of versions.
- Unmount inactive task panels: rejected because local drafts, feedback,
  dialogs, native selection references, and registry lifecycle would otherwise
  depend on navigation timing.
- Persist mode/target in the existing preference record: rejected because that
  record has a frozen panel-order/visibility meaning; a future persistence
  policy requires an explicit schema version.
- Resizable/dockable panes, virtualization, and connector rerouting: rejected as
  outside the bounded M6 contract.

## Consequences

- Default page height no longer grows by four expanded linguistic panels for
  every visible TextVersion; a future linguistic layer adds one destination and
  one bounded editor surface.
- Existing linguistic components remain independently owned and reusable, but
  they report session status to the Workbench shell and handle authoritative
  basis conflicts explicitly.
- Structural E2E locators move from `.panel-slot` nesting toward task roles,
  active-target labels, and product-semantic panel locators.
- `HRA-F01` remains open until Gate 2 and explicit Human Runtime Acceptance;
  accepting this ADR or producing a candidate does not close it.
- `HRA-F09` connector-routing debt and `G2-X01` hosted-runner availability
  remain separate and unresolved.
