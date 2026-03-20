return {
  "folke/snacks.nvim",
  ---@type snacks.Config
  opts = {
    dashboard = {
      preset = {
        keys = {
          { icon = " ", key = "f", desc = "Find File", action = ":lua Snacks.dashboard.pick('files')" },
          {
            icon = " ",
            key = "r",
            desc = "Recent Files",
            action = ":lua Snacks.dashboard.pick('oldfiles')",
          },
          {
            icon = " ",
            key = "g",
            desc = "Find Text",
            action = ":lua Snacks.dashboard.pick('live_grep')",
          },
          { icon = " ", key = "s", desc = "Restore Session", section = "session" },
          {
            icon = "󱚣",
            key = "a",
            desc = "Pi",
            action = function()
              require("sidekick.cli").toggle({ name = "pi", focus = true })
            end,
          },
          { icon = "󰒲 ", key = "l", desc = "Lazy", action = ":Lazy" },
          { icon = " ", key = "x", desc = "Lazy Extras", action = ":LazyExtras" },
          {
            icon = " ",
            key = "c",
            desc = "Config",
            action = ":lua Snacks.dashboard.pick('files', {cwd = vim.fn.stdpath('config')})",
          },
          { icon = " ", key = "q", desc = "Quit", action = ":qa" },
        },
        header = [[
 █████╗ ████████╗████████╗ █████╗ ██╗   ██╗██╗███╗   ███╗
██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗██║   ██║██║████╗ ████║
███████║   ██║      ██║   ███████║██║   ██║██║██╔████╔██║
██╔══██║   ██║      ██║   ██╔══██║╚██╗ ██╔╝██║██║╚██╔╝██║
██║  ██║   ██║      ██║   ██║  ██║ ╚████╔╝ ██║██║ ╚═╝ ██║
╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═╝     ╚═╝
        ]],
      },
      sections = {
        { section = "header" },
        { section = "keys", gap = 1, padding = 1 },
        { section = "startup" },
      },
    },
  },
}
