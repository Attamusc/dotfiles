return {
  {
    "saghen/blink.cmp",
    opts = {
      sources = {
        min_keyword_length = 2,
      },
    },
  },
  {
    "folke/lazydev.nvim",
    opts = {
      library = {
        -- Recognize the chezmoi source path so lazydev provides completions
        -- when editing the nvim config from the source directory
        { path = vim.env.HOME .. "/.local/share/chezmoi/dot_config/nvim", words = { "nvim" } },
      },
    },
  },
}
