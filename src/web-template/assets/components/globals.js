window.SYNIMA = window.SYNIMA || {};
window.SYNIMA_CONFIG = window.SYNIMA_CONFIG || {};

window.SYNIMA_CLOUD_KEYS = window.SYNIMA_CLOUD_KEYS || {
	baseUrl: "synima_cloud_base_url",
	userEmail: "synima_cloud_user_email",
	apiKey: "synima_cloud_api_key"
};

SYNIMA.getCloudBaseUrl = function () {
	const configUrl = (window.SYNIMA_CONFIG && typeof window.SYNIMA_CONFIG.cloudBaseUrl === "string")
		? window.SYNIMA_CONFIG.cloudBaseUrl.trim()
		: "";
	const storedUrl = (() => {
		try {
			const v = localStorage.getItem(window.SYNIMA_CLOUD_KEYS.baseUrl);
			return typeof v === "string" ? v.trim() : "";
		} catch (e) {
			return "";
		}
	})();
	const raw = configUrl || storedUrl;
	return raw ? raw.replace(/\/+$/, "") : "";
};

SYNIMA.getCloudUserEmail = function () {
	try {
		const email = localStorage.getItem(window.SYNIMA_CLOUD_KEYS.userEmail);
		return (typeof email === "string" && email.trim()) ? email.trim() : "";
	} catch (e) {
		return "";
	}
};

SYNIMA.getCloudApiKey = function () {
	try {
		const apiKey = localStorage.getItem(window.SYNIMA_CLOUD_KEYS.apiKey);
		return (typeof apiKey === "string" && apiKey.trim()) ? apiKey.trim() : "";
	} catch (e) {
		return "";
	}
};

SYNIMA.setCloudAuth = function (email, apiKey) {
	try {
		localStorage.setItem(window.SYNIMA_CLOUD_KEYS.userEmail, (email || "").trim());
		localStorage.setItem(window.SYNIMA_CLOUD_KEYS.apiKey, (apiKey || "").trim());
	} catch (e) {}
};

SYNIMA.clearCloudAuth = function () {
	try {
		localStorage.removeItem(window.SYNIMA_CLOUD_KEYS.userEmail);
		localStorage.removeItem(window.SYNIMA_CLOUD_KEYS.apiKey);
	} catch (e) {}
};

SYNIMA.syncCloudSession = async function () {
	const baseUrl = SYNIMA.getCloudBaseUrl();
	if (!baseUrl) return false;

	try {
		const resp = await fetch(`${baseUrl}/api/me.php`, {
			method: "GET",
			mode: "cors",
			credentials: "include",
			cache: "no-store"
		});
		const payload = await resp.json();
		if (!resp.ok || !payload || payload.ok === false) return false;
		if (payload.logged_in && payload.user) {
			const email = payload.user.email || "";
			const apiKey = payload.user.api_key || SYNIMA.getCloudApiKey();
			if (email || apiKey) SYNIMA.setCloudAuth(email, apiKey);
			return Boolean(apiKey);
		}
		return false;
	} catch (e) {
		return false;
	}
};

