local M = {
	"kylechui/nvim-surround",
}

function M.config()
	local nvim_surround = require("nvim-surround")

	nvim_surround.setup({})
end

return M
