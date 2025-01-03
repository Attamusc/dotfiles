local M = {
	-- Fuzzy Finder(s)
	"nvim-telescope/telescope.nvim",
	dependencies = {
		"nvim-telescope/telescope-ui-select.nvim",
		"nvim-telescope/telescope-live-grep-args.nvim",
		{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
	},
}

local function telescope_settings()
	local telescope = require("telescope")
	local sorters = require("telescope.sorters")
	local previewers = require("telescope.previewers")
	local actions = require("telescope.actions")
	local themes = require("telescope.themes")
	local lga_actions = require("telescope-live-grep-args.actions")

	telescope.setup({
		defaults = {
			file_sorter = sorters.get_fzy_sorter,
			prompt_prefix = " > ",
			color_devicons = true,
			sorting_strategy = "ascending",
			layout_strategy = "flex",
			layout_config = {
				vertical = {
					mirror = true,
				},
				horizontal = {
					mirror = false,
				},
			},
			mappings = {
				i = {
					["<esc>"] = actions.close,
				},
			},
			file_previewer = previewers.vim_buffer_cat.new,
			grep_previewer = previewers.vim_buffer_vimgrep.new,
			qflist_previewer = previewers.vim_buffer_qflist.new,
		},
		extensions = {
			fzf = {
				fuzzy = true,
				override_generic_sorter = true,
				override_file_sorter = true,
				case_mode = "smart_case",
			},
			["ui-select"] = {
				themes.get_dropdown({
					-- even more opts
				}),
			},
			live_grep_args = {
				mappings = { -- extend mappings
					i = {
						["<C-k>"] = lga_actions.quote_prompt(),
					},
				},
			},
		},
	})

	telescope.load_extension("fzf")
	telescope.load_extension("live_grep_args")
end

function M.reload()
	local function get_module_name(s)
		return s:gsub("%.lua", ""):gsub("%/", "."):gsub("%.init", "")
	end

	local prompt_title = "~ neovim modules ~"
	local path = "~/.local/share/chezmoi/dot_config/nvim/lua"
	local opts = {
		prompt_title = prompt_title,
		cwd = path,

		attach_mappings = function(_, map)
			map("i", "<c-e>", function(_)
				local entry = require("telescope.actions.state").get_selected_entry()
				local name = get_module_name(entry.value)

				local mod = R(name)
				mod.setup()
				P("[reloaded]: " .. name)
			end)

			return true
		end,
	}

	-- call the builtin method to list files
	require("telescope.builtin").find_files(opts)
end

local function telescope_mappings()
	local utils = require("atta.utils")
	local noremap = utils.noremap

	noremap("n", "<leader>ff", "<cmd>lua require('telescope.builtin').find_files()<cr>")
	noremap("n", "<leader>fb", "<cmd>lua require('telescope.builtin').buffers()<cr>")
	noremap("n", "<leader>fss", "<cmd>lua require('telescope.builtin').grep_string()<cr>")
	noremap("n", "<leader>fgs", "<cmd>lua require('telescope.builtin').git_status()<cr>")
	noremap("n", "<leader>fgc", "<cmd>lua require('telescope.builtin').git_commits()<cr>")
	noremap("n", "<leader>frc", "<cmd>lua require('atta.plugins.telescope').reload()<cr>")

	noremap("n", "<leader>fl", "<cmd>lua require('telescope').extensions.live_grep_args.live_grep_args()<cr>")
	noremap("n", "<leader>fg", "<cmd>lua require('telescope-live-grep-args.shortcuts').grep_word_under_cursor()<cr>")
end

function M.config()
	telescope_settings()
	telescope_mappings()
end

return M
