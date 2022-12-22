local g = vim.g

local M = {
	"mhinz/vim-signify",
}

function M.config()
	g.signify_priority = 0
end

return M
