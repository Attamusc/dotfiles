-- Semantic model of the short-flag recursive+forced rm policy in
-- dot_pi/agent/extensions/command-safety/policy.ts. No shell parser is modeled.
inductive Target where
  | scratch | local | outside | home
  deriving DecidableEq, Repr

inductive Decision where
  | allow | confirm | block
  deriving DecidableEq, Repr

-- Scratch means a descendant of a scratch root; local is inside the workspace.
-- Outside includes an absolute path outside scratch or a parent of the workspace.
def needsGate (subagent : Bool) : Target → Bool
  | .scratch => false
  | .local => subagent
  | .outside | .home => true

def gated (subagent : Bool) : Decision :=
  if subagent then .block else .confirm

-- Pre-fix policy: only the first operand is inspected.
def beforeFix (subagent : Bool) : List Target → Decision
  | [] => .allow
  | first :: _ => if needsGate subagent first then gated subagent else .allow

-- Intended policy: each operand must be checked; one unsafe operand gates the command.
def decision (subagent : Bool) (targets : List Target) : Decision :=
  if targets.any (needsGate subagent) then gated subagent else .allow

-- Concrete witness: scratch-first ordering bypassed the gate before the fix.
#eval beforeFix false [.scratch, .home] -- allow
#eval beforeFix true [.scratch, .home]  -- allow
#eval decision false [.scratch, .home]  -- confirm
#eval decision true [.scratch, .home]   -- block
#eval decision false [.local, .scratch] -- allow
#eval decision true [.local, .scratch]  -- block

theorem old_scratch_first_bypass :
    beforeFix true [.scratch, .home] = .allow ∧
    beforeFix true [.home, .scratch] = .block := by
  decide

theorem no_operands_allowed (subagent : Bool) : decision subagent [] = .allow := by
  rfl

theorem scratch_only_allowed (subagent : Bool) (n : Nat) :
    decision subagent (List.replicate n .scratch) = .allow := by
  simp [decision, needsGate]

theorem unsafe_operand_gated (subagent : Bool) (before after : List Target)
    (target : Target) (isGated : needsGate subagent target = true) :
    decision subagent (before ++ target :: after) = gated subagent := by
  simp [decision, List.any_append, isGated]

theorem home_always_gated (subagent : Bool) (before after : List Target) :
    decision subagent (before ++ .home :: after) = gated subagent := by
  exact unsafe_operand_gated subagent before after .home rfl

theorem operand_order_independent (subagent : Bool) (a b : Target) :
    decision subagent [a, b] = decision subagent [b, a] := by
  simp [decision, List.any_cons, Bool.or_comm]
