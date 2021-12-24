local M = {}

function M.setup()
	vim.g.rose_pine_variant = "moon"
	vim.g.rose_pine_disable_italics = true
	vim.cmd([[colorscheme rose-pine]])
end

return M
