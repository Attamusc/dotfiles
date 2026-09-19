---
name: pr-review-canvas
description: Build a bounded Markdown-first walkthrough for an explicitly supplied GitHub PR URL or number, optionally presenting the same review with Glimpse. Use for whole-PR review walkthroughs or review artifacts.
---

# PR Review Canvas

This skill is the sole owner of whole-PR walkthrough artifacts. `github` owns GitHub access; `iterate-pr` owns CI/feedback collection and iteration verdicts. Require an explicit GitHub PR URL, or a PR number plus explicit `OWNER/REPO`. Do not discover a PR from git state, sessions, or transcripts.

## Procedure

1. Load the `github` skill. Parse and confirm the explicit PR identity.
2. Create a temporary user-local working directory. Do not write a tracked artifact unless the user requests a path.
3. Collect bounded inputs using the explicit `OWNER/REPO` for every call. Each command streams paginated records into a fixed-memory reducer and emits exactly one bounded JSON envelope before agent/model context. Never aggregate all pages into an in-memory array for these collections. Do not use current-directory iterate-pr helper scripts for cross-repository input. They retain ownership of iteration behavior, but their PR identity is not an input unless it exactly matches the explicit URL.

```bash
gh pr view "$NUMBER" --repo "$REPO" --json number,url,title,author,state,baseRefName,headRefName,additions,deletions,changedFiles

gh api "repos/$REPO/pulls/$NUMBER/files?per_page=100" --paginate \
  --jq '.[] | {path:.filename,status,additions,deletions,patch:((.patch // "")[0:20000] // null)}' \
  | jq -cn --argjson max 100 'reduce inputs as $item ({items:[],total:0}; .total += 1 | if (.items|length)<$max then .items += [$item] else . end) | .fetched=(.items|length) | .omitted=(.total-.fetched)'

# General PR/issue conversation
gh api "repos/$REPO/issues/$NUMBER/comments?per_page=100" --paginate \
  --jq '.[] | {author:.user.login,body:(.body // "")[0:8000]}' \
  | jq -cn --argjson max 400 'reduce inputs as $item ({items:[],total:0}; .total += 1 | if (.items|length)<$max then .items += [$item] else . end) | .fetched=(.items|length) | .omitted=(.total-.fetched)'

# Submitted review summaries, including CHANGES_REQUESTED bodies
gh api "repos/$REPO/pulls/$NUMBER/reviews?per_page=100" --paginate \
  --jq '.[] | {author:.user.login,body:(.body // "")[0:8000],reviewState:.state}' \
  | jq -cn --argjson max 400 'reduce inputs as $item ({items:[],total:0}; .total += 1 | if (.items|length)<$max then .items += [$item] else . end) | .fetched=(.items|length) | .omitted=(.total-.fetched)'

# Authoritative inline feedback: parent review threads and their bounded comments.
# gh supplies $endCursor for outer thread pagination. Each thread exposes comment
# totalCount/commentPageInfo so omitted comments are reported rather than silently lost.
# Only the outer reviewThreads field exposes an unaliased pageInfo, which is the
# pagination cursor gh must follow.
QUERY='query($owner:String!,$repo:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){nodes{id,isResolved,path,line,originalLine,comments(first:100){totalCount nodes{author{login} body} commentPageInfo:pageInfo{hasNextPage endCursor}}}pageInfo{hasNextPage endCursor}}}}}'
gh api graphql --paginate -f query="$QUERY" -F owner="${REPO%%/*}" -F repo="${REPO#*/}" -F number="$NUMBER" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | {threadId:.id,isResolved,path,line,originalLine,commentTotal:.comments.totalCount,commentsReturned:(.comments.nodes|length),commentsHaveNextPage:.comments.commentPageInfo.hasNextPage,comments:[.comments.nodes[] | {author:.author.login,body:(.body // "")[0:8000]}]}' \
  | jq -cn --argjson max 400 'reduce inputs as $thread ({items:[],total:0,nestedOmitted:0,commentsHaveNextPage:false}; .total += $thread.commentTotal | .nestedOmitted += ($thread.commentTotal-$thread.commentsReturned) | .commentsHaveNextPage = (.commentsHaveNextPage or $thread.commentsHaveNextPage) | reduce $thread.comments[] as $comment (. ; if (.items|length)<$max then .items += [($comment + {threadId:$thread.threadId,isResolved:$thread.isResolved,path:$thread.path,line:$thread.line,originalLine:$thread.originalLine,locationStatus:(if $thread.line != null then "current" elif $thread.originalLine != null then "outdated" else "unavailable" end),locationNote:(if $thread.line == null and $thread.originalLine == null then "GitHub supplied no current or original line." else null end)})] else . end)) | .items |= map(if .locationNote == null then del(.locationNote) else . end) | .fetched=(.items|length) | .omitted=(.total-.fetched)'

gh pr checks "$NUMBER" --repo "$REPO" --json name,state,link,bucket --jq '.[]' \
  | jq -cn --argjson max 100 'reduce inputs as $item ({items:[],total:0}; .total += 1 | if (.items|length)<$max then .items += [$item] else . end) | .fetched=(.items|length) | .omitted=(.total-.fetched)'
```

