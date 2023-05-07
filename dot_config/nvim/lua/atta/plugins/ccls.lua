local M = {
	"ranjithshegde/ccls.nvim",
}

function M.config()
  local ccls = require("ccls") 

  ccls.setup({lsp = {use_defaults = true}})
end

return M
