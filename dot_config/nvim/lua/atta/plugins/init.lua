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
			use({ "kylechui/nvim-surround" })
			use({ "lambdalisue/nerdfont.vim" })
			use({ "lambdalisue/glyph-palette.vim" })
			use({ "preservim/nerdcommenter" })
			use({ "jiangmiao/auto-pairs" })
			use({ "tpope/vim-repeat" })
			use({ "guns/vim-sexp" })
			use({ "tpope/vim-sexp-mappings-for-regular-people" })
			use({ "kyazdani42/nvim-web-devicons" })
			use({ "nvim-treesitter/nvim-treesitter", run = ":TSUpdate" })
			use({ "nvim-treesitter/nvim-treesitter-textobjects" })
			use({ "ggandor/lightspeed.nvim" })
			use({ "wellle/targets.vim" })
			use({ "folke/neodev.nvim" })

			-- Lua nvim utils
			use({ "nvim-lua/popup.nvim" })
			use({ "nvim-lua/plenary.nvim" })

			-- VCS
			use({ "tpope/vim-fugitive" })
			use({ "pwntester/octo.nvim" })

			-- File Drawer
			use({ "lambdalisue/fern.vim", branch = "main" })
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
			use({ "nvim-telescope/telescope-live-grep-args.nvim" })
			use({ "ptethng/telescope-makefile" })

			-- Diagnostics
			use({ "folke/trouble.nvim", branch = "main" })
			use({ "folke/todo-comments.nvim", branch = "main" })

			-- Indent lines
			use({ "lukas-reineke/indent-blankline.nvim" })

			-- Native LSP
			use({ "neovim/nvim-lspconfig" })
			use({ "williamboman/mason.nvim" })
			use({ "williamboman/mason-lspconfig.nvim" })
			use({ "glepnir/lspsaga.nvim", branch = "main" })
			use({ "onsails/lspkind-nvim" })
			use({
				"jose-elias-alvarez/null-ls.nvim",
				requires = { "nvim-lua/plenary.nvim" },
			})

			-- Co-pilot
			use({
				"zbirenbaum/copilot.lua",
				event = { "VimEnter" },
				config = function()
					vim.defer_fn(function()
						require("copilot").setup()
					end, 100)
				end,
			})

			use({
				"zbirenbaum/copilot-cmp",
				after = { "copilot.lua" },
				config = function()
					require("copilot_cmp").setup()
				end,
			})

			-- Improved splits ergonomics
			use({ "mrjones2014/smart-splits.nvim" })

			-- Terminal
			use({ "akinsho/toggleterm.nvim", tag = "*" })

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
			use({ "ron-rs/ron.vim" })
			use({ "wuelnerdotexe/vim-astro" })
			-- Make sure chezmoi files highlight like the actual files they represent
			use({ "alker0/chezmoi.vim", opt = true })

			-- Colors
			use({ "catppuccin/nvim", as = "catppuccin" })
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
	-- Set colorscheme first to ensure any variables are present for plugins
	-- require("atta.plugins.kanagawa").setup()
	-- require("atta.plugins.nightfox").setup()
	require("atta.plugins.catppuccin").setup()

	require("atta.plugins.fern").setup()
	require("atta.plugins.glyph_palette").setup()
	require("atta.plugins.indent-blankline").setup()
	require("atta.plugins.lsp").setup()
	require("atta.plugins.lualine").setup()
	require("atta.plugins.luasnip").setup()
	require("atta.plugins.nerdcommenter").setup()
	require("atta.plugins.nvim-treesitter").setup()
	require("atta.plugins.nvim-surround").setup()
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
