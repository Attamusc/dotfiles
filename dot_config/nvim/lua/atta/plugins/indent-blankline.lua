local M = {
	"lukas-reineke/indent-blankline.nvim",
	event = "BufReadPre",
}

function M.config()
	local indent_blankline = require("ibl")

	indent_blankline.setup()
end

return M
