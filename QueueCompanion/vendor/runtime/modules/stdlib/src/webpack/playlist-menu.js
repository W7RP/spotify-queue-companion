//#region modules/stdlib/src/webpack/playlist-menu.ts
function source(value) {
	return typeof value === "function" ? Function.prototype.toString.call(value) : "";
}
function hasPlaylistMenuActions(text) {
	return text.includes("contextmenu.share.copy-playlist-link") && text.includes("canView") && text.includes("permissions");
}
function isPlaylistMenuFactory(value) {
	return hasPlaylistMenuActions(source(value));
}
function isMenuComponent(value) {
	let render = value;
	if (typeof render === "object" && render !== null && "$$typeof" in render) {
		if (render.$$typeof === Symbol.for("react.memo") && "type" in render) render = render.type;
		else if (render.$$typeof === Symbol.for("react.forward_ref") && "render" in render) render = render.render;
	}
	const text = source(render);
	if (/^async\b/.test(text)) return false;
	if (hasPlaylistMenuActions(text)) return /\b(?:jsx|jsxs|createElement)\s*\)?\s*\(/.test(text);
	return /^\(?([$\w]+)\)?=>\(0,[$\w]+\.jsx\)\([$\w]+,\{\.\.\.\1\}\)$/.test(text.replace(/\s/g, ""));
}
/** Match the menu factory, then its renderable export; never a playlist data mapper. */
function findPlaylistMenu(modules, requireModule) {
	const components = /* @__PURE__ */ new Set();
	try {
		for (const [id, factory] of modules) {
			if (!isPlaylistMenuFactory(factory)) continue;
			const exports = requireModule(id);
			if (typeof exports !== "object" || exports === null) continue;
			for (const value of Object.values(exports)) if (isMenuComponent(value)) components.add(value);
		}
	} catch {
		return;
	}
	return components.size === 1 ? components.values().next().value : void 0;
}
//#endregion
export { findPlaylistMenu, isPlaylistMenuFactory };

//# sourceMappingURL=playlist-menu.js.map