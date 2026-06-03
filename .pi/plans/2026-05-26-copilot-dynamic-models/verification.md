# Verification Report — github-copilot-dynamic Extension

**Date:** 2026-05-26
**pi version:** 0.75.5
**Extension:** `~/.pi/agent/extensions/github-copilot-dynamic/index.ts`

## ⚠️ Headline Finding

**The extension is a no-op on this account at pi 0.75.5.** pi-ai's static
`models.generated.js` already ships all 20 github-copilot models that the live
`/models` endpoint returns for this Copilot subscription. The static and dynamic
lists are identical.

The original issue (#4599) was filed against pi 0.74.0 with only ~9 static
Copilot models. The "bigrefactor" the maintainer mentioned in the issue
comments has since landed and expanded the static list to 20 — covering this
account's full entitlement.

**Decision implication:** the extension still has value as future-proofing
(subscription drift, new models gated to specific accounts before pi-ai
updates), but it provides no visible benefit on this account right now.

## Counts

| Configuration | github-copilot count |
|---|---|
| Extension removed entirely (mv'd out of `~/.pi/agent/extensions/`) | 20 |
| Extension active (happy path) | 20 |
| auth.json absent | 0 (pi can't list copilot without auth, expected) |
| auth.json present, github-copilot key removed | 0 (same) |

pi-ai's static `MODELS` registry was independently verified via:

```js
node -e "const {MODELS} = require('.../pi-ai/dist/models.generated.js');
         console.log(Object.keys(MODELS['github-copilot']))"
// → 20 model ids, identical to the runtime list
```

## ISC Results

| ISC | Description | Result |
|---|---|---|
| ISC-12 | dynamic count ≥ static count | ✅ PASS (20 ≥ 20, trivially) |
| ISC-13 | Missing `auth.json` → stderr warning + clean fallback | ✅ PASS — warning fired, no crash |
| ISC-14 | Missing `github-copilot` key in auth.json → stderr warning + clean fallback | ✅ PASS — warning fired, no crash |
| ISC-15 | JWT refresh failure → warning + fallback | ⏭ Not simulated (would require auth tampering; covered transitively by error-path code review) |
| ISC-16 | `/models` fetch failure → warning + fallback | ⏭ Not simulated (would require code edit to point at invalid URL) |
| ISC-17 | Empty filtered list → don't wipe static | ⏭ Not simulated (guarded in code) |
| chezmoi verify | source tree matches deployed state | ✅ PASS (exit 0) |
| Happy-path stderr silence | No `[github-copilot-dynamic]` warnings on success | ✅ PASS |

## Failure-Mode Output Captured

```
ISC-13 stderr: [github-copilot-dynamic] no github-copilot credentials in auth.json, skipping dynamic discovery
ISC-14 stderr: [github-copilot-dynamic] no github-copilot credentials in auth.json, skipping dynamic discovery
```

Both warnings use the LOG_PREFIX correctly. No throws, pi continued startup
cleanly in both cases.

## Auth Restoration

Confirmed `~/.pi/agent/auth.json` is intact after all simulations:

```
$ jq 'keys' ~/.pi/agent/auth.json
[ "github-copilot" ]
```

## Conclusion

The extension is **correct and safe**: happy path runs silently, all tested
failure modes produce a single stderr warning and degrade to the static
fallback without crashing pi.

It is **currently dormant** in terms of user-visible value because pi 0.75.5's
static list already matches this account's live entitlement. Recommend keeping
it deployed as cheap insurance against future drift (new preview models, gated
features) but lower its priority in the dotfiles — it's not delivering a unique
benefit today.

Open follow-ups (not blockers):
- If pi ships its own dynamic discovery upstream, this extension becomes
  redundant — watch the issue for status.
- If the user gains access to a model that doesn't appear in `pi --list-models`,
  this extension should surface it automatically — that will be the first real
  test.
