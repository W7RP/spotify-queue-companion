//#region modules/stdlib/src/registers/nativeAnchors.ts
const NATIVE_ANCHOR_SELECTORS = {
	"playbar:lyrics": ["[data-testid=\"lyrics-button\"]"],
	"playbar:queue": ["[data-testid=\"control-button-queue\"]"],
	"playbar:mute": ["[data-testid=\"volume-bar-toggle-mute-button\"]"],
	"playbar:miniplayer": ["[data-testid=\"pip-toggle-button\"]"],
	"playbar:fullscreen": ["[data-testid=\"fullscreen-mode-button\"]"]
};
const isNativeAnchor = (name) => Object.hasOwn(NATIVE_ANCHOR_SELECTORS, name);
const resolveNativeAnchor = (name, root = document) => {
	const selectors = NATIVE_ANCHOR_SELECTORS[name];
	if (!selectors) return null;
	for (const selector of selectors) {
		const el = root.querySelector(selector);
		if (el) return el;
	}
	return null;
};
//#endregion
export { NATIVE_ANCHOR_SELECTORS, isNativeAnchor, resolveNativeAnchor };

//# sourceMappingURL=nativeAnchors.js.map