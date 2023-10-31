local M = {
  "mfussenegger/nvim-dap",
  "rcarriga/nvim-dap-ui",
}

function M.config()
  local dap = require("dap")
  local dapui = require("dapui")

  dapui.setup()

  dap.listeners.after.event_initialized["dapui_config"] = function()
    dapui.open()
  end
  dap.listeners.after.event_terminated["dapui_config"] = function()
    dapui.close()
  end
  dap.listeners.after.event_exited["dapui_config"] = function()
    dapui.close()
  end

  vim.keymap.set("n", "<leader>dt", ":DapToggleBreakpoint<cr>")
  vim.keymap.set("n", "<leader>dx", ":DapTerminate<cr>")
  vim.keymap.set("n", "<leader>do", ":DapStepOver<cr>")
end

return M
