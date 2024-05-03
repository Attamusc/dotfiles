local M = { "NeogitOrg/neogit", branch = "nightly", dependencies = "nvim-lua/plenary.nvim" }

function M.config()
	local neogit = require("neogit")

	neogit.setup({})
end

return M
