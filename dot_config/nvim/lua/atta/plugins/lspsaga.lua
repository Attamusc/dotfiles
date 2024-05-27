return {
	"nvimdev/lspsaga.nvim",
	event = "LspAttach",
	config = function()
		local saga = require("lspsaga")
		local utils = require("atta.utils")
		local catppuccin = require("catppuccin.groups.integrations.lsp_saga")
		local cmd = vim.cmd

		saga.setup({
			ui = {
				title = false,
				colors = catppuccin.custom_colors(),
				kind = catppuccin.custom_kind(),
			},
			lightbulb = {
				virtual_text = false,
			},
			symbol_in_winbar = {
				enable = false,
			},
		})

		-- definition mappings
		utils.noremap("n", "gd", "<cmd>Lspsaga goto_definition<CR>", { silent = true })

		-- hover docs
		utils.noremap("n", "K", "<cmd>Lspsaga hover_doc<CR>", { silent = true })

		-- code action
		utils.noremap({ "n", "v" }, "<leader>a", "<cmd>Lspsaga code_action<CR>", { silent = true })

		-- diagnostics
		utils.noremap("n", "<leader>cd", "<cmd>Lspsaga show_line_diagnostics<CR>", { silent = true })
		utils.noremap("n", "[e", "<cmd>Lspsaga diagnostic_jump_prev<CR>", { silent = true })
		utils.noremap("n", "]e", "<cmd>Lspsaga diagnostic_jump_next<CR>", { silent = true })

		cmd([[autocmd CursorHold * Lspsaga show_cursor_diagnostics ++unfocus]])
	end,
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
		"nvim-tree/nvim-web-devicons",
	},
}
