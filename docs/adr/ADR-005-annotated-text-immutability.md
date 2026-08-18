# ADR-005: Annotated text immutability in M0

## Status  
Accepted (frozen for M0)

## Context  
If text content can change after spans are created, offsets and `exact_text` become stale. M0 does not implement re-anchoring, revisions, or operational transforms.  
Deleting annotated text versions is also not trivial because it may leave alignment groups in an invalid state.

## Decision  
`TextVersion.content` is immutable once the `TextVersion` has annotations (`Span`/`AlignmentMember`). There is no general `PATCH /text-versions/{id}` content mutation. Unannotated text can be replaced.  

Annotated text can only be removed via an explicit destructive reset flow (`DELETE /text-versions/{id}?force=true` after user confirmation), which:

- Deletes all dependent `Span`s and `AlignmentMember`s owned by that `TextVersion`;
- After the deletion, **revalidates all `AlignmentGroup`s** that were affected by the removal (i.e., groups that previously contained members from the deleted version);
- **Deletes any group** that no longer satisfies the M0 alignment invariants, specifically:
  - groups with fewer than 2 total `AlignmentMember`s, or
  - groups whose remaining members originate from fewer than 2 distinct `TextVersion`s (i.e., all remaining members belong to the same text version);
- The entire operation – deletion of version, spans, members, and cleanup of invalid groups – is performed **atomically in a single database transaction**.

This ensures that after a forced deletion, the remaining alignment data remains consistent with the invariant defined in ADR-006.

## Alternatives Considered  
- Allow content edits and remap offsets: rejected because automatic remapping is out of M0 scope and error‑prone.  
- Always block deletion of annotated versions: rejected because users need a way to remove bad imports; explicit force is the escape hatch.  
- Only delete orphaned groups (groups with zero members): rejected because groups with members from a single version become invalid per ADR‑006, and leaving them would break the invariant.

## Consequences  
- UI must clearly warn before destructive reset, explaining that not only the version but also potentially related alignment groups will be permanently removed.  
- Backend must enforce immutability and block accidental content changes.  
- The transaction‑based cleanup guarantees that no partial state is left behind, even if a group becomes invalid.  
- The operation may delete more than just the spans/memberships of the removed version; alignment groups that lose cross‑version diversity are also removed. This must be clearly communicated to the user during the confirmation step.
