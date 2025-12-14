window.SYNIMA = window.SYNIMA || {};

// Do NOT use `const` here if other files previously declared it.
// This prevents "Identifier already declared" errors.
window.SYNIMA_PERSIST_KEYS = window.SYNIMA_PERSIST_KEYS || {
	// tree tab
	names: "synima_tree_renames",
	lineWidth: "synima_tree_line_width",
	fontSize: "synima_tree_font_size",
	alignLabels: "synima_tree_align_labels",
	rootTip: "synima_tree_root_tip",

	// Synteny tab
	syntenyFontSize: "synima_synteny_font_size",
	syntenyMode: "synima_synteny_mode",
	syntenyContigColorMode: "synima_synteny_contig_color_mode",
	syntenyContigBaseColor: "synima_synteny_contig_base_color",
	syntenyContigPalette:   "synima_synteny_contig_palette",
	syntenyContigOverrides: "synima_synteny_contig_overrides",

	syntenyBlockColor: "synima_synteny_block_color",
	syntenyBlockOpacity: "synima_synteny_block_opacity",

	syntenyBgColor: "synima_synteny_bg_color",

	syntenyLabelColor: "synima_synteny_label_color"
};

window.SYNIMA_STATE = window.SYNIMA_STATE || {};
window.SYNIMA_STATE.syntenyFontSize = window.SYNIMA_STATE.syntenyFontSize ?? 12;
window.SYNIMA_STATE.syntenyMode = window.SYNIMA_STATE.syntenyMode ?? "spans";

// contig gaps
window.SYNIMA_PERSIST_KEYS.syntenyGap = "synima_synteny_gap_px";
window.SYNIMA_STATE.syntenyGapPx = window.SYNIMA_STATE.syntenyGapPx ?? 0;

// contig box size/scale
window.SYNIMA_PERSIST_KEYS.syntenyTrackScale = "synima_synteny_track_scale";
window.SYNIMA_STATE.syntenyTrackScale = window.SYNIMA_STATE.syntenyTrackScale ?? 1.0;

// tree width
window.SYNIMA_PERSIST_KEYS.syntenyTreeWidth = "synima_synteny_tree_width_pct";
window.SYNIMA_STATE.syntenyTreeWidthPct = window.SYNIMA_STATE.syntenyTreeWidthPct ?? 20;

// contig colours
window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode = "synima_synteny_contig_color_mode";
window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor = "synima_synteny_contig_base_color";
window.SYNIMA_PERSIST_KEYS.syntenyContigPalette = "synima_synteny_contig_palette";
window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides = "synima_synteny_contig_overrides";

window.SYNIMA_STATE.syntenyContigColorMode = window.SYNIMA_STATE.syntenyContigColorMode ?? "single"; // single | palette_by_genome
window.SYNIMA_STATE.syntenyContigBaseColor = window.SYNIMA_STATE.syntenyContigBaseColor ?? "#6699cc";
window.SYNIMA_STATE.syntenyContigPalette = window.SYNIMA_STATE.syntenyContigPalette ?? "classic";
window.SYNIMA_STATE.syntenyContigOverrides = window.SYNIMA_STATE.syntenyContigOverrides ?? {}; // {"genome|contig": "#rrggbb"}
window.SYNIMA_STATE.selectedContigKey = window.SYNIMA_STATE.selectedContigKey ?? null;

window.SYNIMA_STATE.syntenyBlockColor = window.SYNIMA_STATE.syntenyBlockColor ?? "#ffffff";

window.SYNIMA_STATE.syntenyBlockOpacity = window.SYNIMA_STATE.syntenyBlockOpacity ?? 0.5;

window.SYNIMA_STATE.syntenyBgColor = window.SYNIMA_STATE.syntenyBgColor ?? "#0f1b30";

window.SYNIMA_STATE.syntenyLabelColor = window.SYNIMA_STATE.syntenyLabelColor ?? "#ffffff";