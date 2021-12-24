local M = {}

function M.setup()
  vim.g.tokyonight_style = "night"
  vim.cmd([[colorscheme tokyonight]])
end

return M
