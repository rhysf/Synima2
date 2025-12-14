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
  syntenyMode: "synima_synteny_mode"
};

window.SYNIMA_STATE = window.SYNIMA_STATE || {};
window.SYNIMA_STATE.syntenyFontSize = window.SYNIMA_STATE.syntenyFontSize ?? 12;
window.SYNIMA_STATE.syntenyMode = window.SYNIMA_STATE.syntenyMode ?? "spans";

window.SYNIMA_PERSIST_KEYS.syntenyGap = "synima_synteny_gap_px";
window.SYNIMA_STATE.syntenyGapPx = window.SYNIMA_STATE.syntenyGapPx ?? 0;