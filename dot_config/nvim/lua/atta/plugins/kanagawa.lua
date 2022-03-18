local M = {}

function M.setup()
	vim.cmd([[colorscheme kanagawa]])

	vim.cmd([[hi WinSeparator guibg=None]])
end

return M
