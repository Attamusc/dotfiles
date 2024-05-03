local M = {
	"saecki/crates.nvim",
	ft = { "rust", "toml" },
}

function M.config()
	local crates = require("crates")

	crates.setup()
	crates.show()
end

return M
