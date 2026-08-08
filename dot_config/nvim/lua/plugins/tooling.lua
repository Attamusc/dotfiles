local headless = #vim.api.nvim_list_uis() == 0

return {
  {
    "mason-org/mason.nvim",
    opts = function(_, opts)
      if headless then
        opts.ensure_installed = {}
      end
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter",
    opts = function(_, opts)
      if headless then
        opts.ensure_installed = {}
      end
    end,
  },
}
