import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { focused, spaces, theme } from "herdr";

export default class TwilightWorkspace extends View {
  init() {
    this.compact = false;
  }

  render() {
    const t = theme();
    const space = spaces().find(space => space.id === focused()?.space);

    return div().id("twilight-workspace").size_full().relative().overflow_hidden()
      .border_b(1).border_color(t.border)
      .on_size_change((size, cx) => {
        const compact = size.width < 160;
        if (compact !== this.compact) {
          this.compact = compact;
          cx.notify();
        }
      })
      .when(!this.compact, el => el.child(
        v_flex().relative().size_full().justify_end().px(18).pb(18).gap(6)
          .child(div().text_size(10).text_color(t.muted).truncate()
            .child(space?.machine ? `${space.machine} workspace` : "Local workspace"))
          .child(div().text_size(23).font_semibold().text_color(t.foreground).truncate()
            .child(space ? space.name : "No workspace"))
      ));
  }
}
