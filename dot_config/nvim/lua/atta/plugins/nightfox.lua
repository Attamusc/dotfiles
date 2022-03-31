local nightfox = require("nightfox")

local M = {}

function M.setup()
	nightfox.setup({})

	vim.cmd([[colorscheme duskfox]])
	vim.cmd([[hi WinSeparator guibg=None]])
end

return M
