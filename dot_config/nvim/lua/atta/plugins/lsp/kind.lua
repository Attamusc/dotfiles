return {
	"onsails/lspkind-nvim",
	config = function()
		local kind = require("lspkind")

		kind.init({
			symbol_map = {
				text = "",
				method = "",
				["function"] = "",
				constructor = "",
				Field = "ﰠ",
				Variable = "",
				Class = "ﴯ",
				Interface = "",
				Module = "",
				Property = "ﰠ",
				Unit = "塞",
				Value = "",
				Enum = "",
				Keyword = "",
				Snippet = "",
				Color = "",
				File = "",
				Reference = "",
				Folder = "",
				EnumMember = "",
				Constant = "",
				Struct = "פּ",
				Event = "",
				Operator = "",
				TypeParameter = "",
			},
		})
	end,
}
