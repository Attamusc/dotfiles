return {
	"folke/trouble.nvim",
	branch = "main",
	config = function()
		local trouble = require("trouble")
		local utils = require("atta.utils")

		trouble.setup()

		utils.noremap("n", "<leader>xx", "<cmd>Trouble diagnostics toggle<cr>", { silent = true })
		utils.noremap("n", "<leader>xw", "<cmd>Trouble lsp_workspace_diagnostics toggle<cr>", { silent = true })
		utils.noremap("n", "<leader>xd", "<cmd>Trouble lsp_document_diagnostics toggle<cr>", { silent = true })
		utils.noremap("n", "<leader>xl", "<cmd>Trouble loclist toggle<cr>", { silent = true })
		utils.noremap("n", "<leader>xq", "<cmd>Trouble quickfix toggle<cr>", { silent = true })
		utils.noremap("n", "gR", "<cmd>Trouble lsp_references toggle<cr>", { silent = true })
	end,
}
