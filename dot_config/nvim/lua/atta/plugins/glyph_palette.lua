local cmd = vim.cmd

local M = {}

function M.setup()
  cmd([[
    augroup GlyphPaletteGroup
      autocmd!
      autocmd FileType fern call glyph_palette#apply()
      autocmd FileType nerdtree,startify call glyph_palette#apply()
    augroup END
  ]])
end

return M
