local M = {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	dependencies = {
		"nvim-treesitter/nvim-treesitter-textobjects",
	},
}

function M.config()
	local treesitter_configs = require("nvim-treesitter.configs")

	treesitter_configs.setup({
		ensure_installed = "all",
		ignore_install = { "haskell", "phpdoc" },
		highlight = {
			enable = true,
		},
		indent = {
			enable = true,
		},
	})
end

return M
