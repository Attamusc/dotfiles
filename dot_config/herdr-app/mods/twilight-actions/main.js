import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, updates } from "herdr";

export default class TwilightActions extends View {
  render() {
    const t = theme();
    const ready = Boolean(updates().app.ready);
    const button = (id, icon, label, action) =>
      div().id(id).relative().h(28).max_w(28).min_w(0).flex_1()
        .flex().items_center().justify_center().rounded(6)
        .text_color(t.dim).cursor_pointer().tooltip(label)
        .hover(el => el.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click(action)
        .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none());

    return h_flex().size_full().items_center().justify_end().gap(2).bg(t.chrome)
      .border_t(1).border_color(t.border)
      .child(button("settings", "settings", ready ? "Settings · Update available" : "Settings",
        () => run("app.settings"))
        .when(ready, el => el.child(div().id("update-ready").absolute().top(3).right(3)
          .size(5).rounded_full().bg(t.accent))))
      .child(button("add-machine", "plus", "Add machine",
        () => run("mod.open", { name: "machine-add" })));
  }
}
