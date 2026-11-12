import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "dot_config/herdr-app"


def luminance(color):
    rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in rgb]
    return sum(value * weight for value, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(first, second):
    light, dark = sorted((luminance(first), luminance(second)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


def nodes(node):
    yield node
    for child in node.get("children", []):
        yield from nodes(child)


class TwilightTests(unittest.TestCase):
    def setUp(self):
        self.theme = json.loads((APP / "themes/twilight.json").read_text())
        self.layout = json.loads((APP / "layouts/hyrule-twilight.json").read_text())
        self.nodes = {node["id"]: node for node in nodes(self.layout)}
        self.mod = APP / "mods/twilight-actions"

    def test_theme_has_valid_terminal_colors_and_full_ansi_palette(self):
        self.assertEqual(len(self.theme["ansi"]), 16)
        colors = [self.theme[key] for key in ("background", "foreground", "selection", "cursor")]
        colors += self.theme["ansi"] + list(self.theme["colors"].values())
        for color in colors:
            self.assertRegex(color, r"^#[0-9a-f]{6}$")
        self.assertEqual(self.theme["background"], "#0d0e20")
        self.assertEqual(self.theme["colors"]["accent"], "#ff9b88")

    def test_text_and_status_colors_are_readable_on_chrome_and_terminal(self):
        colors = self.theme["colors"]
        for background in (self.theme["background"], colors["canvas"], colors["chrome"]):
            for key in ("foreground", "muted", "dim", "working", "blocked", "done", "idle"):
                with self.subTest(background=background, key=key):
                    self.assertGreaterEqual(contrast(colors[key], background), 4.5)
        self.assertGreaterEqual(contrast(colors["solid"], colors["solid_foreground"]), 4.5)
        self.assertEqual(len({colors[key] for key in ("working", "blocked", "done", "idle")}), 4)

    def test_personal_layout_keeps_workbench_roles_and_native_controls(self):
        self.assertFalse((APP / "layouts/jj-main.json").exists())
        self.assertEqual(self.layout["theme"], "twilight")
        self.assertEqual(self.layout["terminal_opacity"], 1)
        for role in ("spaces", "tabs", "files", "changes"):
            self.assertEqual(self.nodes[role]["content"], {"mod": "jj-workbench", "props": {"role": role}})
        self.assertEqual(self.nodes["brand"]["content"], {"mod": "workspace-chrome"})
        self.assertEqual(self.nodes["sidebar-footer"]["content"], {"mod": "twilight-actions"})
        self.assertEqual(self.nodes["sidebar-footer"]["size"], {"px": 36})
        self.assertEqual([node["id"] for node in self.nodes["sidebar"]["children"]], ["brand", "sidebar-lists", "sidebar-footer"])
        self.assertEqual(self.nodes["agents"]["content"], {"mod": "agents"})
        pane = self.nodes["main"]["content"]["pane"]
        self.assertEqual(pane["header"]["content"], {"mod": "pane"})
        self.assertEqual(pane["focus"], {"width": 1, "color": "accent"})
        self.assertTrue(self.nodes["panel"]["hidden"])
        self.assertNotIn("status", self.nodes)
        self.assertEqual([node["id"] for node in self.nodes["work"]["children"]], ["tabs", "work-body"])
        self.assertFalse(any(key in self.layout for key in ("font", "font_size", "ui_font")))

    def test_actions_are_explicitly_docked_and_have_no_machine_or_network_execution(self):
        self.assertEqual(json.loads((self.mod / "mod.json").read_text()), {"place": "none"})
        source = (self.mod / "main.js").read_text()
        imports = re.findall(r'import .* from "([^"]+)";', source)
        self.assertEqual(imports, ["gpui-kit", "gpui-base", "herdr"])
        self.assertNotRegex(source, r"\b(exec|fetch|hc|setShared|writeTextFile|setTimeout|setInterval)\s*\(")
        self.assertNotIn("cx.timer", source)
        self.assertNotIn(".init(", source)

    def test_redundant_header_and_artwork_are_removed(self):
        self.assertNotIn("twilight-workspace", self.nodes)
        self.assertFalse((APP / "mods/twilight-workspace").exists())
        for path in (self.mod / "main.js", APP / "themes/twilight.json"):
            self.assertNotRegex(path.read_text().lower(), r"zelda|hyrule|triforce|sheikah|zonai")


if __name__ == "__main__":
    unittest.main()
