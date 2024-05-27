return {
	"saecki/crates.nvim",
	ft = { "rust", "toml" },
	config = function()
		local crates = require("crates")

		crates.setup()
		crates.show()
	end,
}
