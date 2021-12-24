local lualine = require("lualine")
local lspstatus = require("lsp-status")

local M = {}

function M.setup()
	lspstatus.register_progress()

	local fern = {
		sections = {
			lualine_a = { "[[Fern]]" },
		},
		filetypes = { "fern" },
	}

	lualine.setup({
		options = {
			icons_enabled = true,
			theme = "rose-pine",
			component_separators = { "", "" },
			section_separators = { "", "" },
			disabled_filetypes = {},
		},
		sections = {
			lualine_a = { "mode" },
			lualine_b = { "branch", "diff" },
			lualine_c = { "filename", "require('lsp-status').status()" },
			lualine_x = { "encoding", "fileformat", "filetype" },
			lualine_y = { "progress" },
			lualine_z = { "location" },
		},
		inactive_sections = {
			lualine_a = {},
			lualine_b = {},
			lualine_c = { "filename" },
			lualine_x = { "location" },
			lualine_y = {},
			lualine_z = {},
		},
		tabline = {},
		extensions = { fern, "fugitive" },
	})
end

return M
