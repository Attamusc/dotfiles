local general = require('atta.main.general')
local keybindings = require('atta.main.keybindings')

local M = {}

function M.setup()
  general.setup()
  keybindings.setup()
end

return M
