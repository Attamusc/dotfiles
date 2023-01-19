local M = {
	"glepnir/lspsaga.nvim",
	event = "BufRead",
	branch = "main",
}

function M.config()
	local saga = require("lspsaga")
	local utils = require("atta.utils")
	local cmd = vim.cmd

	saga.setup({
		ui = {
			title = false,
		},
		lightbulb = {
			virtual_text = false,
		},
		symbol_in_winbar = {
			enable = false,
		},
	})
	--
	-- hover docs
	utils.noremap("n", "K", "<cmd>Lspsaga hover_doc<CR>", { silent = true })

	-- code action
	utils.noremap({ "n", "v" }, "<leader>ca", "<cmd>Lspsaga code_action<CR>", { silent = true })

	-- diagnostics
	utils.noremap("n", "<leader>cd", "<cmd>Lspsaga show_line_diagnostics<CR>", { silent = true })
	utils.noremap("n", "[e", "<cmd>Lspsaga diagnostic_jump_prev<CR>", { silent = true })
	utils.noremap("n", "]e", "<cmd>Lspsaga diagnostic_jump_next<CR>", { silent = true })

	cmd([[autocmd CursorHold * Lspsaga show_cursor_diagnostics]])
end

return M
