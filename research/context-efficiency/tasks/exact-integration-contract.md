# Exact-code and integration-contract reasoning

## Model prompt (use verbatim)

Inspect only these frozen files:
- `research/context-efficiency/corpus/exact-contract/index.ts`
- `research/context-efficiency/corpus/exact-contract/policy.ts`

Explain the exact command-safety decision flow for parent versus subagent execution, including noninteractive behavior, recoverable destructive commands, discovery blocking, timeout classification, and preservation of a caller-supplied timeout. Support every factual claim with one or more `path:start-end` line-range citations from those files. Do not inspect other files, modify files, run tests, or make external network requests. Keep the answer under 500 words.

Inspection protocol: use `read` with offsets/limits for source excerpts. If you use `bash`, use only one unchained `rg -n -F 'literal' FILE...`, `grep -n -F 'literal' FILE...`, `wc -l FILE...`, or `sha256sum FILE...` command, naming only the listed files. No pipes, semicolons, redirection, substitutions, regex alternation, `nl`, `awk`, or `sed`. Include this same inspection protocol in any scout task. For contract claims in the final answer, personally read the cited ranges after the scout completes.

Use exactly these headings:
- `Destructive-command flow`
- `Discovery-command flow`
- `Parent/subagent differences`
- `Citations`
