local M = {
	-- Co-pilot
	"zbirenbaum/copilot.lua",
	event = "VeryLazy",
	dependencies = {
		"zbirenbaum/copilot-cmp",
	},
}

function M.config()
	require("copilot").setup()
	require("copilot_cmp").setup()
end

return M
