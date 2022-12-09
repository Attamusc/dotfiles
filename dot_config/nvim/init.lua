local main = require("atta.main")

if not vim.g.vscode then
	local plugins = require("atta.plugins")

	plugins.setup_packer()
	main.setup()
	plugins.setup_plugins()
else
	local vscode = require("atta.vscode")

	-- General settings and keybinding
	main.setup()

	-- VSCode specific settings used by vscode-neovim
	-- NOTE: Some of these settings override general settings based on limitations
	-- of the way vscode-neovim works.
	vscode.setup()
end
