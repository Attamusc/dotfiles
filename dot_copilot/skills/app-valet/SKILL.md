# App Valet Skill

Build native macOS desktop apps with HTML/CSS/JS UIs rendered in WKWebView.
Use when building or modifying apps in a `~/.valet/apps/<app>/` directory,
or when the user mentions App Valet, `valet new`, `valet build`, etc.

Triggers: 'valet', 'app valet', 'desktop app', 'macOS app', 'WKWebView app',
'native app from HTML'.

## Environment

Apps run in a **macOS WKWebView** (Safari/WebKit engine). The Swift wrapper
compiles to a ~100KB native `.app` bundle.

### Directory Structure

```
~/.valet/apps/<app-slug>/
├── wrapper.swift              # Native wrapper (DO NOT modify)
├── Info.plist                 # Bundle metadata (DO NOT modify)
├── valet.json                 # App config
├── app/                       # ← YOUR CODE GOES HERE
│   ├── index.html             # Entry point (loaded by wrapper)
│   ├── styles.css             # Custom styles
│   └── main.js                # Application logic
└── build/                     # Compiled .app bundle (auto-generated)
```

**Only edit files in `app/`.** The wrapper and Info.plist are managed by valet.

## Styling

- **Tailwind CSS** is loaded via CDN in `index.html` — use Tailwind classes.
- The Tailwind config uses `darkMode: 'media'` and extends the font family
  with `-apple-system` for native macOS look.
- Custom styles go in `app/styles.css`.
- Always support **light and dark mode** via `prefers-color-scheme` media query
  or Tailwind's `dark:` variant.
- Use the system font stack (already configured).

## Bridge APIs (`window.valet.*`)

All bridge methods return Promises. Use with `await`:

```javascript
// Notifications
await window.valet.notify('Title', 'Body text');

// Clipboard
const text = await window.valet.clipboard.read();
await window.valet.clipboard.write('copied text');

// Persistent key/value store (survives app restarts)
await window.valet.store.set('key', 'value');
const val = await window.valet.store.get('key');  // returns string or null

// File I/O
const content = await window.valet.readFile('/absolute/path');
await window.valet.writeFile('/absolute/path', 'content');

// Open URL in default browser
await window.valet.openURL('https://example.com');

// Quit the app
window.valet.quit();
```

## Constraints

- **WebKit only** — no Chrome/Firefox APIs. Test against Safari behavior.
- **No Node.js / npm / build step** — pure HTML/CSS/JS, no bundlers.
- **No external dependencies** beyond CDN links (Tailwind is pre-loaded).
- **Single page** — the wrapper loads `app/index.html`. Use JS for routing.
- **No `file://` fetch** — use `window.valet.readFile()` instead.
- `window.valet` is injected at document start and available immediately.

## Design Guidelines

- Match macOS aesthetic: clean, spacious, subtle shadows, rounded corners.
- Use `rounded-lg` or `rounded-xl` for cards/containers.
- Prefer `neutral` color palette from Tailwind for backgrounds/text.
- Use accent colors sparingly for interactive elements.
- Respect dark mode — never hard-code light-only colors.
- Padding: generous (p-4 to p-8). Don't crowd the UI.
- Animations: subtle, short duration (150-300ms). Use `transition-all`.

## Templates

Apps are created from templates via `valet new --template <type>`. Each template
provides a different window style and wrapper. The template type is stored in
`valet.json` as the `template` field.

### `default` — Standard Window App
- Standard macOS window with title bar, close/minimize/maximize buttons.
- Appears in the Dock.
- Default size: 800x600, resizable.
- Best for: full apps, tools, editors, viewers.

### `menubar` — Menu Bar App
- Lives in the macOS menu bar (status item). No Dock icon.
- Click the status item to toggle a popover panel containing the WebView.
- `valet.json` fields: `popoverWidth` (360), `popoverHeight` (480),
  `statusItemIcon` (SF Symbol name, default "app.badge").
- Design for a narrow, tall panel. Avoid horizontal scrolling.
- `LSUIElement = true` in Info.plist.
- Best for: quick-access utilities, monitors, mini-dashboards.

### `dashboard` — Dashboard Widget
- Borderless window, no title bar, no window controls.
- Always-on-top (floating level). No Dock icon.
- Hold **Cmd+drag** to reposition the window.
- `valet.json` fields: `windowWidth` (400), `windowHeight` (300),
  `cornerRadius` (12), `transparent` (false).
- Window position auto-saved/restored.
- **Must include a quit mechanism** in the UI (no window close button).
- Design for compact, glanceable information. Think "desktop widget."
- Best for: weather, clocks, status monitors, music controllers.

### `utility` — Utility Panel
- Thin utility-style title bar (smaller than standard). Closable + resizable.
- Floats above normal windows. No Dock icon.
- `valet.json` fields: `windowWidth` (320), `windowHeight` (420).
- Window stays visible when app loses focus.
- Min size: 200x150. Window size auto-saved/restored.
- Best for: tool palettes, color pickers, inspector panels, settings.

## CLI Commands

```
valet new [--name "Name"] [--template <type>] "<description>"
valet iterate <app> "<changes>"
valet build <app>
valet open <app>
valet list
valet templates
valet edit <app>
valet kill <app>
valet watch <app>
valet install <app>
valet export <app> [output-path]
valet remove <app>
```
