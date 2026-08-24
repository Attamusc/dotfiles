# Large-log summarization

## Model prompt (use verbatim)

Inspect only this frozen file:
- `research/context-efficiency/corpus/large-log/portability-run.log`

Summarize the run sequence, identify the cause of each failed run, describe the correction and final successful verification, and state the fixture provenance. Separate relevant events from heartbeat noise. Support every factual claim with one or more `path:start-end` line-range citations from that file. Do not inspect other files, modify files, run tests, or make external network requests. Keep the answer under 400 words.

Inspection protocol: use `read` with offsets/limits for source excerpts. If you use `bash`, use only one unchained `rg -n -F 'literal' FILE...`, `grep -n -F 'literal' FILE...`, `wc -l FILE...`, or `sha256sum FILE...` command, naming only the listed files. No pipes, semicolons, redirection, substitutions, regex alternation, `nl`, `awk`, or `sed`. Include this same inspection protocol in any scout task. For contract claims in the final answer, personally read the cited ranges after the scout completes.

Use exactly these headings:
- `Timeline`
- `Root causes and correction`
- `Final outcome`
- `Provenance`
- `Citations`
