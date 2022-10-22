local catppuccin = require("catppuccin")

local M = {}

function M.setup()
	catppuccin.setup({
		flavour = "macchiato",
		styles = {
			comments = { "italic" },
			conditionals = {},
			loops = {},
			functions = {},
			keywords = {},
			strings = {},
			variables = {},
			numbers = {},
			booleans = {},
			properties = {},
			types = {},
			operators = {},
		},
	})

	vim.api.nvim_command("colorscheme catppuccin")
end

return M
