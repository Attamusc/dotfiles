local utils = require("atta.utils")

local map, noremap = utils.map, utils.noremap
local cmd = vim.cmd

local M = {}

local function triggerVSCodeCallCommand(command)
	cmd([[call VSCodeCall("]] .. command .. [[")]])
end

local function triggerVSCodeNotifyCommand(command)
	cmd([[call VSCodeNotify("]] .. command .. [[")]])
end

local function shiftEditorFocus(direction)
	triggerVSCodeNotifyCommand([[workbench.action.navigate]] .. direction)
end

local function shiftEditorGroup(direction)
	triggerVSCodeNotifyCommand([[workbench.action.moveEditorTo]] .. direction .. [[Group]])
end

function M.setup()
	-- VSCode-based window management
	noremap({ "n", "x" }, "<C-j>", function()
		shiftEditorFocus("Down")
	end)
	noremap({ "n", "x" }, "<C-k>", function()
		shiftEditorFocus("Up")
	end)
	noremap({ "n", "x" }, "<C-h>", function()
		shiftEditorFocus("Left")
	end)
	noremap({ "n", "x" }, "<C-l>", function()
		shiftEditorFocus("Right")
	end)

	-- TODO: These aren't great, but I'll leave them around for now
	--noremap({ "n", "x" }, "<C-D-j>", function()
	--shiftEditorGroup("Down")
	--end)
	--noremap({ "n", "x" }, "<C-D-k>", function()
	--shiftEditorGroup("Above")
	--end)
	--noremap({ "n", "x" }, "<C-D-h>", function()
	--shiftEditorGroup("Left")
	--end)
	--noremap({ "n", "x" }, "<C-D-l>", function()
	--shiftEditorGroup("Right")
	--end)

	-- quick(ish) saving
	noremap("n", "<leader>s", function()
		triggerVSCodeCallCommand("workbench.action.files.save")
	end)
	noremap("n", "<leader>S", function()
		triggerVSCodeCallCommand("workbench.action.files.saveAll")
	end)

	-- Show the fuzzy file finder
	noremap("n", "<leader>ff", function()
		triggerVSCodeCallCommand("workbench.action.quickOpen")
	end)

	-- Show the command palette
	noremap("n", "<leader>cx", function()
		cmd([[call VSCodeNotifyVisual("workbench.action.showCommands", 1)]])
	end)

	-- Toggle the sidebar
	noremap("n", "<leader>e", function()
		triggerVSCodeNotifyCommand("workbench.action.toggleSidebarVisibility")
	end)
end

return M
