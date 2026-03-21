local TV_ARGS = { "--no-remote", "--no-status-bar", "--layout", "landscape" }
local TV_ARGS_PREVIEW = { "--no-remote", "--no-status-bar", "--layout", "landscape", "--preview-size", "70" }

return {
  -- Disable snacks_picker keybindings that tv.nvim overrides
  {
    "folke/snacks.nvim",
    keys = {
      { "<leader><space>", false },
      { "<leader>ff", false },
      { "<leader>fF", false },
      { "<leader>/", false },
      { "<leader>sg", false },
      { "<leader>sG", false },
      { "<leader>gd", false },
    },
  },
  {
    "alexpasmantier/tv.nvim",
    opts = function()
      local h = require("tv").handlers

      -- Shared handler sets for common actions
      local file_handlers = {
        ["<CR>"] = h.open_as_files,
        ["<C-q>"] = h.send_to_quickfix,
        ["<C-s>"] = h.open_in_split,
        ["<C-v>"] = h.open_in_vsplit,
        ["<C-y>"] = h.copy_to_clipboard,
      }

      local line_handlers = {
        ["<CR>"] = h.open_at_line,
        ["<C-q>"] = h.send_to_quickfix,
        ["<C-s>"] = h.open_in_split,
        ["<C-v>"] = h.open_in_vsplit,
        ["<C-y>"] = h.copy_to_clipboard,
      }

      return {
        channels = {
          files = { args = TV_ARGS_PREVIEW, handlers = file_handlers },
          text = { args = TV_ARGS_PREVIEW, handlers = line_handlers },
          ["git-diff"] = { args = TV_ARGS_PREVIEW, handlers = line_handlers },
          ["git-log"] = {
            args = TV_ARGS_PREVIEW,
            handlers = {
              ["<CR>"] = function(entries)
                if #entries > 0 then
                  vim.cmd("enew | setlocal buftype=nofile bufhidden=wipe")
                  vim.cmd("silent 0read !git show " .. vim.fn.shellescape(entries[1]))
                  vim.cmd("1delete _ | setlocal filetype=git nomodifiable")
                  vim.cmd("normal! gg")
                end
              end,
              ["<C-y>"] = h.copy_to_clipboard,
            },
          },
          ["git-branch"] = {
            args = TV_ARGS,
            handlers = {
              ["<CR>"] = h.execute_shell_command("git checkout {}"),
              ["<C-y>"] = h.copy_to_clipboard,
            },
          },
        },
      }
    end,
    -- Load on :Tv command (used by dashboard) or keybindings
    cmd = { "Tv" },
    keys = {
      -- files
      { "<leader><space>", "<cmd>Tv files<cr>", desc = "Find Files (Root Dir)" },
      { "<leader>ff", "<cmd>Tv files<cr>", desc = "Find Files (Root Dir)" },
      { "<leader>fF", "<cmd>Tv files<cr>", desc = "Find Files (cwd)" },
      -- grep
      { "<leader>/", "<cmd>Tv text<cr>", desc = "Grep (Root Dir)" },
      { "<leader>sg", "<cmd>Tv text<cr>", desc = "Grep (Root Dir)" },
      { "<leader>sG", "<cmd>Tv text<cr>", desc = "Grep (cwd)" },
      -- git
      { "<leader>gd", "<cmd>Tv git-diff<cr>", desc = "Git Diff" },
      { "<leader>gl", "<cmd>Tv git-log<cr>", desc = "Git Log" },
      { "<leader>gb", "<cmd>Tv git-branch<cr>", desc = "Git Branch" },
    },
  },
}
