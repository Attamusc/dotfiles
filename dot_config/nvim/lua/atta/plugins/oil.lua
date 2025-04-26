return {
	{
		"stevearc/oil.nvim",

		opts = {
			columns = { "icon" },
			keymaps = {
				["<C-h>"] = false,
				["<M-h>"] = "actions.select_split",
			},
			view_options = {
				show_hidden = true,
			},
		},
		config = function()
			-- Open parent directory in current window
			vim.keymap.set("n", "-", "<CMD>Oil<CR>", { desc = "Open parent directory" })

			-- Open parent directory in floating window
			vim.keymap.set("n", "<space>e", require("oil").toggle_float)
		end,
		dependencies = { "nvim-tree/nvim-web-devicons" },
	},
}
