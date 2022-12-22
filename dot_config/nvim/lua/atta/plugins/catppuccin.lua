local M = {
	"catppuccin/nvim",
	name = "catppuccin",
}

function M.config()
	local catppuccin = require("catppuccin")

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
