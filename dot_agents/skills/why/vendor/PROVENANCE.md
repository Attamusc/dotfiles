# Vendored Markdown projection dependencies

## Marked

- Version: 18.0.5
- Upstream commit: `4063c638cb621c09091d41b26f323ff074416bb9`
- Source: https://registry.npmjs.org/marked/-/marked-18.0.5.tgz
- Vendored file: `marked-18.0.5/marked.esm.js` (the unmodified production ESM bundle)
- License: MIT; retained at `marked-18.0.5/LICENSE`

The standalone `why` analyzer cannot depend on ambient `node_modules`. Its bounded adapter imports this pinned bundle directly and exposes only visible-text projection.

## HTML character references

`html5-entities.json` was deterministically generated from CPython 3.13.7's `html.entities.html5` table, source identity `https://github.com/python/cpython/blob/v3.13.7/Lib/html/entities.py` (immutable `v3.13.7` release tag). Its immutable generated SHA-256 is `0155d7c70a78db0554d8482f86017ad4c2ba9afec237399819d1f560dea33218`.

Regenerate with: `python3 -c 'import html.entities,json,sys; sys.stdout.write(json.dumps(html.entities.html5, ensure_ascii=False, sort_keys=True, separators=(",", ":")))' > html5-entities.json` (run with the pinned CPython source above). Python documents that table as the HTML 5 named character references defined by the WHATWG HTML standard: https://html.spec.whatwg.org/multipage/named-characters.html. Both semicolon and standard legacy semicolonless spellings are retained. CPython is PSF-2.0 licensed; the WHATWG HTML Standard is covered by the WHATWG copyright/license terms. The generated JSON contains data only; the decoder is local code in `scripts/markdown-projection.mjs`.
