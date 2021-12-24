-- Bundling all these plguins into one config since they need to come
-- in a specific order. I might split them apart if this files ends up
-- too large.

local lsp_installer = require("nvim-lsp-installer")
local kind = require("lspkind")
local saga = require("lspsaga")
local cmp = require("cmp")
local cmp_under = require("cmp-under-comparator")
local utils = require("atta.utils")

local cmd = vim.cmd
local lsp = vim.lsp
local fn = vim.fn

local M = {}

function M.format()
	vim.lsp.buf.formatting()
end

local function on_attach(client)
	if client.resolved_capabilities.document_formatting then
		cmd([[augroup Format]])
		cmd([[autocmd! * <buffer>]])
		cmd([[autocmd BufWritePost <buffer> lua require('atta.plugins.lsp').format()]])
		cmd([[augroup END]])
	end
end

local jsconfigs = {
	{ formatCommand = "./node_modules/.bin/prettier --stdin-filepath ${INPUT}", formatStdin = true },
}

local server_configs = {
	jsonls = {},
	yamlls = {},
	bashls = {},
	intelephense = {},
	solargraph = {},
	omnisharp = {},
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
			client.resolved_capabilities.document_formatting = false
			on_attach(client)
		end,
	},
	rust_analyzer = {
		on_attach = function(client)
			client.resolved_capabilities.document_formatting = false
			on_attach(client)
		end,
	},
	gopls = {
		on_attach = function(client)
			client.resolved_capabilities.document_formatting = false
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
	efm = {
		on_attach = on_attach,
		filetypes = {
			"lua",
			"go",
			"rust",
			"javascript",
			"javascriptreact",
			"javascript.jsx",
			"typescript",
			"typescriptreact",
			"typescript.jsx",
		},
		init_options = { documentFormatting = true },
		settings = {
			rootMarkers = { ".git/" },
			languages = {
				go = {
					{ formatCommand = "goimports", formatStdin = true },
					{ formatCommand = "gofmt", formatStdin = true },
					{ formatCommand = "golines", formatStdin = true },
				},
				lua = {
					{
						formatCommand = "stylua --search-parent-directories --stdin-filepath ${INPUT} -",
						formatStdin = true,
					},
				},
				rust = {
					{ formatCommand = "rustfmt --emit=stdout --edition=2018", formatStdin = true },
				},
				javascript = jsconfigs,
				javascriptreact = jsconfigs,
				["javascript.jsx"] = jsconfigs,
				typescript = jsconfigs,
				typescriptreact = jsconfigs,
				["typescript.jsx"] = jsconfigs,
			},
		},
	},
}

local function setup_servers()
	lsp_installer.on_server_ready(function(server)
		local config = server_configs[server.name] or {}

		server:setup(config)
		cmd([[do User LspAttachBuffer]])
	end)
end

local function setup_completions()
	cmp.setup({
		mapping = {
			["<c-d>"] = cmp.mapping.scroll_docs(-4),
			["<c-f>"] = cmp.mapping.scroll_docs(4),
			["<c-e>"] = cmp.mapping.close(),
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
				fn["vsnip#anonymous"](args.body)
			end,
		},

		sources = {
			{ name = "nvim_lua" },
			{ name = "nvim_lsp" },
			{ name = "path" },
			{ name = "vsnip" },
			{ name = "buffer", keyword_length = 4 },
		},

		formatting = {
			format = kind.cmp_format({
				with_text = true,
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

		experimental = {
			native_menu = false,
			ghost_text = true,
		},
	})
end

local function setup_saga()
	saga.init_lsp_saga()
end

local function setup_kind()
	kind.init({
		with_text = true,
		preset = "default",
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
	bind_keymaps()
end

return M
