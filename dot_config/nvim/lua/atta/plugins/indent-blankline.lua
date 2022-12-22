local M = {
	"lukas-reineke/indent-blankline.nvim",
	event = "BufReadPre",
}

function M.config()
	local indent_blankline = require("indent_blankline")

	vim.opt.list = true

	indent_blankline.setup({
		space_char_blankline = " ",
		show_current_context = true,
		show_current_context_start = false,
		show_trailing_blankline_indent = false,
		buftype_exclude = { "terminal", "telescope" },
	})
end

return M
