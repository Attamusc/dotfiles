local api = vim.api
local nvim_map = vim.api.nvim_set_keymap
local M = {}

-- Utils
function M.dump(...)
	local objects = vim.tbl_map(vim.inspect, { ... })
	print(unpack(objects))
	return ...
end

function M.t(str)
	return api.nvim_replace_termcodes(str, true, true, true)
end

function M.map(mode, from, to, opt)
	local options = {}

	if opt then
		vim.tbl_extend("force", options, opt)
	end

	nvim_map(mode, from, to, options)
end

function M.noremap(mode, from, to, opt)
	local options = { noremap = true }

	if opt then
		vim.tbl_extend("force", options, opt)
	end

	nvim_map(mode, from, to, options)
end

return M
