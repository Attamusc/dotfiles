local M = {
	"codethread/qmk.nvim",
}

function M.config()
	local qmk = require("qmk")
	local qmk_group = vim.api.nvim_create_augroup("QMKFormatConfig", {})

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format iris keyboard",
		group = qmk_group,
		pattern = "*/iris/*/keymap.c",
		callback = function()
			qmk.setup({
				name = "LAYOUT",
				auto_format_pattern = "*/iris/*/keymap.c",
				layout = {
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x x _ x x x x x x x",
					"_ _ _ _ _ x x x _ x x x _ _ _ _",
				},
			})
		end,
	})

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format piantor keyboard",
		group = qmk_group,
		pattern = "*/piantor/*/keymap.c",
		callback = function()
			qmk.setup({
				name = "LAYOUT_split_3x6_3",
				auto_format_pattern = "*/piantor/*/keymap.c",
				layout = {
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ _ _ _ _ x x x _ x x x _ _ _ _",
				},
			})
		end,
	})
end

return M