SYNIMA.pollCloudSession = async function (timeoutMs, intervalMs) {
	const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 90000;
	const interval = Number.isFinite(intervalMs) ? intervalMs : 1500;
	const start = Date.now();

	while ((Date.now() - start) < timeout) {
		const ok = await SYNIMA.syncCloudSession();
		if (ok) return true;
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
	return false;
};

SYNIMA.cloudState = window.SYNIMA.cloudState || {
	baseUrl: "",
	enabled: false,
	online: navigator.onLine !== false,
	reachable: false,
	userEmail: "",
	statusLabel: "Offline mode"
};

SYNIMA.refreshCloudState = async function () {
	const baseUrl = SYNIMA.getCloudBaseUrl();
	const online = navigator.onLine !== false;
	const enabled = Boolean(baseUrl);
	let reachable = false;

	if (enabled && online) {
		let timer = null;
		try {
			const controller = new AbortController();
			timer = setTimeout(() => controller.abort(), 2500);
			await fetch(baseUrl, {
				method: "GET",
				mode: "no-cors",
				cache: "no-store",
				signal: controller.signal
			});
			reachable = true;
		} catch (e) {
			reachable = false;
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	const userEmail = enabled ? SYNIMA.getCloudUserEmail() : "";
	const apiKey = enabled ? SYNIMA.getCloudApiKey() : "";

	if (enabled && online && !apiKey) {
		const now = Date.now();
		const last = Number(window.SYNIMA._lastCloudSessionSyncAt || 0);
		if (!last || (now - last) > 12000) {
			window.SYNIMA._lastCloudSessionSyncAt = now;
			await SYNIMA.syncCloudSession();
		}
	}

	const userEmailFinal = enabled ? SYNIMA.getCloudUserEmail() : "";
	const apiKeyFinal = enabled ? SYNIMA.getCloudApiKey() : "";
	const statusLabel = !enabled
		? "Offline mode"
		: !online
			? "Offline"
			: reachable
				? "Cloud connected"
				: "Cloud unavailable";

	SYNIMA.cloudState = {
		baseUrl,
		enabled,
		online,
		reachable,
		userEmail: userEmailFinal,
		apiKey: apiKeyFinal,
		statusLabel
	};

	return SYNIMA.cloudState;
};

SYNIMA.cloudApi = async function (path, options) {
	const cloudState = await SYNIMA.refreshCloudState();
	if (!cloudState.enabled) {
		throw new Error("Cloud mode is not configured.");
	}
	const headers = Object.assign({}, (options && options.headers) ? options.headers : {});
	if (cloudState.apiKey) headers["X-API-Key"] = cloudState.apiKey;
	const isFormData = (options && options.body && typeof FormData !== "undefined" && options.body instanceof FormData);
	if (!headers["Content-Type"] && options && options.body && !isFormData) headers["Content-Type"] = "application/json";

	const resp = await fetch(`${cloudState.baseUrl}${path}`, Object.assign({}, options || {}, {
		headers,
		credentials: "include",
		mode: "cors"
	}));

	let payload = {};
	try {
		payload = await resp.json();
	} catch (e) {
		payload = {};
	}

	if (!resp.ok || payload.ok === false) {
		const detail = [payload.message, payload.detail, payload.json_error]
			.filter((x) => typeof x === "string" && x.trim())
			.join(" | ");
		const message = detail || `Request failed (${resp.status})`;
		throw new Error(message);
	}

	return payload;
};

SYNIMA.getCurrentReportPayload = function () {
	const load = function (id) {
		try {
			const el = document.getElementById(id);
			return el ? JSON.parse(el.textContent || "{}") : {};
		} catch (e) {
			return {};
		}
	};

	const orthologs = load("data-orthologs");
	const tree = load("data-tree");
	const synteny = load("data-synteny");
	const methods = load("data-methods");

	const summary = {
		single_copy_orthologs: orthologs.single_copy_orthologs || null,
		num_genomes: synteny && synteny.synteny_config ? Number(synteny.synteny_config.num_genomes || 0) : null,
		max_length: synteny && synteny.synteny_config ? Number(synteny.synteny_config.max_length || 0) : null,
		synima_version: methods && Array.isArray(methods.tools)
			? ((methods.tools.find((t) => t && t.name === "Synima") || {}).version || "")
			: ""
	};

	return {
		report: {
			orthologs,
			tree,
			synteny,
			methods
		},
		summary
	};
};

SYNIMA.loadSavedReportPayload = function (reportData) {
	if (!reportData || typeof reportData !== "object") {
		throw new Error("Invalid report payload.");
	}

	const update = function (id, value) {
		const el = document.getElementById(id);
		if (el) el.textContent = JSON.stringify(value || {});
	};

	update("data-orthologs", reportData.orthologs);
	update("data-tree", reportData.tree);
	update("data-synteny", reportData.synteny);
	update("data-methods", reportData.methods);

	if (typeof SYNIMA.router === "function") {
		SYNIMA.router(SYNIMA.currentPage || "orthologs");
	}
};

// Do NOT use `const` here if other files previously declared it.
// This prevents "Identifier already declared" errors.
window.SYNIMA_PERSIST_KEYS = window.SYNIMA_PERSIST_KEYS || {
	// tree tab
	names: "synima_tree_renames",
	lineWidth: "synima_tree_line_width",
	fontSize: "synima_tree_font_size",
	alignLabels: "synima_tree_align_labels",
	rootTip: "synima_tree_root_tip",
	treeYScale: "synima_tree_y_scale",

	// NEW tree appearance
	treeBgColor: "synima_tree_bg_color",
	treeLabelColor: "synima_tree_label_color",
	treeBranchColor: "synima_tree_branch_color",

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

	syntenyLabelColor: "synima_synteny_label_color",

	// genes tab
	genesCategories: "synima_genes_categories"
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

// tree extra
window.SYNIMA_STATE.treeYScale = window.SYNIMA_STATE.treeYScale ?? 1.0;
window.SYNIMA_STATE.treeBgColor = window.SYNIMA_STATE.treeBgColor ?? "#0f1b30";
window.SYNIMA_STATE.treeLabelColor = window.SYNIMA_STATE.treeLabelColor ?? "#ffffff";
window.SYNIMA_STATE.treeBranchColor = window.SYNIMA_STATE.treeBranchColor ?? "#ffffff";

// contig colours
window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode = "synima_synteny_contig_color_mode";
window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor = "synima_synteny_contig_base_color";
window.SYNIMA_PERSIST_KEYS.syntenyContigPalette = "synima_synteny_contig_palette";
window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides = "synima_synteny_contig_overrides";

// synteny colours  etc.
window.SYNIMA_STATE.syntenyContigColorMode = window.SYNIMA_STATE.syntenyContigColorMode ?? "single"; // single | palette_by_genome
window.SYNIMA_STATE.syntenyContigBaseColor = window.SYNIMA_STATE.syntenyContigBaseColor ?? "#6699cc";
window.SYNIMA_STATE.syntenyContigPalette = window.SYNIMA_STATE.syntenyContigPalette ?? "classic";
window.SYNIMA_STATE.syntenyContigOverrides = window.SYNIMA_STATE.syntenyContigOverrides ?? {}; // {"genome|contig": "#rrggbb"}
window.SYNIMA_STATE.selectedContigKey = window.SYNIMA_STATE.selectedContigKey ?? null;
window.SYNIMA_STATE.syntenyBlockColor = window.SYNIMA_STATE.syntenyBlockColor ?? "#ffffff";
window.SYNIMA_STATE.syntenyBlockOpacity = window.SYNIMA_STATE.syntenyBlockOpacity ?? 0.5;
window.SYNIMA_STATE.syntenyBgColor = window.SYNIMA_STATE.syntenyBgColor ?? "#0f1b30";
window.SYNIMA_STATE.syntenyLabelColor = window.SYNIMA_STATE.syntenyLabelColor ?? "#ffffff";
window.SYNIMA_MIDPOINT_VALUE = window.SYNIMA_MIDPOINT_VALUE || "__SYNIMA_MIDPOINT__";

// renaming contigs etc.
window.SYNIMA_PERSIST_KEYS.syntenyContigNames = window.SYNIMA_PERSIST_KEYS.syntenyContigNames || "synima_synteny_contig_names";

window.SYNIMA_STATE.syntenyContigNameOverrides = window.SYNIMA_STATE.syntenyContigNameOverrides || {};

// reverse complimenting
window.SYNIMA_PERSIST_KEYS.syntenyContigFlips = window.SYNIMA_PERSIST_KEYS.syntenyContigFlips || "synima_synteny_contig_flips";
window.SYNIMA_STATE.syntenyContigFlips = window.SYNIMA_STATE.syntenyContigFlips || {}; // {"genome|contig": true}

// contig border colour
// add key
window.SYNIMA_PERSIST_KEYS.syntenyContigStrokeColor = window.SYNIMA_PERSIST_KEYS.syntenyContigStrokeColor || "synima_synteny_contig_stroke_color";

// default
window.SYNIMA_STATE.syntenyContigStrokeColor = window.SYNIMA_STATE.syntenyContigStrokeColor ?? "#ffffff";

// scale bar
window.SYNIMA_PERSIST_KEYS.syntenyScaleShow      = "synima_synteny_scale_show";
window.SYNIMA_PERSIST_KEYS.syntenyScaleUnits     = "synima_synteny_scale_units";     // auto|bp|kb|mb|gb
window.SYNIMA_PERSIST_KEYS.syntenyScaleMax       = "synima_synteny_scale_max";       // "" => auto, otherwise number in chosen units
window.SYNIMA_PERSIST_KEYS.syntenyScaleIntervals = "synima_synteny_scale_intervals"; // e.g. 10
window.SYNIMA_PERSIST_KEYS.syntenyScaleAxisFont  = "synima_synteny_scale_axis_font";
window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelFont = "synima_synteny_scale_label_font";
window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelText = "synima_synteny_scale_label_text";

// defaults
window.SYNIMA_STATE.syntenyScaleShow      = window.SYNIMA_STATE.syntenyScaleShow ?? true;
window.SYNIMA_STATE.syntenyScaleUnits     = window.SYNIMA_STATE.syntenyScaleUnits ?? "auto";
window.SYNIMA_STATE.syntenyScaleMax       = window.SYNIMA_STATE.syntenyScaleMax ?? "";     // auto
window.SYNIMA_STATE.syntenyScaleIntervals = window.SYNIMA_STATE.syntenyScaleIntervals ?? 10;
window.SYNIMA_STATE.syntenyScaleAxisFont  = window.SYNIMA_STATE.syntenyScaleAxisFont ?? 20;
window.SYNIMA_STATE.syntenyScaleLabelFont = window.SYNIMA_STATE.syntenyScaleLabelFont ?? 24;
window.SYNIMA_STATE.syntenyScaleLabelText = window.SYNIMA_STATE.syntenyScaleLabelText ?? "Position in genome";

window.SYNIMA_PERSIST_KEYS.syntenyScaleLineWidth = window.SYNIMA_PERSIST_KEYS.syntenyScaleLineWidth || "synima_synteny_scale_line_width";

// default state
window.SYNIMA_STATE.syntenyScaleLineWidth = window.SYNIMA_STATE.syntenyScaleLineWidth ?? 1.0;

// genes tab defaults
window.SYNIMA_STATE.geneCategories = window.SYNIMA_STATE.geneCategories ?? [];
