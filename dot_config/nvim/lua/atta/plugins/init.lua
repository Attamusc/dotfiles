local cmd = vim.cmd
local fn = vim.fn
local execute = vim.api.nvim_command
local fmt = string.format

local M = {}

-- Packer is our plugin manager.
local function ensure_packer()
	local pack_path = fn.stdpath("data") .. "/site/pack"
	local install_path = fmt("%s/packer/start/packer.nvim", pack_path)

	if fn.empty(fn.glob(install_path)) > 0 then
		execute(fmt("!git clone https://github.com/wbthomason/packer.nvim %s", install_path))
		execute([[packadd packer.nvim]])
	end
end

local function install_packages()
	local packer = require("packer")

	packer.startup({
		function(use)
			-- Manage packer with packer
			use("wbthomason/packer.nvim")

			-- General/Utils
			use({ "antoinemadec/FixCursorHold.nvim" })
			use({ "lambdalisue/nerdfont.vim" })
			use({ "lambdalisue/glyph-palette.vim" })
			use({ "preservim/nerdcommenter" })
			use({ "machakann/vim-sandwich" })
			use({ "jiangmiao/auto-pairs" })
			use({ "tpope/vim-repeat" })
			use({ "guns/vim-sexp" })
			use({ "tpope/vim-sexp-mappings-for-regular-people" })
			use({ "kyazdani42/nvim-web-devicons" })
			use({ "nvim-treesitter/nvim-treesitter", run = ":TSUpdate" })
			use({ "ggandor/lightspeed.nvim" })
			use({ "wellle/targets.vim" })

			-- Lua nvim utils
			use({ "nvim-lua/popup.nvim" })
			use({ "nvim-lua/plenary.nvim" })

			-- VCS
			use({ "tpope/vim-fugitive" })
			use({ "pwntester/octo.nvim" })

			-- File Drawer
			use({ "lambdalisue/fern.vim" })
			use({ "lambdalisue/fern-renderer-nerdfont.vim" })
			use({ "lambdalisue/fern-hijack.vim" })

			-- VCS Sign Info
			use({ "mhinz/vim-signify" })

			-- Status Line
			use({ "hoob3rt/lualine.nvim", requires = { "kyazdani42/nvim-web-devicons", opt = true } })

			-- Fuzzy Finder(s)
			use({ "nvim-telescope/telescope.nvim" })
			use({ "nvim-telescope/telescope-ui-select.nvim" })
			use({ "nvim-telescope/telescope-fzf-native.nvim", run = "make" })

			-- Diagnostics
			use({ "folke/trouble.nvim", branch = "main" })
			use({ "folke/todo-comments.nvim", branch = "main" })

			-- Indent lines
			use({ "lukas-reineke/indent-blankline.nvim" })

			-- Native LSP
			use({ "neovim/nvim-lspconfig" })
			use({ "williamboman/nvim-lsp-installer" })
			use({ "tami5/lspsaga.nvim" })
			use({ "onsails/lspkind-nvim" })
			use({
				"jose-elias-alvarez/null-ls.nvim",
				requires = { "nvim-lua/plenary.nvim" },
			})

			-- Improved splits ergonomics
			use({ "mrjones2014/smart-splits.nvim" })

			-- Autocomplete
			use({ "hrsh7th/nvim-cmp" })
			use({ "hrsh7th/cmp-cmdline" })
			use({ "hrsh7th/cmp-buffer" })
			use({ "hrsh7th/cmp-path" })
			use({ "hrsh7th/cmp-nvim-lua" })
			use({ "hrsh7th/cmp-nvim-lsp" })
			use({ "hrsh7th/cmp-nvim-lsp-document-symbol" })
			use({ "lukas-reineke/cmp-under-comparator" })

			-- Snippets
			use({ "L3MON4D3/LuaSnip" })
			use({ "saadparwaiz1/cmp_luasnip" })

			-- Languages
			use({ "cespare/vim-toml" })
			use({ "pangloss/vim-javascript" })
			use({ "HerringtonDarkholme/yats.vim" })
			use({ "rust-lang/rust.vim" })
			use({ "simrat39/rust-tools.nvim" })
			use({ "vim-ruby/vim-ruby" })
			use({ "maxmellon/vim-jsx-pretty" })
			use({ "bakpakin/fennel.vim" })
			use({ "euclidianAce/BetterLua.vim" })
			use({ "mustache/vim-mustache-handlebars" })
			use({ "jparise/vim-graphql" })
			use({ "martinda/Jenkinsfile-vim-syntax" })
			use({ "habamax/vim-godot" })
			use({ "StanAngeloff/php.vim" })
			use({ "2072/PHP-Indenting-for-VIm" })
			use({ "niftylettuce/vim-jinja" })
			use({ "ron-rs/ron.vim" })
			-- Make sure chezmoi files highlight like the actual files they represent
			use({ "alker0/chezmoi.vim", opt = true })

			-- Dash: mac documentation viewer app
			use({
				"mrjones2014/dash.nvim",
				run = "make install",
				cond = function()
					return vim.loop.os_uname().sysname == "Darwin"
				end,
			})

			-- Colors
			use({ "folke/tokyonight.nvim", branch = "main" })
			use({ "rose-pine/neovim" })
			use({ "rebelot/kanagawa.nvim" })
			use({ "EdenEast/nightfox.nvim" })
		end,
		config = {
			display = {
				open_fn = function()
					return require("packer.util").float({ border = "single" })
				end,
			},
		},
	})

	-- Need to load this manually to force the proper timing
	cmd([[packadd chezmoi.vim]])
end

local function load_plugin_configs()
	require("atta.plugins.fern").setup()
	require("atta.plugins.glyph_palette").setup()
	require("atta.plugins.indent-blankline").setup()
	-- require("atta.plugins.kanagawa").setup()
	require("atta.plugins.lsp").setup()
	require("atta.plugins.lualine").setup()
	require("atta.plugins.luasnip").setup()
	require("atta.plugins.nerdcommenter").setup()
	require("atta.plugins.nightfox").setup()
	require("atta.plugins.nvim-treesitter").setup()
	require("atta.plugins.sexp").setup()
	require("atta.plugins.telescope").setup()
	require("atta.plugins.todo_comments").setup()
	require("atta.plugins.trouble").setup()
	require("atta.plugins.vim-signify").setup()
end

function M.setup_packer()
	ensure_packer()
	install_packages()
end

function M.setup_plugins()
	load_plugin_configs()
end

function M.setup()
	M.setup_packer()
	M.setup_plugins()
end

return M
