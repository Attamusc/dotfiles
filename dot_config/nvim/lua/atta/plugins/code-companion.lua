return {
	"olimorris/codecompanion.nvim",
	dependencies = {
		"nvim-lua/plenary.nvim",
		"nvim-treesitter/nvim-treesitter",
	},
	opts = {
		strategies = {
			chat = {
				adapter = "copilot",
				roles = {
					user = "attamusc",
				},
				tools = {
					["mcp"] = {
						-- calling it in a function would prevent mcphub from being loaded before it's needed
						callback = function()
							return require("mcphub.extensions.codecompanion")
						end,
						description = "Call tools and resources from the MCP Servers",
					},
				},
			},
		},
	},
	keys = {
		{ "<leader>cc", "<cmd>CodeCompanionChat Toggle<CR>", { desc = "Toggle CodeCompanion" } },
	},
}
