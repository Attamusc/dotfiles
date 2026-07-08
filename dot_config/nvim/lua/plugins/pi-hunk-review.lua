-- pi-hunk-review.nvim — surface a live pi session's working-tree edits inline.
-- Phase 1: cross-repo hunk picker on mini.diff + snacks.
-- Referenced via a local `dir =` until the repo is pushed to GitHub.
return {
  {
    dir = "/Users/attamusc/projects/github.com/Attamusc/pi-hunk-review.nvim",
    name = "pi-hunk-review.nvim",
    dependencies = { "nvim-mini/mini.diff", "folke/snacks.nvim" },
    cmd = { "PiHunks", "PiHunkReject", "PiHunkNext", "PiHunkPrev" },
    keys = {
      { "<leader>hh", "<cmd>PiHunks<cr>", desc = "pi-hunks: pick" },
      { "<leader>hr", "<cmd>PiHunkReject<cr>", desc = "pi-hunks: reject under cursor" },
      { "<leader>hn", "<cmd>PiHunkNext<cr>", desc = "pi-hunks: next hunk" },
      { "<leader>hp", "<cmd>PiHunkPrev<cr>", desc = "pi-hunks: prev hunk" },
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
