import { warn } from "../logger.js";
import { findBy, toPascalCase } from "../util.js";
import { webpackRequire } from "../wpunpk.mix.js";
import { exportedFunctions, exportedMemos, modules, src } from "./index.js";
import { React } from "../expose/React.js";
import { Platform } from "../expose/Platform.js";
import { findPlaylistMenu } from "./playlist-menu.js";
//#region modules/stdlib/src/webpack/ReactComponents.xpui.ts
await CHUNKS.xpui.promise;
const Menus = Object.fromEntries(exportedMemos.flatMap((m) => {
	const type = {
		album: "Album",
		show: "PodcastShow",
		artist: "Artist",
		track: "Track"
	}[src(m.type).match(/value:"([\w-]+)"/)?.[1] ?? ""];
	return type ? [[type, m]] : [];
}));
const findModuleId = (needle, pred) => {
	const hit = modules.find(([, v]) => pred(v.toString()));
	if (!hit) warn("[stdlib] webpack needle miss:", needle);
	return hit?.[0];
};
const requireExports = (id) => id === void 0 ? {} : webpackRequire(id);
const ContextMenuModuleID = findModuleId("toggleContextMenu", (s) => s.includes("toggleContextMenu"));
Menus.Playlist = findPlaylistMenu(modules, requireExports);
if (Menus.Playlist === void 0) warn("[stdlib] webpack needle miss: playlist menu component");
const Cards = Object.assign({
	Generic: exportedFunctions.find((f) => src(f).includes("OnMouseDown") && src(f).match(/^[^;]*headerText/) && src(f).match(/^[^;]*featureIdentifier/) && src(f).match(/^[^;]*renderCardImage/)),
	HeroGeneric: findBy("cardPlayButtonFactory", "featureIdentifier", "getSignifierContent")(exportedFunctions),
	CardImage: findBy("\"card-image\"")(exportedFunctions)
}, Object.fromEntries([exportedFunctions.map((m) => {
	try {
		const match = m.toString().match(/featureIdentifier:"(.+?)"/);
		if (!match) return [];
		const name = match[1];
		return [[toPascalCase(name), m]];
	} catch (e) {
		return [];
	}
}), exportedMemos.map((m) => {
	try {
		const match = m.type.toString().match(/featureIdentifier:"(.+?)"/);
		if (!match) return [];
		const name = match[1];
		return [[toPascalCase(name), m]];
	} catch (e) {
		return [];
	}
})].flat(2)));
const RemoteConfigProviderComponent = findBy("resolveSuspense", "configuration")(exportedFunctions);
const exportedMemoFRefs = exportedMemos.filter((m) => m.type.$$typeof === Symbol.for("react.forward_ref"));
const Nav = exportedMemoFRefs.find((m) => src(m.type.render).includes("navigationalRoot"));
const NavTo = exportedMemoFRefs.find((m) => src(m.type.render).includes("pageId"));
const InstrumentedRedirect = exportedFunctions.find((f) => src(f).includes("getInteractionId") && /\bto:/.test(src(f)));
const SnackbarProvider = findBy("enqueueSnackbar called with invalid argument")(exportedFunctions);
const ContextMenu = Object.values(requireExports(ContextMenuModuleID))[0];
const RightClickMenu = findBy("action", "open", "trigger", "right-click")(exportedFunctions);
const Tooltip = findBy("hover-or-focus", "tooltip")(exportedFunctions);
const Menu = findBy("getInitialFocusElement", "children")(exportedFunctions);
const MenuItem = findBy("handleMouseEnter", "onClick")(exportedFunctions);
const MenuItemSubMenu = findBy("subMenuIcon")(exportedFunctions);
const RemoteConfigProvider = ({ configuration = Platform.getRemoteConfiguration(), children = void 0 }) => React.createElement(RemoteConfigProviderComponent, { configuration }, children);
const Snackbar = {
	wrapper: findBy("encore-light-theme", "elevated")(exportedFunctions),
	simpleLayout: findBy("leading", "center", "trailing")(exportedFunctions),
	ctaText: findBy("ctaText")(exportedFunctions),
	styledImage: findBy("placeholderSrc")(exportedFunctions)
};
const FilterBox = exportedMemos.find((f) => src(f.type).includes("filterBoxApiRef"));
const ScrollableContainer = findBy("scrollLeft", "showButtons")(exportedFunctions);
const ScrollableText = findBy("scrollLeft", "pauseAtEndEdgeDurationMs")(exportedFunctions);
const Router = findBy("navigationType", "static")(exportedFunctions);
const Routes = findBy(/\([a-zA-Z_\$][\w\$]*\)\{let\{children:[a-zA-Z_\$][\w\$]*,location:[a-zA-Z_\$][\w\$]*\}=[a-zA-Z_\$][\w\$]*/)(exportedFunctions);
const Route = findBy(/^function [a-zA-Z_\$][\w\$]*\([a-zA-Z_\$][\w\$]*\)\{\(0,[a-zA-Z_\$][\w\$]*\.[a-zA-Z_\$][\w\$]*\)\(\!1\)\}$/)(exportedFunctions);
const StoreProvider = findBy("notifyNestedSubs", "serverState")(exportedFunctions);
const GenericModal = findBy("isOpen", "contentLabel")(exportedFunctions);
const Tracklist = exportedMemos.find((f) => src(f.type).includes("nrValidItems"));
const TracklistColumnsContextProvider = findBy("columns", "visibleColumns", "toggleVisible")(exportedFunctions);
//#endregion
export { Cards, ContextMenu, FilterBox, GenericModal, InstrumentedRedirect, Menu, MenuItem, MenuItemSubMenu, Menus, Nav, NavTo, RemoteConfigProvider, RemoteConfigProviderComponent, RightClickMenu, Route, Router, Routes, ScrollableContainer, ScrollableText, Snackbar, SnackbarProvider, StoreProvider, Tooltip, Tracklist, TracklistColumnsContextProvider };

//# sourceMappingURL=ReactComponents.xpui.js.map