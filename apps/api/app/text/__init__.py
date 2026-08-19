"""Pure text-domain utilities: canonicalization, code-point offsets, BCP-47.

These modules are the single implementation of the canonical-text contract
(M0_PREIMPLEMENTATION_REPORT.md, section 6) and the code-point offset rules
(ADR-001, ADR-002). Services and models must not re-implement this logic.
"""
