local api = vim.api
local nvim_map = vim.keymap.set
local M = {}

-- Global utils
P = function(v)
	print(vim.inspect(v))
	return v
end

if pcall(require, "plenary") then
	RELOAD = require("plenary.reload").reload_module

	R = function(name)
		RELOAD(name)
		return require(name)
	end
end

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

function M.debounce(ms, fn)
	local timer = vim.uv.new_timer()
	return function(...)
		local argv = { ... }
		timer:start(ms, 0, function()
			timer:stop()
			vim.schedule_wrap(fn)(unpack(argv))
		end)
	end
end

return M
