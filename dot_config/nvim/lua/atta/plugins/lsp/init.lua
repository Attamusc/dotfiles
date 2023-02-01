-- Bundling all these plguins into one config since they need to come
-- in a specific order. I might split them apart if this files ends up
-- too large.

local M = {
	-- Native LSP
	"neovim/nvim-lspconfig",
	name = "lsp",
	event = "BufReadPre",
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
	},
}

local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

local function on_attach(client, bufnr)
	if client.supports_method("textDocument/formatting") then
		vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
		vim.api.nvim_create_autocmd("BufWritePre", {
			group = augroup,
			buffer = bufnr,
			callback = function()
				vim.lsp.buf.format({
					bufnr = bufnr,
					filter = function(c)
						return c.name == "null-ls"
					end,
				})
			end,
		})
	end
end

local server_configs = {
	stylelint_lsp = {},
	yamlls = {},
	bashls = {},
	sorbet = {},
	omnisharp = {},
	jsonls = {},
	pyright = {},
	sumneko_lua = {
		settings = {
			Lua = {
				completion = {
					callSnippet = "Replace",
				},
			},
		},
	},
	tsserver = {},
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

	utils.noremap({ "n", "i" }, "<A-k>", "<cmd>lua vim.lsp.buf.signature_help()<CR>", { silent = true })
end

function M.config()
	local neodev = require("neodev")
	neodev.setup()

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
			rust_tools.setup(opts)
		else
			lspconfig[server].setup(opts)
		end
	end

	require("atta.plugins.lsp.diagnostics").setup()
	require("atta.plugins.null_ls").setup(options)

	bind_keymaps()
end

return M
