return {
	"catppuccin/nvim",
	name = "catppuccin",
	priority = 1000,
	opts = {
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
	},
	config = function()
		vim.cmd.colorscheme("catppuccin")
	end,
}
