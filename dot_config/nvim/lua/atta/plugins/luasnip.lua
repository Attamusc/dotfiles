local M = {
	-- Snippets
	"L3MON4D3/LuaSnip",
	"saadparwaiz1/cmp_luasnip",
}

function M.config()
	local luasnip = require("luasnip")

	luasnip.config.set_config({})
end

return M
