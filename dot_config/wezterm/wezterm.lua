local wezterm = require("wezterm")

return {
	audible_bell = "Disabled",
	visual_bell = {
		fade_in_duration_ms = 75,
		fade_out_duration_ms = 75,
		target = "CursorColor",
	},
	use_fancy_tab_bar = false,
	color_scheme = "Catppuccin Macchiato",
	font = wezterm.font({
		family = "Cartograph CF",
		weight = "Light",
		harfbuzz_features = { "calt=0", "clig=0", "liga=0" },
	}),
	font_size = 16.0,
}
