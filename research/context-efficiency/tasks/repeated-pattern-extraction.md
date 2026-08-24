# Repeated-pattern extraction

## Model prompt (use verbatim)

Inspect only these frozen files:
- `research/context-efficiency/corpus/repeated-patterns/diagnose-and-fix.ts`
- `research/context-efficiency/corpus/repeated-patterns/investigate.ts`
- `research/context-efficiency/corpus/repeated-patterns/report-validate.ts`
- `research/context-efficiency/corpus/repeated-patterns/verify-claims.ts`

Compare the four workflows. Identify shared orchestration conventions and relevant exceptions in budgeting/reporting, spawned-agent timeout/tool constraints, parallel fan-out, mutation-capable tools, and usage reporting. Support every factual claim with one or more `path:start-end` line-range citations from those files. Do not inspect other files, modify files, run tests, or make external network requests. Keep the answer under 500 words.

Inspection protocol: use `read` with offsets/limits for source excerpts. If you use `bash`, use only one unchained `rg -n -F 'literal' FILE...`, `grep -n -F 'literal' FILE...`, `wc -l FILE...`, or `sha256sum FILE...` command, naming only the listed files. No pipes, semicolons, redirection, substitutions, regex alternation, `nl`, `awk`, or `sed`. Include this same inspection protocol in any scout task. For contract claims in the final answer, personally read the cited ranges after the scout completes.

Use exactly these headings:
- `Shared conventions`
- `Exceptions by file`
- `Citations`
