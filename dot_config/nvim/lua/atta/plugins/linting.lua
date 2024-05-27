local debounce = require("atta.utils").debounce

return {
	"mfussenegger/nvim-lint",
	event = { "BufReadPost", "BufNewFile", "BufWritePre" },
	config = function()
		local lint = require("lint")

		local M = {}
		lint.linters_by_ft = {
			css = { "stylelint" },
			javascript = { "eslint_d" },
			javascriptreact = { "eslint_d" },
			lua = { "luacheck" },
			markdown = { "vale" },
			ruby = { "rubocop" },
			typescript = { "eslint_d" },
			typescriptreact = { "eslint_d" },
			yaml = { "yamllint" },
		}

		function M.lint()
			local names = lint._resolve_linter_by_ft(vim.bo.filetype)
			names = vim.list_extend({}, names)

			if #names > 0 then
				lint.try_lint(names)
			end
		end

		vim.api.nvim_create_autocmd({ "BufWritePost", "BufReadPost", "InsertLeave" }, {
			group = vim.api.nvim_create_augroup("nvim-lint", { clear = true }),
			callback = debounce(100, M.lint),
		})
	end,
}
