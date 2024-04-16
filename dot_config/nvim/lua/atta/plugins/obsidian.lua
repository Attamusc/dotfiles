local M = {
	"epwalsh/obsidian.nvim",
	lazy = true,
	ft = "markdown",
  dependencies = {
    "nvim-lua/plenary.nvim",
  },
  opt = {
    workspaces = {
      {
        name = "work",
        path = "~/OneDrive/Obsidian/github-notes",
      }
    },
  },
}

return M