Pass the three unsliced source objects to `normalizeFeedbackSources()` from `scripts/review-document.mjs`. It establishes thread relationships first, merges all items, globally deduplicates by author/body/path/line, and only then applies the single 200-item cap. Its structured diagnostics report per-source totals, fetched and omitted counts plus duplicate and post-dedup truncation counts; translate every nonzero count into source notes and limitations.

Treat GraphQL review threads as the authoritative inline source; do not attempt to join REST PR review-comment (`PRRC_…`) IDs to GraphQL review-thread (`PRRT_…`) IDs. Normalize the three feedback sources, retain each inline comment's parent `threadId`, `isResolved`, thread location, then deduplicate repeated author/body/path/line records before categorizing them. Apply one shared 200-item cap after the merge, not 200 per source. Preserve typed `source`, review state (especially `CHANGES_REQUESTED`), and resolution. Compare GraphQL `commentTotal`, `commentsReturned`, and `commentsHaveNextPage`; if pagination, truncation, missing bodies, or deduplication omits anything, add an explicit evidence/source note and limitation with the omitted count or the fact that the count is unavailable. Never infer repository identity from the current directory.

Bound every body and patch before model construction; at most 100 files, 100 checks, 200 total feedback items, six iteration passes, 20,000 characters per patch, 8,000 characters per prose field, and 256,000 bytes per rendered projection. Never read or forward session transcript bodies.

4. Group every file exactly once as `core` (behavior/state/error semantics), `wiring` (integration/configuration/call sites), or `mechanical` (generated, formatting, lockfiles, rote renames). Add terse `why`, reviewer annotation, risk, and optionally bounded pseudocode.
5. Normalize checks and categorized feedback (`high`, `medium`, `low`, `bot`, `resolved`). If an iterate-pr workflow report is supplied, pass its real `history` records through `normalizeIterationReport()` from `scripts/review-document.mjs`; never hand-author agreement. The adapter derives structured status, agreement, diagnostics, and summary from `status`, `structuredStatus`, `agreement`, and `taskOutcomeObservation`, rejecting contradictions. Legacy `ITERATE_STATUS` is authoritative. Show `PENDING`, `BLOCKED`, `NO_PR`, missing/malformed/duplicate/non-sole structured reports, invalid-domain pairs, and structured/legacy disagreement explicitly.
6. Build schema version 1 following `references/review-document.md`. Run:

```bash
node ~/.agents/skills/pr-review-canvas/scripts/review-document.mjs "$MODEL_JSON" "$OUTPUT_MD"
```

Markdown must be written and validated before any presentation attempt. Report its local path and verdict-relevant blockers.
7. Only when the user asks for visual presentation, import `scripts/glimpse-adapter.mjs` and use the installed package's documented absolute `src/glimpse.mjs` interface. Treat missing module/host, headless Linux, render errors, timeout, and early close as `unsupported(reason)`. Do not alter or rewrite Markdown or its verdict. A live Glimpse smoke remains deferred to a UI-capable host.

Do not start a server, use browser automation, create an extension, manage panes/processes, emit lifecycle status, post comments, mutate the PR, or invoke workflow passes.
