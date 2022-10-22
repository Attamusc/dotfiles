local utils = require("atta.utils")
local fn = vim.fn
local g = vim.g
local opt = vim.opt
local cmd = vim.cmd

local M = {}

-- General Settings
local function mapleader()
	-- Use spacebar as leader and , as secondary-leader
	-- Required before loading plugins!
	g.mapleader = " "
	g.maplocalleader = ","

	if fn.has("vim_starting") then
		-- Release keymappings prefixes, evict entirely for use of plug-ins.
		utils.map("n", " ", "<nop>")
		utils.map("n", ",", "<nop>")
		utils.map("n", ";", "<nop>")
	end
end

local function disable_default_plugins()
	-- Disable vim distribution plugins
	g.loaded_gzip = 1
	g.loaded_tar = 1
	g.loaded_tarPlugin = 1
	g.loaded_zip = 1
	g.loaded_zipPlugin = 1

	g.loaded_getscript = 1
	g.loaded_getscriptPlugin = 1
	g.loaded_vimball = 1
	g.loaded_vimballPlugin = 1

	g.loaded_matchit = 1
	g.loaded_matchparen = 1
	g.loaded_2html_plugin = 1
	g.loaded_logiPat = 1
	g.loaded_rrhelper = 1

	g.loaded_netrw = 1
	g.loaded_netrwPlugin = 1
	g.loaded_netrwSettings = 1
	g.loaded_netrwFileHandlers = 1
end

local function general_settings()
	if fn.has("termguicolors") then
		opt.termguicolors = true
	end

	-- Default updatetime is 4s, which is very long
	opt.updatetime = 300

	-- Show numbers
	opt.nu = true

	-- Show relative line numbers
	opt.rnu = true

	-- Visual bell when alerting instead of an audio bell
	opt.visualbell = true

	-- Show executed commands in the command line
	opt.showcmd = true

	-- Open vertical splits to the right and horizontal splits below the current buffer
	opt.splitbelow = true
	opt.splitright = true

	-- seach both cscopes and the tags file
	-- opt.cscopetag = true

	-- Make the command line 2 lines high
	opt.cmdheight = 2

	-- Show sign glyphs in the same column as numbers to reduce the pop when signs
	-- are added
	opt.signcolumn = "yes"

	-- Start scrolling up/down when we're 5 lines away for the edges of the buffer
	opt.scrolloff = 5

	-- Reduce key delays
	opt.timeoutlen = 1000
	opt.ttimeoutlen = 0

	-- When switching buffers, prefer ones that are already open vs opening a new duplicate
	opt.switchbuf = "useopen"

	-- Automatically indent inside of blocks per the language rules
	opt.autoindent = true

	-- fold settings
	-- opt.foldcolumn = '1'
	-- opt.foldlevel = 99
	-- opt.foldenable = true

	-- Use tree-sitter for folding
	-- opt.foldmethod = "expr"
	-- opt.foldexpr = fn["nvim_treesitter#foldexpr"]()

	-- Use the same symbols as TextMate for tabstops and EOLs
	opt.listchars = [[tab:▸ ,eol:¬,trail:·]]

	-- fillchars
	opt.fillchars = [[eob: ,fold: ,foldopen:,foldsep: ,foldclose:]]

	-- Set a default tab width as use spaces as tabs
	opt.ts = 2
	opt.sts = 2
	opt.sw = 2
	opt.expandtab = true

	-- No swap file and no backup file
	opt.swapfile = false
	opt.backup = false

	-- When searching, highlight matchs as you type
	opt.showmatch = true
	opt.incsearch = true
	opt.hlsearch = true

	-- Highlight the background of the line the cursor is on
	opt.cursorline = true

	-- Don't show the current mode, since the status line plugin will do this
	opt.showmode = false

	opt.completeopt = "menu,menuone,noselect"

	-- Dark background for colorschemes that provide both
	opt.background = "dark"

	-- Show only only global status line
	opt.laststatus = 3

	-- Don't remember what these do but leaving them for now...
	opt.hidden = true
	opt.smartindent = true
	opt.autoread = true
	opt.exrc = true
	opt.secure = true
	opt.modelines = 1
	opt.synmaxcol = 400
	opt.formatoptions = "qrn1"
	opt.backspace = "indent,eol,start"
	opt.tags = "./tags;/"
	opt.clipboard = "unnamed"
	opt.lazyredraw = true
	opt.autowrite = true
end

local function autocmd_number_toggle()
	-- Relative line numbers are nice to move around, but not so helpful in
	-- insert mode. This autocmd switches between them
	cmd([[
    augroup NumberToggle
      autocmd!
      autocmd BufEnter,FocusGained,InsertLeave,WinEnter * if &nu | set rnu   | endif
      autocmd BufLeave,FocusLost,InsertEnter,WinLeave   * if &nu | set nornu | endif
    augroup END
  ]])
end

local function autocmd_highlight_yank()
	cmd([[
    augroup highlight_yank
        autocmd!
        autocmd TextYankPost * silent! lua require'vim.highlight'.on_yank({timeout = 400})
    augroup END
  ]])
end

local function autocmd_chezmoi_apply()
	cmd([[
    augroup chezmoi_apply
      autocmd!
      autocmd BufWritePost ~/.local/share/chezmoi/* silent! !chezmoi apply --source-path "%"
    augroup END
  ]])
end

function M.setup()
	disable_default_plugins()
	mapleader()
	general_settings()

	autocmd_number_toggle()
	autocmd_highlight_yank()
	autocmd_chezmoi_apply()
end

return M
