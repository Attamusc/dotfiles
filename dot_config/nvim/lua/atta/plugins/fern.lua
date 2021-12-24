local utils = require("atta.utils")

local cmd = vim.cmd
local g = vim.g
local fn = vim.fn

local M = {}

local function map_buffer(from, to, opt)
	local options = {}

	if opt then
		vim.tbl_extend("force", options, opt)
	end

	vim.api.nvim_buf_set_keymap(0, "n", from, to, options)
end

local function fern_variables()
	g["fern#renderer"] = "nerdfont"
	g["fern#disable_default_mappings"] = 1
end

local function fern_mappings()
	utils.map("", "<leader>e", ":Fern . -drawer -reveal=% -toggle -width=35<cr><c-w>=", { silent = true })
end

local function fern_augroups()
	cmd([[
augroup FernInit
  autocmd!
  autocmd FileType fern :lua require("atta.plugins.fern").fern_init()
augroup END
  ]])
end

-- local function fern_smart_leaf()
-- local open = t("<Plug>(fern-action-open:select)")
-- local expand = t("<Plug>(fern-action-expand)")
-- local collapse = t("<Plug>(fern-action-collapse)")

-- return fn.printf("fern#smart#leaf(%s, %s, %s)", open, expand, collapse)
-- end

function M.fern_init()
	-- Bailing out of lua for this since for some reason I can't get the nvim.wo.* version of these
	-- to actually work properly for only the buffer, and these don't exists as nvim.bo.* versions.
	cmd("setlocal nornu")
	cmd("setlocal nonu")

	-- Can't get this lua version to work, so bail out to vimscript to register the command
	-- map_buffer("<Plug>(fern-my-open-expand-collapse)", fern_smart_leaf(), { expr = true })
	cmd(
		[[nmap <buffer><expr> <Plug>(fern-my-open-expand-collapse) fern#smart#leaf("\<Plug>(fern-action-open:select)", "\<Plug>(fern-action-expand)", "\<Plug>(fern-action-collapse)")]]
	)

	map_buffer("<CR>", "<Plug>(fern-my-open-expand-collapse)", { nowait = true })
	map_buffer("<2-LeftMouse>", "<Plug>(fern-my-open-expand-collapse)", { nowait = true })
	map_buffer("n", "<Plug>(fern-action-new-path)")
	map_buffer("d", "<Plug>(fern-action-remove)")
	map_buffer("c", "<Plug>(fern-action-copy)")
	map_buffer("m", "<Plug>(fern-action-move)")
	map_buffer("M", "<Plug>(fern-action-rename)")
	map_buffer("h", "<Plug>(fern-action-hidden:toggle)")
	map_buffer("r", "<Plug>(fern-action-reload)")
	map_buffer("i", "<Plug>(fern-action-mark:toggle)")
	map_buffer("s", "<Plug>(fern-action-open:split)")
	map_buffer("v", "<Plug>(fern-action-open:vsplit)")
	map_buffer("x", "<Plug>(fern-action-collapse)")
	map_buffer("<", "<Plug>(fern-action-leave)", { nowait = true })
	map_buffer(">", "<Plug>(fern-action-enter)", { nowait = true })
end

function M.setup()
	fern_variables()
	fern_mappings()
	fern_augroups()
end

return M
