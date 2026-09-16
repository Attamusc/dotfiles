# Exact durable promotion

Promotion is a second, explicit step after pickup. It consumes one already-produced clean proposal; it never reads a session or repairs redacted evidence.

## Protocol

Run `python3 -B scripts/promote.py` with one action and a canonical project root. JSON input is read from standard input; JSON output is bounded to 16 KiB.

1. `prepare` accepts a complete proposal with one destination, exact UTF-8 payload, bounded provenance, disclosure limits, destination semantics, owner, kind, and operation. It opens the canonical project root and binds its descriptor's exact integer device and inode identity into the tuple and proposal hash. It rejects redaction, taint, unfit truncation/omissions, secrets, invalid paths, symlinks, multiply linked existing files, and invalid owner/kind/operation combinations. Its `shown` result includes the canonical tuple and proposal hash. The tuple discloses only the root device/inode identity, exact clean content bytes, base hash (or `absent`), content hash, and expected result hash; it never discloses a root path or existing base bytes.
2. Obtain structured approval containing `decision: "approve"` and the tuple's exact proposal, root identity, destination, owner, kind, operation, base, content, and expected-result hashes. Approval of a summary, class, prior tuple, changed root or payload, or declined decision is invalid.
3. `handoff` accepts exactly `{tuple, approval}`. It opens the supplied canonical root, requires its descriptor's exact device/inode identity to equal the approved identity, and keeps that descriptor open while it revalidates and traverses the destination descriptor-relatively without following links. It rejects multiple links and recomputes the expected result hash from the private base plus approved content. A root substitution or destination race emits no handoff. The script has no filesystem mutation or verification action; only `notekeeper` or `domain-modeling` writes.
4. The trusted owner opens the canonical root and rechecks its exact approved device/inode identity immediately before mutation, while also rechecking the unchanged tuple and the target's no-follow and single-link constraints. It keeps the root descriptor open through descriptor-relative target validation and mutation, uses exclusive creation through parent descriptors for a new file, performs exactly the approved append or create, then reads back and compares the actual bytes and SHA-256 with the approved result before returning its owner-scoped response.

The protocol ends at exact `handed-off`. Session-pickup may report durable success as verified only from the trusted owner's direct procedural response. Protocol JSON is caller-authored data, not evidence that approval, handoff, or an owner write occurred; there is no public third-party verifier and no protocol `verified` state. Regenerate, show, and approve a new tuple after any proposal or base change.

## Destination rules

- `notekeeper`: append only to `.notes/decisions.md`, `.notes/patterns.md`, `.notes/gotchas.md`, or `.notes/context.md`.
- `domain-modeling` glossary: only `CONTEXT.md`, with owner attestation that the payload is glossary-only.
- `domain-modeling` ADR: an absent exact `docs/adr/NNNN-slug.md`, with the next number fixed and all three eligibility facts attested: hard to reverse, surprising without context, and a genuine trade-off.
