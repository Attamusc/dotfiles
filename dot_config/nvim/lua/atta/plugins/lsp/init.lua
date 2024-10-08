-- Bundling all these plguins into one config since they need to come
-- in a specific order. I might split them apart if this files ends up
-- too large.

local M = {
	-- Native LSP
	"neovim/nvim-lspconfig",
	name = "lsp",
	event = "BufReadPre",
	dependencies = {
		"folke/neodev.nvim",
		"hrsh7th/cmp-nvim-lsp",
		"stevearc/conform.nvim",
		"j-hui/fidget.nvim",
	},
}

local server_configs = {
	astro = {},
	stylelint_lsp = {},
	yamlls = {},
	bashls = {},
	sorbet = {},
	omnisharp = {},
	jsonls = {},
	pyright = {},
	lua_ls = {
		settings = {
			Lua = {
				completion = {
					callSnippet = "Replace",
				},
			},
		},
	},
	ts_ls = {},
	gopls = {
		settings = {
			gopls = {
				analyses = {
					unusedparams = true,
				},
				staticcheck = true,
				linksInHover = false,
				codelenses = {
					generate = true,
					gc_details = true,
					regenerate_cgo = true,
					tidy = true,
					upgrade_depdendency = true,
					vendor = true,
				},
				usePlaceholders = true,
			},
		},
	},
	rust_analyzer = {
		tools = {
			autoSetHints = true,
		},
	},
}

local function bind_keymaps()
	local utils = require("atta.utils")

	utils.noremap({ "n", "i" }, "<M-k>", "<cmd>lua vim.lsp.buf.signature_help()<CR>", { silent = true })
end

function M.config()
	require("fidget").setup({})

	local neodev = require("neodev")
	neodev.setup({
		override = function(root_dir, options)
			if root_dir:find("chezmoi") then
				options.enabled = true
				options.runtime = true
				options.types = true
				options.plugins = true
			end
		end,
	})

	local capabilities = vim.lsp.protocol.make_client_capabilities()
	capabilities = require("cmp_nvim_lsp").default_capabilities(capabilities)

	local options = {
		on_attach = on_attach,
		capabilities = capabilities,
		flags = {
			debounce_text_changes = 150,
		},
	}

	local lspconfig = require("lspconfig")
	local rust_tools = require("rust-tools")

	for server, opts in pairs(server_configs) do
		opts = vim.tbl_deep_extend("force", {}, options, opts or {})

		if server == "rust_analyzer" then
			local mason_registry = require("mason-registry")
			local rust_tools_dap = require("rust-tools.dap")

			local codelldb = mason_registry.get_package("codelldb")
			local extension_path = codelldb:get_install_path() .. "/extension/"
			local codelldb_path = extension_path .. "adapter/codelldb"
			local liblldb_path = extension_path .. "lldb/lib/liblldb.dylib"

			local rust_options = {
				dap = {
					adapter = rust_tools_dap.get_codelldb_adapter(codelldb_path, liblldb_path),
				},
				server = vim.tbl_deep_extend("force", opts, {
					on_attach = function(client, bufnr)
						on_attach(client, bufnr)

						vim.keymap.set("n", "K", rust_tools.hover_actions.hover_actions, { buffer = bufnr })
						vim.keymap.set(
							"n",
							"<leader>a",
							rust_tools.code_action_group.code_action_group,
							{ buffer = bufnr }
						)
					end,
				}),
				tools = {
					executor = require("rust-tools.executors").toggleterm,
					hover_actions = {
						auto_focus = true,
					},
				},
			}

			rust_tools.setup(rust_options)
		else
			lspconfig[server].setup(opts)
		end
	end

	require("atta.plugins.lsp.diagnostics").setup()

	require("conform").setup({
		formatters_by_ft = {
			go = { "goimports", "gofmt" },
			javascript = { "prettierd" },
			javascriptreact = { "prettierd" },
			lua = { "stylua" },
			rust = { "rustfmt" },
			typescript = { "prettierd" },
			typescriptreact = { "prettierd" },
		},
	})

	vim.api.nvim_create_autocmd("BufWritePre", {
		callback = function(args)
			require("conform").format({
				bufnr = args.buf,
				lsp_fallback = true,
				quiet = true,
			})
		end,
	})

	bind_keymaps()
end

return M
