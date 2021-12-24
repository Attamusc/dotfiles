local g = vim.g

local utils = require("atta.utils")

local M = {}

function M.setup()
	g.NERDCreateDefaultMappings = 0
	g.NERDSpaceDelims = 1
	g.NERDToggleCheckAllLines = 1

	utils.map("", "<leader>c<space>", "<plug>NERDCommenterToggle")
	utils.map("", "<leader>cc", "<plug>NERDCommenterComment")
end

return M
