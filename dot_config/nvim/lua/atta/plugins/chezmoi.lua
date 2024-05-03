local M = {
  {
    'xvzc/chezmoi.nvim',
    dependencies = { 'nvim-lua/plenary.nvim',
      {
        'alker0/chezmoi.vim',
        lazy = false,
        init = function()
          vim.g['chezmoi#use_tmp_buffer'] = true
        end,
      },
    },
    config = function()
      require("chezmoi").setup({})

      -- Apply chances when editing any file inside the chezmoi directory
      vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
        pattern = { os.getenv("HOME") .. "/.local/share/chezmoi/*" },
        callback = function()
          vim.schedule(require("chezmoi.commands.__edit").watch)
        end,
      })
    end
  },
}

return M
