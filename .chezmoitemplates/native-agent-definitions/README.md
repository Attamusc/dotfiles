# Staged native definitions — not active agents

These templates are opt-in source only. Chezmoi's template directory is outside
agent discovery and ordinary apply does not emit these files into a global,
project or installed-package agent directory. No destination wrapper is added.
Existing worker and reviewer defaults remain Pi. The coding role reuses the
single worker-body partial; the follow-up is a separate reader role. Neither
creates a second skill tree. The coding profile selects `skills: commit`; the
read-only follow-up selects no skill. Activation must wait for T6 to compile that
selected global/package skill into native instructions and T8 to verify the
rendered profile end to end. A frontmatter declaration alone is not execution
proof, and no commit-skill body is duplicated here.

Do not activate these definitions on current baseline consumers. Baseline
subagent4e74606 and workflows1614faf ignore runner metadata and can route these
roles as Pi. The updated workflow consumer rejects non-Pi intent and project
shadows of trusted native roles; it does not execute foreign workflows.

A separately approved ordered rollout must install compatible task/execution/
subagent/workflow packages and pins, verify every consuming owner has reloaded,
then explicitly render these exact template bytes into a trusted global resource
root. Refuse collisions/drift and record owned file hashes. If any consumer is
old or unreconciled, remain staged. Rollback deactivates owned native definitions
before downgrading consumers; there is no dormant Pi fallback. No activation,
bootstrap, host apply or native smoke belongs to this guidance task.

The native binding uses the current trusted host's absolute `{node}` and sets
MCP env HOME to the current trusted `{home}` explicitly, even on resume. Scope
cwd and the single `--store-override={env.PI_TODO_PATH}` argument are captured
literals; stable actor is `{managedSessionId}`. Assignment force is off. Never
source executable policy or HOME from a record, project frontmatter or inherited
child environment. Only trusted definitions configure machine binding. No
model-supplied command/grant overrides or shell interpolation.

The coding role grants broad file-write and shell approval, not path or OS
isolation. The follow-up denies native writes/shell and exposes task read actions
only; global native plugin restrictions are not certified. No Pi-only tools,
deny-tools, spawning or system-prompt-mode frontmatter is included. Role body is
supplied as native instructions, not a system-prompt replacement. Unsupported
Copilot controls must be rejected, never dropped.

TODO-46aecbc9 must use these rendered definitions in isolated trusted-global
resource roots for actual native argv and restricted-profile resume checks once
those implementations are ready. Parser/binding/discovery fixtures here do not
certify actual native CLI permissions, job completion or resume behavior.

Portable body-parity tests compare the rendered Pi worker with the rendered
shared partial and `dot_pi/agent/test/fixtures/worker-body-golden.json`. The golden
was verified against the pre-extraction UTF-8 body; normalization changes CRLF to
LF only and preserves every other byte of whitespace, including the final
newline. No runtime jj checkout, historical worker commit or repository artifact
directory is required. Optional contract-parser/baseline characterization tests
skip before dependency imports when their explicit source/overlay inputs are
absent; acceptance must supply those inputs so these checks execute.
