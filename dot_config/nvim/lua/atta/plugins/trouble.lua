local trouble = require("trouble")
local utils = require("atta.utils")

local M = {}

function M.setup()
	trouble.setup()

	utils.noremap("n", "<leader>xx", "<cmd>TroubleToggle<cr>", { silent = true })
	utils.noremap("n", "<leader>xw", "<cmd>Trouble lsp_workspace_diagnostics<cr>", { silent = true })
	utils.noremap("n", "<leader>xd", "<cmd>Trouble lsp_document_diagnostics<cr>", { silent = true })
	utils.noremap("n", "<leader>xl", "<cmd>Trouble loclist<cr>", { silent = true })
	utils.noremap("n", "<leader>xq", "<cmd>Trouble quickfix<cr>", { silent = true })
	utils.noremap("n", "gR", "<cmd>Trouble lsp_references<cr>", { silent = true })
end

return M
