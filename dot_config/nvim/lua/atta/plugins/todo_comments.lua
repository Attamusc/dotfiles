local M = {
	"folke/todo-comments.nvim",
	branch = "main",
}

function M.config()
	local todo_comments = require("todo-comments")

	todo_comments.setup()
end

return M
