local utils = require("atta.utils")
local map, noremap = utils.map, utils.noremap
local cmd = vim.cmd

local M = {}

-- General Keybindings
-- Keybindings not related to a specific plugin or language
local function keymaps()
	-- jj | escaping
	noremap("i", "jj", "<esc>")
	noremap("c", "jj", "<c-c>")

	-- Quit visual mode
	noremap("v", "v", "<esc>")

	-- Move to the start of line
	noremap("n", "H", "^")

	-- Move to the end of line
	noremap("n", "L", "$")

	-- Make Y behave like the other lowercase/uppercase opertaors
	noremap("n", "Y", "y$")

	-- Redo
	noremap("n", "U", "<c-r>")

	-- Moving text up and down lines
	noremap("v", "J", ":m '>+1<CR>gv=gv")
	noremap("v", "K", ":m '<-2<CR>gv=gv")
	noremap("n", "<leader>j", ":m .+1<CR>==")
	noremap("n", "<leader>k", ":m .-2<CR>==")

	-- Less disruptive behavior when the cursor shifts
	noremap("n", "n", "nzzzv")
	noremap("n", "N", "Nzzzv")
	noremap("n", "J", "mzJ`z")

	noremap("n", "<leader>x", "<cmd>.lua<CR>", { desc = "Execute the current line" })
	noremap("n", "<leader><leader>x", "<cmd>source %<CR>", { desc = "Execute the current file" })

	-- Quick command mode
	-- Clears hlsearch after doing a search, otherwise got into command mode
	cmd([[nnoremap <expr> <CR> {-> v:hlsearch ? ":nohl<CR>" : ":"}()]])

	-- In the quickfix window, <CR> is used to jump to the error under the
	-- cursor, so undefine the mapping there.
	cmd([[autocmd BufReadPost quickfix nnoremap <buffer> <CR> <CR>]])

	-- Make core movements visual line based vs actual line based
	map("", "j", "gj")
	map("", "k", "gk")

	-- Easier up/down movement in insert mode
	-- map("i", "<c-k>", "<up>")
	-- map("i", "<c-j>", "<down>")

	-- Use tab and shift tab for indentation
	noremap("n", "<s-tab>", "<<")
	noremap("n", "<tab>", ">>")

	-- Reselect after (de)indent in visual mode
	noremap("v", "<s-tab>", "<gv")
	noremap("v", "<tab>", ">gv")

	-- Easier tab movements
	noremap("n", "<leader>tl", ":tabn<cr>")
	noremap("n", "<leader>th", ":tabp<cr>")

	-- Easier multi-pane commands
	noremap("n", "<C-j>", "<C-w>j")
	noremap("n", "<C-k>", "<C-w>k")
	noremap("n", "<C-h>", "<C-w>h")
	noremap("n", "<C-l>", "<C-w>l")

	noremap("n", "<C-D-j>", "<C-w>J")
	noremap("n", "<C-D-k>", "<C-w>K")
	noremap("n", "<C-D-h>", "<C-w>H")
	noremap("n", "<C-D-l>", "<C-w>L")

	-- uppercase/lowercase a word
	map("", "<leader>uc", "mQviwU`Q")
	map("", "<leader>lc", "mQviwu`Q")

	-- quick(ish) saving
	noremap("n", "<leader>s", ":w<cr>")
	noremap("n", "<leader>S", ":wall<cr>")

	-- **VERY MAGIC EVERYWHERE**
	noremap("n", "/", "/\\v")
	noremap("c", "%s/", "%s/\\v")

	-- reload configs
	noremap("n", "<leader>rc", ":source $MYVIMRC<CR>")
end

function M.setup()
	keymaps()
end

return M
