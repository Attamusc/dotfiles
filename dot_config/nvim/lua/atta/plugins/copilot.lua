return {
	"zbirenbaum/copilot.lua",
	event = "VeryLazy",
	dependencies = {
		"zbirenbaum/copilot-cmp",
	},
	config = function()
		require("copilot").setup()
		require("copilot_cmp").setup()
	end,
}
