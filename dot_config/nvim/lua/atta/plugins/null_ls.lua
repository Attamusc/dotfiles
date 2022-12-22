local M = {
	"jose-elias-alvarez/null-ls.nvim",
}

function M.setup(options)
	local null_ls = require("null-ls")

	local eslint_config = {
		condition = function(h)
			return h.root_has_file({
				"eslint.config.js",
				".eslintrc",
				".eslintrc.js",
				".eslintrc.cjs",
				".eslintrc.yaml",
				".eslintrc.yml",
				".eslintrc.json",
			})
		end,
	}

	null_ls.setup({
		on_attach = options.on_attach,
		sources = {
			-- js
			null_ls.builtins.formatting.prettier.with({
				condition = function(h)
					return h.root_has_file({
						".prettierrc",
						".prettierrc.json",
						".prettierrc.yml",
						".prettierrc.yaml",
						".prettierrc.json5",
						".prettierrc.js",
						".prettierrc.cjs",
						".prettierrc.toml",
						"prettier.config.js",
						"prettier.config.cjs",
					})
				end,
			}),
			null_ls.builtins.diagnostics.eslint_d.with(eslint_config),
			null_ls.builtins.code_actions.eslint_d.with(eslint_config),

			-- python
			null_ls.builtins.formatting.black,

			-- go
			null_ls.builtins.formatting.gofmt,
			null_ls.builtins.formatting.goimports,

			-- protobuf
			null_ls.builtins.formatting.protolint,

			-- ruby
			null_ls.builtins.formatting.rubocop,
			null_ls.builtins.diagnostics.rubocop,

			-- rust
			null_ls.builtins.formatting.rustfmt,

			-- css
			null_ls.builtins.formatting.stylelint,
			null_ls.builtins.diagnostics.stylelint,

			-- lua
			null_ls.builtins.formatting.stylua,

			-- markdown
			null_ls.builtins.diagnostics.vale,
		},
	})
end

return M
