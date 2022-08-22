local wezterm = require("wezterm")

return {
  audible_bell = "Disabled",
  visual_bell = {
    fade_in_duration_ms = 75,
    fade_out_duration_ms = 75,
    target = 'CursorColor',
  },
  use_fancy_tab_bar = false,
  color_scheme = "carbonfox",
  font = wezterm.font("MonoLisa NF", {
    weight = "Light"
  }),
  font_size = 16.0
}
