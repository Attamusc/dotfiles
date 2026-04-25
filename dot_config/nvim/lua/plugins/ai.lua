return {
  {
    "folke/sidekick.nvim",
    ---@type sidekick.Config
    opts = {
      cli = {
        win = {
          split = {
            width = 0,
            height = 0,
          },
        },
      },
    },
  },
  {
    "carderne/pi-nvim",
    config = function()
      require("pi-nvim").setup()
    end,
  },
}
