-- pi-hunk-review — surface a live pi session's working-tree edits inline.
return {
  {
    "Attamusc/pi-hunk-review",
    name = "pi-hunk-review",
    tag = "v0.1.1",
    init = function(plugin)
      vim.opt.rtp:prepend(plugin.dir .. "/shells/nvim")
    end,
    dependencies = { "folke/snacks.nvim" },
    cmd = { "PiHunks", "PiHunkNote", "PiHunkSubmit", "PiHunkReject" },
    keys = {
      { "<leader>hh", "<cmd>PiHunks<cr>", desc = "pi-hunks: pick" },
      { "<leader>hN", "<cmd>PiHunkNote<cr>", desc = "pi-hunks: note" },
      { "<leader>hs", "<cmd>PiHunkSubmit<cr>", desc = "pi-hunks: submit" },
      { "<leader>hr", "<cmd>PiHunkReject<cr>", desc = "pi-hunks: reject under cursor" },
    },
    -- lazy owns the keymaps above (they load the plugin on first press), so the
    -- plugin's own default keymaps stay off to avoid double registration.
    ---@type PiHunkReview.Config
    opts = { set_default_keymaps = false },
    config = function(_, opts)
      require("pi-hunk-review").setup(opts)
    end,
  },
  {
    "folke/which-key.nvim",
    opts = {
      spec = {
        { "<leader>h", group = "pi-hunks" },
      },
    },
  },
}
