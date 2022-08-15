local nightfox = require("nightfox")

local M = {}

function M.setup()
	nightfox.setup({})

	vim.cmd([[colorscheme carbonfox]])
	vim.cmd([[hi WinSeparator guibg=None]])
end

return M
