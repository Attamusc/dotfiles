-- Bundling all these plguins into one config since they need to come
-- in a specific order. I might split them apart if this files ends up
-- too large.

local lsp_installer = require("nvim-lsp-installer")
local null_ls = require("null-ls")
local kind = require("lspkind")
local saga = require("lspsaga")
local cmp = require("cmp")
local ufo = require("ufo")
local cmp_under = require("cmp-under-comparator")
local rust_tools = require("rust-tools")
local utils = require("atta.utils")
local luasnip = require("luasnip")
local cmd = vim.cmd
local lsp = vim.lsp
local fn = vim.fn

local M = {}

function M.format()
	vim.lsp.buf.format({ async = true })
end

local function on_attach(client)
	if client.server_capabilities.document_formatting then
		cmd([[augroup Format]])
		cmd([[autocmd! * <buffer>]])
		cmd([[autocmd BufWritePost <buffer> lua require('atta.plugins.lsp').format()]])
		cmd([[augroup END]])
	end
end

local server_configs = {
	yamlls = {},
	bashls = {},
	solargraph = {},
	omnisharp = {},
	jsonls = {
		on_attach = function(client)
			client.server_capabilities.document_formatting = false
			on_attach(client)
		end,
	},
	pyright = {
		on_attach = function(client)
			client.server_capabilities.document_formatting = false
			on_attach(client)
		end,
	},
	sumneko_lua = {
		settings = {
			Lua = {
				runtime = {
					version = "LuaJIT",
					path = vim.split(package.path, ";"),
				},
				diagnostics = {
					globals = { "vim" },
				},
				workspace = {
					library = {
						[fn.expand("$VIMRUNTIME/lua")] = true,
						[fn.expand("$VIMRUNTIME/lua/vim/lsp")] = true,
					},
				},
			},
		},
	},
	tsserver = {
		on_attach = function(client)
			client.server_capabilities.document_formatting = false
			on_attach(client)
		end,
	},
	gopls = {
		on_attach = function(client)
			client.server_capabilities.document_formatting = false
			on_attach(client)
		end,
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
}

local function setup_servers()
	lsp_installer.on_server_ready(function(server)
		local config = server_configs[server.name] or {}

    local capabilities = vim.lsp.protocol.make_client_capabilities()
    capabilities.textDocument.foldingRange = {
      dynamicRegistration = false,
      lineFoldingOnly = true,
    }

    vim.tbl_deep_extend("force", {
      capabilities = capabilities,
    }, config)

		if server.name == "rust_analyzer" then
			rust_tools.setup({
				tools = {
					autoSetHints = true,
				},
				server = vim.tbl_deep_extend("force", server:get_default_options(), {}, {
					on_attach = function(client)
						client.server_capabilities.document_formatting = false
						on_attach(client)
					end,
				}),
			})
			server:attach_buffers()
		else
			server:setup(config)
		end

		cmd([[do User LspAttachBuffer]])
	end)
end

local function setup_completions()
	cmp.setup({
		mapping = {
			["<c-d>"] = cmp.mapping.scroll_docs(-4),
			["<c-f>"] = cmp.mapping.scroll_docs(4),
			["<c-e>"] = cmp.mapping({
				i = cmp.mapping.abort(),
				c = cmp.mapping.close(),
			}),
			["<CR>"] = cmp.mapping(
				cmp.mapping.confirm({
					behavior = cmp.ConfirmBehavior.Insert,
					select = true,
				}),
				{ "i", "c" }
			),
			["<c-space>"] = cmp.mapping({
				i = cmp.mapping.complete(),
				c = function(
					_ --[[fallback]]
				)
					if cmp.visible() then
						if not cmp.confirm({ select = true }) then
							return
						end
					else
						cmp.complete()
					end
				end,
			}),
		},

		snippet = {
			expand = function(args)
				luasnip.lsp_expand(args.body)
			end,
		},

		sources = {
			{ name = "nvim_lua" },
			{ name = "nvim_lsp" },
			{ name = "luasnip" },
			{ name = "path" },
			{ name = "buffer", keyword_length = 4 },
		},

		formatting = {
			format = kind.cmp_format({
				menu = {
					buffer = "[buffer]",
					nvim_lsp = "[LSP]",
					nvim_lua = "[api]",
					path = "[path]",
					vsnip = "[snippet]",
					gh_issues = "[issues]",
					tn = "[TabNine]",
				},
			}),
		},

		sorting = {
			comparators = {
				cmp.config.compare.offset,
				cmp.config.compare.exact,
				cmp.config.compare.score,
				cmp_under.under,
				cmp.config.compare.kind,
				cmp.config.compare.sort_text,
				cmp.config.compare.length,
				cmp.config.compare.order,
			},
		},

    view = {
      entries = "native",
    },

		experimental = {
			ghost_text = true,
		},
	})
end

local function setup_saga()
	saga.init_lsp_saga()
end

local function setup_ufo()
  ufo.setup()
end

local function setup_kind()
	kind.init({
		symbol_map = {
			Text = "",
			Method = "",
			Function = "",
			Constructor = "",
			Field = "ﰠ",
			Variable = "",
			Class = "ﴯ",
			Interface = "",
			Module = "",
			Property = "ﰠ",
			Unit = "塞",
			Value = "",
			Enum = "",
			Keyword = "",
			Snippet = "",
			Color = "",
			File = "",
			Reference = "",
			Folder = "",
			EnumMember = "",
			Constant = "",
			Struct = "פּ",
			Event = "",
			Operator = "",
			TypeParameter = "",
		},
	})
end

local function setup_null_ls()
	null_ls.setup({
		on_attach = on_attach,
		sources = {
			-- js
			null_ls.builtins.formatting.prettier,
			null_ls.builtins.diagnostics.eslint_d,
			null_ls.builtins.code_actions.eslint_d,

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

local function bind_keymaps()
	utils.noremap("n", "K", "<cmd>lua require('lspsaga.hover').render_hover_doc()<CR>", { silent = true })

	-- scroll down hover doc
	utils.noremap("n", "<C-f>", "<cmd>lua require('lspsaga.action').smart_scroll_with_saga(1)<CR>", { silent = true })
	-- scroll up hover doc
	utils.noremap("n", "<C-b>", "<cmd>lua require('lspsaga.action').smart_scroll_with_saga(-1)<CR>", { silent = true })

	-- code action
	utils.noremap("n", "<leader>ca", "<cmd>lua require('lspsaga.codeaction').code_action()<CR>", { silent = true })
	utils.noremap(
		"v",
		"<leader>ca",
		":<C-U>lua require('lspsaga.codeaction').range_code_action()<CR>",
		{ silent = true }
	)

	-- diagnostics
	vim.cmd([[autocmd CursorHold * lua require('lspsaga.diagnostic').show_cursor_diagnostics()]])

	utils.noremap(
		"n",
		"<leader>cd",
		"<cmd>lua require('lspsaga.diagnostic').show_line_diagnostics()<CR>",
		{ silent = true }
	)

	utils.noremap("n", "[e", "<cmd>lua require('lspsaga.diagnostic').lsp_jump_diagnostic_prev()<CR>", {
		silent = true,
	})
	utils.noremap("n", "]e", "<cmd>lua require('lspsaga.diagnostic').lsp_jump_diagnostic_next()<CR>", {
		silent = true,
	})
end

local function setup_diagnostics()
	lsp.handlers["textDocument/publishDiagnostics"] = lsp.with(lsp.diagnostic.on_publish_diagnostics, {
		virtual_text = false,
		underline = true,
		signs = true,
		update_in_insert = false,
	})

	vim.diagnostic.config({
		virtual_text = false,
		float = {
			source = "always",
		},
		severity_sort = true,
	})

	fn.sign_define("LspDiagnosticsSignError", { text = "", texthl = "LspDiagnosticsDefaultError" })
	fn.sign_define("LspDiagnosticsSignWarning", { text = "", texthl = "LspDiagnosticsDefaultWarning" })
	fn.sign_define("LspDiagnosticsSignInformation", { text = "", texthl = "LspDiagnosticsDefaultInformation" })
	fn.sign_define("LspDiagnosticsSignHint", { text = "", texthl = "LspDiagnosticsDefaultHint" })
end

function M.setup()
	setup_servers()
	setup_saga()
	setup_kind()
	setup_completions()
	setup_diagnostics()
	setup_null_ls()
  setup_ufo()

	bind_keymaps()
end

return M
