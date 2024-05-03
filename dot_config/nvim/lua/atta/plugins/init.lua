local M = {
	"antoinemadec/FixCursorHold.nvim",
	"jiangmiao/auto-pairs",
	"tpope/vim-repeat",
	"tpope/vim-sexp-mappings-for-regular-people",
	"ggandor/lightspeed.nvim",
	"wellle/targets.vim",
	"folke/neodev.nvim",

	-- Lua nvim utils
	"nvim-lua/popup.nvim",
	"nvim-lua/plenary.nvim",

	-- VCS
	"tpope/vim-fugitive",
	"pwntester/octo.nvim",

	-- Improved splits ergonomics
	"mrjones2014/smart-splits.nvim",

	-- Terminal
	{ "akinsho/toggleterm.nvim", version = "*" },

	-- Languages
	"cespare/vim-toml",
	"pangloss/vim-javascript",
	"HerringtonDarkholme/yats.vim",
	{ "rust-lang/rust.vim", ft = "rust" },
	{ "simrat39/rust-tools.nvim", ft = "rust" },
	"vim-ruby/vim-ruby",
	"maxmellon/vim-jsx-pretty",
	"bakpakin/fennel.vim",
	"euclidianAce/BetterLua.vim",
	"mustache/vim-mustache-handlebars",
	"jparise/vim-graphql",
	"martinda/Jenkinsfile-vim-syntax",
	"habamax/vim-godot",
	"ron-rs/ron.vim",
	"wuelnerdotexe/vim-astro",
	-- Make sure chezmoi files highlight like the actual files they represent
	-- { "alker0/chezmoi.vim", lazy = true },
}

return M
