local g = vim.g

local M = {
	"preservim/nerdcommenter",
}

function M.config()
	local utils = require("atta.utils")

	g.NERDCreateDefaultMappings = 0
	g.NERDSpaceDelims = 1
	g.NERDToggleCheckAllLines = 1

	utils.map("", "<leader>c<space>", "<plug>NERDCommenterToggle")
	utils.map("", "<leader>cc", "<plug>NERDCommenterComment")
end

return M
