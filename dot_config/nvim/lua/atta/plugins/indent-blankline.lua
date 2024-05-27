return {
	"lukas-reineke/indent-blankline.nvim",
	event = "BufReadPre",
	dependencies = {
		"https://gitlab.com/HiPhish/rainbow-delimiters.nvim",
	},
	config = function()
		local indent_blankline = require("ibl")
		local ibl_hooks = require("ibl.hooks")
		local rainbow_delimiters = require("rainbow-delimiters.setup")

		local highlight = {
			"RainbowRed",
			"RainbowYellow",
			"RainbowBlue",
			"RainbowOrange",
			"RainbowGreen",
			"RainbowViolet",
			"RainbowCyan",
		}

		ibl_hooks.register(ibl_hooks.type.HIGHLIGHT_SETUP, function()
			vim.api.nvim_set_hl(0, "RainbowRed", { fg = "#E06C75" })
			vim.api.nvim_set_hl(0, "RainbowYellow", { fg = "#E5C07B" })
			vim.api.nvim_set_hl(0, "RainbowBlue", { fg = "#61AFEF" })
			vim.api.nvim_set_hl(0, "RainbowOrange", { fg = "#D19A66" })
			vim.api.nvim_set_hl(0, "RainbowGreen", { fg = "#98C379" })
			vim.api.nvim_set_hl(0, "RainbowViolet", { fg = "#C678DD" })
			vim.api.nvim_set_hl(0, "RainbowCyan", { fg = "#56B6C2" })
		end)
		ibl_hooks.register(ibl_hooks.type.SCOPE_HIGHLIGHT, ibl_hooks.builtin.scope_highlight_from_extmark)

		rainbow_delimiters.setup({ highlight = highlight })
		indent_blankline.setup({ scope = { show_start = false, show_end = false, highlight = highlight } })
	end,
}
