local M = {
	"nvim-pack/nvim-spectre",
}

function M.config()
	require("spectre").setup()

	local utils = require("atta.utils")
	local noremap = utils.noremap

	noremap("n", "<leader>sr", function()
		require("spectre").open()
	end)
end

return M
