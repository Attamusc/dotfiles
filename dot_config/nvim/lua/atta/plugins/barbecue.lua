local M = {
	"utilyre/barbecue.nvim",
	name = "barbecue",
	version = "*",
	dependencies = {
		"SmiteshP/nvim-navic",
		"nvim-tree/nvim-web-devicons",
	},
}

function M.config()
	local barbecue = require("barbecue")

	barbecue.setup()
end

return M
