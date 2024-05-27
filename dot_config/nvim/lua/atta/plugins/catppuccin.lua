return {
	"catppuccin/nvim",
	name = "catppuccin",
	config = function()
		local catppuccin = require("catppuccin")

		catppuccin.setup({
			flavour = "mocha",
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
			integrations = {
				cmp = true,
				fern = true,
				telescope = true,
				lsp_saga = true,
				indent_blankline = {
					enabled = true,
				},
			},
		})

		vim.api.nvim_command("colorscheme catppuccin")
	end,
}
