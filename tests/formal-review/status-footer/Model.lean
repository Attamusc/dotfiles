import Lean

-- Boundary: Jujutsu's template renders bookmark names; the footer decodes the
-- resulting field. This models the field, not Git/Jujutsu history or terminal UI.
def oldBookmarks (field : String) : List String :=
  (field.splitOn ",").filter (· != "")

def jsonBookmarks (names : List String) : String :=
  (Lean.Json.arr ((names.map Lean.Json.str).toArray)).compress

def parseBookmarks (field : String) : Option (List String) := do
  let value ← (Lean.Json.parse field).toOption
  let items ← value.getArr?.toOption
  items.toList.mapM (fun item => item.getStr?.toOption)

#eval oldBookmarks "\"alpha,beta\""             -- two fragments
#eval jsonBookmarks ["alpha,beta"]               -- JSON field
#eval parseBookmarks (jsonBookmarks ["alpha,beta"]) -- one bookmark

theorem old_comma_witness :
    oldBookmarks "\"alpha,beta\"" = ["\"alpha", "beta\""] := by
  native_decide

theorem json_comma_witness :
    parseBookmarks (jsonBookmarks ["alpha,beta"]) = some ["alpha,beta"] := by
  native_decide

theorem empty_json_field : parseBookmarks "[]" = some [] := by
  native_decide

structure Snapshot where
  changeId : String
  currentBookmarks : List String
  baseBookmarks : List String
  steps : Nat
  conflicts : Nat
  additions : Nat
  deletions : Nat
  deriving Repr

structure Footer where
  changeId : String
  currentBookmarks : List String
  nearestBookmark : Option String
  ahead : Option Nat
  conflicts : Nat
  additions : Nat
  deletions : Nat
  deriving Repr

-- For a structurally valid jj template output: current, zero or more steps,
-- then at most one bookmarked base. Bookmark fields are decoded JSON arrays.
def parseSnapshot (s : Snapshot) : Footer :=
  { changeId := s.changeId
    currentBookmarks := s.currentBookmarks
    nearestBookmark := s.baseBookmarks.head?
    ahead := s.baseBookmarks.head?.map (fun _ => s.steps + 1)
    conflicts := s.conflicts
    additions := s.additions
    deletions := s.deletions }

theorem bookmarks_preserved (s : Snapshot) :
    (parseSnapshot s).currentBookmarks = s.currentBookmarks := by
  rfl

theorem no_base_no_distance (s : Snapshot) (h : s.baseBookmarks = []) :
    (parseSnapshot s).nearestBookmark = none ∧ (parseSnapshot s).ahead = none := by
  simp [parseSnapshot, h]

theorem distance_from_base (s : Snapshot) (name : String) (rest : List String)
    (h : s.baseBookmarks = name :: rest) :
    (parseSnapshot s).nearestBookmark = some name ∧
    (parseSnapshot s).ahead = some (s.steps + 1) := by
  simp [parseSnapshot, h]
