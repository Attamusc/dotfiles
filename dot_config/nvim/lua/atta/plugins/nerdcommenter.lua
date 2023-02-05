local g = vim.g

local M = {
	"numToStr/Comment.nvim",
}

function M.config()
	local comment = require("Comment")
	comment.setup()
end

return M
