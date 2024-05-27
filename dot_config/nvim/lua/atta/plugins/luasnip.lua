return {
	-- Snippets
	{
		"L3MON4D3/LuaSnip",
		version = "v2.*",
		build = "make install_jsregexp",
		config = function()
			local luasnip = require("luasnip")

			luasnip.config.set_config({})

			vim.keymap.set({ "i" }, "<c-k>", function()
				luasnip.expand()
			end, { silent = true })
			vim.keymap.set({ "i", "s" }, "<c-l>", function()
				luasnip.jump(1)
			end, { silent = true })
			vim.keymap.set({ "i", "s" }, "<c-j>", function()
				luasnip.jump(-1)
			end, { silent = true })

			vim.keymap.set({ "i", "s" }, "<c-e>", function()
				if luasnip.choice_active() then
					luasnip.change_choice(1)
				end
			end, { silent = true })
		end,
	},
	"saadparwaiz1/cmp_luasnip",
}
