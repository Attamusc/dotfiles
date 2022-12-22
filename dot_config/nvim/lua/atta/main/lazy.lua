local M = {}

function M.setup()
	local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

	if not vim.loop.fs_stat(lazypath) then
		vim.fn.system({
			"git",
			"clone",
			"--filter=blob:none",
			"--single-branch",
			"git@github.com:folke/lazy.nvim.git",
			lazypath,
		})
	end

	vim.opt.runtimepath:prepend(lazypath)

	require("lazy").setup("atta.plugins")
end

return M
