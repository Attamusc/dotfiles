local g = vim.g

local M = {}

function M.setup()
  g.sexp_filetypes = "clojure,scheme,lisp,timl,fennel,janet"
end

return M
