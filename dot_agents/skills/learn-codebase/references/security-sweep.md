# Security & Smell Sweep

Scan the codebase for things that look **shady, fishy, or dangerous**. This isn't a full audit — it's a quick sweep to surface anything the user should be aware of. Flag real concerns, not hypotheticals.

## What to Scan

Run these checks and report anything suspicious:

**Hardcoded Secrets & Credentials**
```bash
# Look for hardcoded secrets, API keys, tokens, passwords
rg -i --hidden -g '!{.git,node_modules,dist,build,.next,vendor,*.lock}' \
  '(api[_-]?key|secret|token|password|credential|auth)\s*[:=]\s*["\x27][^"\x27]{8,}' \
  --type-not binary -l 2>/dev/null | head -20

# .env files committed to repo (should be gitignored)
git ls-files --cached | grep -iE '\.env($|\.)' 2>/dev/null
```

**Insecure Code Patterns**
```bash
# eval(), exec(), dangerouslySetInnerHTML, innerHTML assignments, shell injection vectors
rg --hidden -g '!{.git,node_modules,dist,build,.next,vendor,*.lock}' \
  -e '\beval\s*\(' -e '\bexec\s*\(' -e 'dangerouslySetInnerHTML' \
  -e '\.innerHTML\s*=' -e 'child_process' -e '\$\(.*\$\{' \
  --type-not binary -l 2>/dev/null | head -20

# Unparameterized SQL (string concatenation in queries)
rg --hidden -g '!{.git,node_modules,dist,build,.next,vendor,*.lock}' \
  -e 'query\s*\(\s*[`"'"'"'].*\$\{' -e 'execute\s*\(\s*[`"'"'"'].*\+' \
  --type-not binary -l 2>/dev/null | head -20
```

**Suspicious Dependencies**
```bash
# Check for install/postinstall scripts in dependencies (supply chain risk)
[ -f package.json ] && cat package.json | grep -E '"(pre|post)install"' 2>/dev/null

# Look for wildcard or git dependencies (unpinned)
[ -f package.json ] && rg '"[*]"|"git[+:]|"github:' package.json 2>/dev/null

# Very outdated lock file vs package.json mismatch
[ -f package-lock.json ] && [ package.json -nt package-lock.json ] && echo "WARN: package.json newer than lockfile"
[ -f pnpm-lock.yaml ] && [ package.json -nt pnpm-lock.yaml ] && echo "WARN: package.json newer than lockfile"
```

**Overly Permissive Configurations**
```bash
# CORS wildcards, disabled security headers, permissive CSP
rg --hidden -g '!{.git,node_modules,dist,build,.next,vendor,*.lock}' \
  -e "origin:\s*['\"]?\*" -e 'Access-Control-Allow-Origin.*\*' \
  -e "cors.*true" -e 'unsafe-inline' -e 'unsafe-eval' \
  --type-not binary -l 2>/dev/null | head -10

# Disabled TLS verification, insecure flags
rg --hidden -g '!{.git,node_modules,dist,build,.next,vendor,*.lock}' \
  -e 'NODE_TLS_REJECT_UNAUTHORIZED.*0' -e 'rejectUnauthorized.*false' \
  -e 'verify.*false' -e 'insecure.*true' \
  --type-not binary -l 2>/dev/null | head -10
```

**File Permissions & Sensitive Files**
```bash
# Private keys, certificates, or database files in repo
git ls-files --cached 2>/dev/null | grep -iE '\.(pem|key|p12|pfx|jks|keystore|sqlite|db)$' | head -10

# Check .gitignore exists and covers basics
if [ -f .gitignore ]; then
  for pattern in '.env' 'node_modules' '.DS_Store'; do
    grep -q "$pattern" .gitignore || echo "WARN: .gitignore missing $pattern"
  done
else
  echo "WARN: No .gitignore file found"
fi
```

## How to Report

Present findings in a dedicated section with severity tags. Be direct — no sugarcoating, but also no false alarms.

```
## Security & Code Smell Findings

### [P0] Hardcoded API key in src/config.ts
Line 42 has a Stripe secret key directly in source code.
This should be in an environment variable, not committed.

### [P1] .env file tracked by git
`.env.production` is committed and contains database credentials.
Add to `.gitignore` and rotate the exposed credentials.

### [P2] eval() usage in src/utils/parser.ts
Used to parse user-supplied expressions. Consider a safe parser
like `JSON.parse()` or a sandboxed evaluator instead.

### Nothing Concerning
[If sweep is clean, say so explicitly — don't manufacture findings.]
```

**Severity guide (same as review rubric):**
- **[P0]** — Actively dangerous. Exposed secrets, SQL injection, RCE vectors. Fix now.
- **[P1]** — Genuine risk. Someone will get bitten by this. Should fix soon.
- **[P2]** — Worth knowing about. Not urgent, but the user should be aware.

**Do NOT flag:**
- Test files using eval/exec for testing purposes
- Known development-only insecure configs (like localhost CORS in dev servers)
- Theoretical issues with no concrete exploit path in this codebase
- Dependencies that are simply old (that's not a security finding without a known CVE)
