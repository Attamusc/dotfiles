local telescope = require("telescope")
local sorters = require("telescope.sorters")
local previewers = require("telescope.previewers")
local actions = require("telescope.actions")
local themes = require("telescope.themes")
local utils = require("atta.utils")

local noremap = utils.noremap
local M = {}

local function telescope_settings()
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
		},
	})

	telescope.load_extension("fzf")
end

local function telescope_mappings()
	noremap("n", "<leader>ff", "<cmd>lua require('telescope.builtin').find_files()<cr>")
	noremap("n", "<leader>fb", "<cmd>lua require('telescope.builtin').buffers()<cr>")
	noremap("n", "<leader>fsa", "<cmd>lua require('telescope.builtin').live_grep()<cr>")
	noremap("n", "<leader>fss", "<cmd>lua require('telescope.builtin').grep_string()<cr>")
	noremap("n", "<leader>fgs", "<cmd>lua require('telescope.builtin').git_status()<cr>")
	noremap("n", "<leader>fgc", "<cmd>lua require('telescope.builtin').git_commits()<cr>")
end

function M.setup()
	telescope_settings()
	telescope_mappings()
end

return M
