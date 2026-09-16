"""Shared canonical secret and redaction vocabulary for bounded session tooling."""
import re

SECRET_PATTERNS = (
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("authorization", re.compile(r"(?i)\b(?:bearer|basic)\s+[A-Za-z0-9+/._~=-]{8,}")),
    ("token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{12,})\b")),
    ("url-credential", re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s/@:]*:[^\s/@]+@")),
    ("environment-secret", re.compile(r"(?i)\b(?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|ACCESS_KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*=\s*(?:\"(?:\\.|[^\"\\])*\"|'[^']*'|(?:\\.|[^\s])+)") ),
)
REDACTION_MARKER = re.compile(r"\[REDACTED:[^\]\r\n]+\]")


def contains_private_text(text):
    return bool(REDACTION_MARKER.search(text) or any(pattern.search(text) for _kind, pattern in SECRET_PATTERNS))


def redact(text, counts):
    for kind, pattern in SECRET_PATTERNS:
        def replacement(_match, redaction_kind=kind):
            counts[redaction_kind] = counts.get(redaction_kind, 0) + 1
            return f"[REDACTED:{redaction_kind}]"
        text = pattern.sub(replacement, text)
    return text
