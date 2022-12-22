local g = vim.g

local M = {
	"guns/vim-sexp",
	"tpope/vim-sexp-mappings-for-regular-people",
}

function M.config()
	g.sexp_filetypes = "clojure,scheme,lisp,timl,fennel,janet"
end

return M
