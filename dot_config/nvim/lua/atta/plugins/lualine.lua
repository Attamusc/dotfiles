local M = {
	"nvim-lualine/lualine.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons", lazy = true },
}

local function telescope_label()
	return [[Telescope]]
end

local telescope = {
	sections = {
		lualine_a = { telescope_label },
	},
	filetypes = { "TelescopePrompt" },
}

function M.config()
	local lualine = require("lualine")

	lualine.setup({
		options = {
			globalstatus = true,
			icons_enabled = true,
			theme = "auto",
			component_separators = { left = "", right = "" },
			section_separators = { left = "", right = "" },
			disabled_filetypes = {},
		},
		sections = {
			lualine_a = { {
				"mode",
				fmt = function(str)
					return str:sub(1, 1)
				end,
			} },
			lualine_b = { "branch", "diff", { "diagnostics", sources = { "nvim_lsp" } } },
			lualine_c = { "filename" },
			lualine_x = {},
			lualine_y = { "filetype", "progress" },
			lualine_z = { "location" },
		},
		winbar = {},
		tabline = {},
		extensions = { telescope, "fern", "fugitive" },
	})
end

return M
