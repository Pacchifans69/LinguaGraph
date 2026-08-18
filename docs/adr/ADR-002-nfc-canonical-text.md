# ADR-002: NFC canonical text

## Status
Accepted (frozen for M0)

## Context
Text can be entered as composed or decomposed Unicode (e.g. `Café` vs `Cafe\u0301`). Offsets must be stable and comparable. If raw text were stored, the same visual text could have different offset sequences, causing annotation corruption after re-import.

## Decision
TextVersion.content is canonicalized at the backend ingestion boundary:
- decode strict UTF-8 (file import)
- strip a single leading BOM
- CRLF/CR → LF
- reject NUL and unpaired surrogates
- Unicode NFC normalize
- do not collapse whitespace, do not trim, do not lowercase, do not alter punctuation, do not use NFKC

All span offsets refer to this canonical string. `content_hash` is computed from canonical content.

## Alternatives Considered
- Store raw text and normalize on read: rejected because offsets computed on raw text would become invalid after normalization.
- NFKC: rejected because it can change semantics (e.g. ligatures, width) beyond user expectation.
- Canonicalize in frontend only: rejected because backend must be the authority.

## Consequences
- Backend owns canonicalization; frontend displays the canonical content returned by the API.
- Text import and paste may change the user's input (e.g. CRLF→LF, decomposed→NFC); this is expected and documented.
- Canonicalization test vectors are mandatory.
