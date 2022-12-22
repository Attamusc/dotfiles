local M = {
	"glepnir/lspsaga.nvim",
	branch = "main",
}

function M.config()
	local saga = require("lspsaga")

	saga.init_lsp_saga({
		code_action_lightbulb = {
			virtual_text = false,
		},
		symbol_in_winbar = {
			enable = false,
		},
	})
end

return M
