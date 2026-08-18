# ADR-001: Unicode code-point offsets

## Status
Accepted (frozen for M0)

## Context
JavaScript DOM/Range offsets are UTF-16 code units. Python Unicode strings and PostgreSQL text are logically sequences of Unicode code points. For text containing supplementary-plane characters (e.g. `A🙂B`), the two disagree: JS length is 4, code-point length is 3. If UTF-16 offsets were persisted, annotations would become wrong and unrecoverable.

## Decision
All persisted and API-visible text offsets are Unicode code-point offsets: zero-based, start inclusive, end exclusive. A single, framework-light frontend utility layer converts between DOM/UTF-16 offsets and canonical code-point offsets. React components must not implement offset conversion themselves. API never accepts UTF-16 offsets.

## Alternatives Considered
- UTF-16 offsets everywhere: rejected because it bakes JavaScript implementation details into the domain and breaks non-JS clients.
- Byte offsets: rejected because UTF-8 byte offsets are not stable across Unicode normalization and are unintuitive.
- Grapheme-cluster indices: rejected for M0 because grapheme segmentation is complex and unnecessary for persistence; code points are the smallest stable unit.

## Consequences
- Frontend needs a well-tested conversion layer and Unicode regression suite.
- JavaScript `String.length` and `String.slice` use UTF-16 code-unit indices and must never be given code-point offsets directly; frontend code must use `codePointLength`/`sliceByCodePoints` utilities (or an equivalent single conversion strategy).
- Selection boundaries that split a surrogate pair are invalid and must be rejected.
- M0 enforces code-point boundaries; full grapheme-aware editing is deferred.
