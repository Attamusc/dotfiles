return {
	"lambdalisue/glyph-palette.vim",
	config = function()
		vim.cmd([[
      augroup GlyphPaletteGroup
        autocmd!
        autocmd FileType fern call glyph_palette#apply()
        autocmd FileType nerdtree,startify call glyph_palette#apply()
      augroup END
    ]])
	end,
}
