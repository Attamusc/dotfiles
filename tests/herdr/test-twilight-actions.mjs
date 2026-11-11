import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../dot_config/herdr-app/mods/twilight-actions/main.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace("export default class", "class");

function element(kind) {
  const node = { kind, children: [], props: {} };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === "child") target.children.push(args[0]);
        else if (key === "when") { if (args[0]) args[1](proxy); }
        else target.props[key] = args;
        return proxy;
      };
    },
  });
  return proxy;
}

function render(ready = null) {
  const calls = [];
  const palette = { chrome: "chrome", border: "border", dim: "dim", hover: "hover", foreground: "foreground", accent: "accent" };
  const context = {
    View: class {},
    div: () => element("div"),
    svg: path => Object.assign(element("svg"), { path }),
    h_flex: () => element("row"),
    theme: () => palette,
    updates: () => ({ app: { ready } }),
    run: (...args) => calls.push(args),
  };
  const root = vm.runInNewContext(`${source}\nnew TwilightActions().render();`, context);
  return { root, calls };
}

function buttons(root) {
  return Object.fromEntries(root.children.map(button => [button.props.id[0], button]));
}

test("rendering is inert; clicks retain the native Settings and Add machine actions", () => {
  const { root, calls } = render();
  assert.deepEqual(calls, []);
  const actions = buttons(root);
  assert.deepEqual(Object.keys(actions), ["settings", "add-machine"]);
  actions.settings.props.on_click[0]();
  actions["add-machine"].props.on_click[0]();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["app.settings"], ["mod.open", { name: "machine-add" }]]);
});

test("icon-only actions have tooltips, hover feedback, and pointer cursors", () => {
  const { root } = render();
  const actions = buttons(root);
  assert.equal(root.kind, "row");
  assert.ok(Object.hasOwn(root.props, "justify_end"));
  assert.equal(root.props.bg[0], "chrome");
  assert.equal(actions.settings.props.tooltip[0], "Settings");
  assert.equal(actions["add-machine"].props.tooltip[0], "Add machine");
  for (const [id, button] of Object.entries(actions)) {
    assert.ok(Object.hasOwn(button.props, "cursor_pointer"));
    assert.equal(button.props.h[0], 28);
    assert.equal(button.props.max_w[0], 28);
    assert.equal(button.props.min_w[0], 0);
    assert.ok(Object.hasOwn(button.props, "flex_1"));
    assert.equal(button.children.length, 1);
    assert.equal(button.children[0].path, `mods/workspace-chrome/${id === "settings" ? "settings" : "plus"}.svg`);
    assert.equal(button.children[0].props.size[0], 14);
    const hover = element("hover");
    button.props.hover[0](hover);
    assert.equal(hover.props.bg[0], "hover");
    assert.equal(hover.props.text_color[0], "foreground");
    assert.equal(button.props.on_mouse_down[0], "left");
    let stopped = false;
    button.props.on_mouse_down[1]({}, { stop_propagation: () => { stopped = true; } });
    assert.ok(stopped);
  }
});

test("the Settings update dot and tooltip follow the native app-ready state", () => {
  for (const ready of [null, "0.1.15"]) {
    const { root, calls } = render(ready);
    const settings = buttons(root).settings;
    assert.deepEqual(calls, []);
    assert.equal(settings.children.length, ready ? 2 : 1);
    assert.equal(settings.props.tooltip[0], ready ? "Settings · Update available" : "Settings");
    if (ready) {
      const dot = settings.children[1];
      assert.equal(dot.props.id[0], "update-ready");
      assert.equal(dot.props.bg[0], "accent");
      assert.equal(dot.props.size[0], 5);
      assert.ok(Object.hasOwn(dot.props, "absolute"));
    }
  }
});
