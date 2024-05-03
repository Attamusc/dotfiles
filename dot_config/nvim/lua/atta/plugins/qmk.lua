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

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format 3w6 keyboard",
		group = qmk_group,
		pattern = "*/3w6/*/keymap.c",
		callback = function()
			qmk.setup({
				name = "LAYOUT",
				auto_format_pattern = "*/3w6/*/keymap.c",
				layout = {
					"_ x x x x x _ _ _ x x x x x",
					"_ x x x x x _ _ _ x x x x x",
					"_ x x x x x _ _ _ x x x x x",
					"_ _ _ _ x x x _ x x x _ _ _",
				},
			})
		end,
	})

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format zmk corne keyboard",
		group = qmk_group,
		pattern = "*/corne.keymap",
		callback = function()
			qmk.setup({
				name = "layout",
				auto_format_pattern = "*/corne.keymap",
				variant = "zmk",
				layout = {
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ x x x x x x _ _ _ x x x x x x",
					"_ _ _ _ _ x x x _ x x x _ _ _ _",
				},
			})
		end,
	})

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format zmk totem keyboard",
		group = qmk_group,
		pattern = "*/totem.keymap",
		callback = function()
			qmk.setup({
				name = "layout",
				auto_format_pattern = "*/totem.keymap",
				variant = "zmk",
				layout = {
					"_ x x x x x _ x x x x x _",
					"_ x x x x x _ x x x x x _",
					"x x x x x x _ x x x x x x",
					"_ _ _ x x x _ x x x _ _ _",
				},
			})
		end,
	})

	vim.api.nvim_create_autocmd("BufEnter", {
		desc = "Format zmk urchin keyboard",
		group = qmk_group,
		pattern = "*/urchin.keymap",
		callback = function()
			qmk.setup({
				name = "layout",
				auto_format_pattern = "*/urchin.keymap",
				variant = "zmk",
				layout = {
					"_ x x x x x _ x x x x x",
					"_ x x x x x _ x x x x x",
					"_ x x x x x _ x x x x x",
					"_ _ _ _ x x _ x x _ _ _",
				},
			})
		end,
	})
end

return M
