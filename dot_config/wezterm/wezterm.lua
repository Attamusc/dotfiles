local wezterm = require("wezterm")

local config = {
	use_fancy_tab_bar = false,
	color_scheme = "Catppuccin Mocha",
}

-- Fonts
local font = 'MonoLisa'
config.font_size = 14.0;
config.font = wezterm.font_with_fallback({
	{ family = font, weight = 'Light', italic = false },
  { family = 'Apple Color Emoji' },
  { family = 'Symbols Nerd Font Mono', scale = 1 },
})
config.font_rules = {
	{
		intensity = 'Bold',
		font = wezterm.font_with_fallback({
			{ family = font, weight = 'Regular', italic = false },
			{ family = 'Apple Color Emoji' },
			{ family = 'Symbols Nerd Font Mono', scale = 1 },
		}),
  }
}

-- Disable font ligatures
config.harfbuzz_features = { 'calt=1', 'clig=0', 'liga=0', 'zero', 'ss01' }

config.window_frame = {
	font = wezterm.font { family = font, weight = 'Regular' },
	font_size = 14.0,
	-- Fancy tab bar
	active_titlebar_bg = '#574131',
	inactive_titlebar_bg = '#352a21',
}

-- Command Palette
config.command_palette_rows = 7
config.command_palette_font_size = 15
config.command_palette_bg_color = "#44382D"
config.command_palette_fg_color = "#c4a389"

-- Bell
config.audible_bell = "Disabled";
config.visual_bell = {
	target = "CursorColor",
	fade_in_function = "EaseIn",
	fade_in_duration_ms = 150,
	fade_out_function = "EaseOut",
	fade_out_duration_ms = 300,
}

-- Misc
config.adjust_window_size_when_changing_font_size = false
config.bold_brightens_ansi_colors = 'No'
config.default_cwd = wezterm.home_dir
config.hyperlink_rules = wezterm.default_hyperlink_rules()
config.inactive_pane_hsb = { saturation = 1.0, brightness = 0.8}
config.scrollback_lines = 10000
config.show_new_tab_button_in_tab_bar = false
config.switch_to_last_active_tab_when_closing_tab = true
config.tab_max_width = 60
config.window_close_confirmation = 'NeverPrompt'

local function get_current_working_dir(tab)
	local current_dir = tab.active_pane and tab.active_pane.current_working_dir or { file_path = '' }
	local HOME_DIR = string.format('file://%s', os.getenv('HOME'))

	return current_dir == HOME_DIR and '.'
	or string.gsub(current_dir.file_path, '(.*[/\\])(.*)', '%2')
end

-- Set tab title to the one that was set via `tab:set_title()`
-- or fall back to the current working directory as a title
wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
	local index = tonumber(tab.tab_index) + 1
	local custom_title = tab.tab_title
	local title = get_current_working_dir(tab)

	if custom_title and #custom_title > 0 then
		title = custom_title
	end

	return string.format('  %s•%s  ', index, title)
end)

-- Set window title to the current working directory
wezterm.on('format-window-title', function(tab, pane, tabs, panes, config)
	return get_current_working_dir(tab)
end)

-- Set the correct window size at the startup
wezterm.on('gui-startup', function(cmd)
	local active_screen = wezterm.gui.screens()["active"]
	local _, _, window = wezterm.mux.spawn_window(cmd or {})

	-- MacBook Pro 14" 2023
	if active_screen.width <= 3024 then
		-- Laptop: open full screen
		window:gui_window():maximize()
	else
		-- Desktop: place on the right half of the screen
		window:gui_window():set_position(active_screen.width / 4, 0)
		window:gui_window():set_inner_size(active_screen.width / 2, active_screen.height)
	end
end)

return config
