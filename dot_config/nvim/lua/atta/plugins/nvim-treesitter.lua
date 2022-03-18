local treesitter_configs = require("nvim-treesitter.configs")

local M = {}

function M.setup()
  treesitter_configs.setup({
    ensure_installed = "all",
    ignore_install = { "haskell", "phpdoc" },
    highlight = {
      enable = true
    },
    indent = {
      enable = true
    }
  })
end

return M
