# First `/formal-review` slice: recursive forced removal

Run from this directory: `lean Model.lean`. No Lake package or Mathlib is needed; `lean-toolchain` pins Lean 4.34.1 via elan. Run the real tests from `dot_pi/agent/` with `node --test test/configuration.test.mjs`.

Lean is opt-in rather than a dependency of dotfiles bootstrap. On macOS, `brew install elan-init` supplies the official elan proxy for `lean` and `lake`. On Fedora, use the [official elan installer](https://github.com/leanprover/elan): download `elan-init.sh` to a temporary file, inspect it, then run `sh <file> -y --no-modify-path` and add `~/.elan/bin` to `PATH`. From this directory, `lean Model.lean` installs the pinned toolchain on first use. No default toolchain is needed.

## Behavioral boundary

`inspectDestructiveCommand` receives a shell command and an actor (`isSubagent`). For short-flag recursive+forced `rm`, the policy exempts each scratch operand. Non-scratch operands are blocked for subagents; the main session requests confirmation for home paths and paths outside the current workspace. Other safety rules (git, SQL, etc.) and the shell interpreter are outside this model. The model assumes one already-recognized `rm -rf` command with whitespace-separated operands. It does **not** prove that the regex recognizes all shell spellings, paths, quotes, substitutions, or actual filesystem effects. Separate commands, redirects, comments, and options are checked by Node tests, not modeled in Lean.

| Meaning | Implementation | Lean |
|---|---|---|
| Operand location and actor decision | `policy.ts:isScratch`, `destructiveRm` (home/relative/workspace checks) | `Target`, `needsGate` |
| One-operand gate | `policy.ts:destructiveRm`, `inspectDestructiveCommand` | `gated` |
| Operands combined | `policy.ts:destructiveRm` | `decision` (post-fix), `beforeFix` (historical witness) |

Concrete correspondence: `rm -rf /tmp/scratch-run ~/Documents` maps to `[.scratch, .home]`. Before the fix, `beforeFix false` and the implementation both allowed it; reversing operands triggered confirmation. For a subagent, the same order allowed the command before the fix and is now blocked. A second observation: `rm -rf /tmp/scratch-run; rm -rf ~/Documents` was also allowed because only the first `rm` occurrence was checked. Node regressions in `test/configuration.test.mjs` exercise both cases, and check scratch cleanup with redirects/comments and a nested relative path outside the workspace. These tests invoke the policy function; they do not run `rm`.

Theorems in `Model.lean` establish: no operands are allowed, scratch-only operands are allowed, any gated operand triggers a gate regardless of position, home is always gated, and two operands can be swapped without changing the decision. The `old_scratch_first_bypass` theorem proves the pre-fix counterexample. Lean proofs establish only these model properties; the Node regression tests are the separate evidence that the implementation follows this finite set of fixtures.
