local M = {
	"williamboman/mason.nvim",
	dependencies = {
		"williamboman/mason-lspconfig.nvim",
	},
}

local tools = {
	"eslint_d",
	"black",
	"rubocop",
	"protolint",
	"vale",
	"goimports",
	"prettierd",
	"rustfmt",
	"stylua",
}

local function install_tools()
	local registry = require("mason-registry")

	for _, tool in ipairs(tools) do
		local p = registry.get_package(tool)
		if not p:is_installed() then
			p:install()
		end
	end
end

function M.config()
	local mason = require("mason")
	local mason_lsp_config = require("mason-lspconfig")

	mason.setup({})
	install_tools()
	mason_lsp_config.setup({
		automatic_installation = true,
	})
end

return M
