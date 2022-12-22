local cmd = vim.cmd

local M = {
	"lambdalisue/glyph-palette.vim",
}

function M.config()
	cmd([[
    augroup GlyphPaletteGroup
      autocmd!
      autocmd FileType fern call glyph_palette#apply()
      autocmd FileType nerdtree,startify call glyph_palette#apply()
    augroup END
  ]])
end

return M
