import { warn } from "../logger.js";
import { matchLast } from "../util.js";
import { React } from "../expose/React.js";
import { transformer } from "../../mixin.js";
import { placeMenuItemsHost } from "./menu-order.js";
import { Registry } from "./registry.js";
//#region modules/stdlib/src/registers/menu.ts
const items = new Registry();
const useMenuItem = () => React.useContext(globalThis.__MenuContext);
globalThis.__renderMenuItems = () => items.all();
transformer((emit) => (str) => {
	emit();
	str = str.replace(/("Menu".+?children:)([a-zA-Z_\$][\w\$]*)/, "$1[__renderMenuItems(),$2].flat()");
	const croppedInput = str.match(/.*value:"contextmenu"/)[0];
	const react = matchLast(croppedInput, /([a-zA-Z_\$][\w\$]*)\.useRef/g)[1];
	const [, menu, trigger, target] = matchLast(croppedInput, /\(\{[^}]*menu:([a-zA-Z_\$][\w\$]*),[^}]*trigger:([a-zA-Z_\$][\w\$]*),[^}]*triggerRef:([a-zA-Z_\$][\w\$]*)/g) ?? [];
	let value;
	if (menu && trigger && target) value = `{props:${menu}?.props,trigger:${trigger},target:${target}}`;
	else value = `{props:e.menu?.props,trigger:e.trigger,target:e.triggerRef}`;
	str = str.replace(/render:(.{0,100}?\(0,([a-zA-Z_\$][\w\$]*)\.jsx\)\([a-zA-Z_\$][\w\$]*\.[a-zA-Z_\$][\w\$]*,\{value:"contextmenu",[^\}]+\}[^,]+),/, `render:(props)=>{const value=${value};return ($2.jsx)((globalThis.__MenuContext??=${react}.createContext(null)).Provider,{value,children:($1)(props)});},`);
	return str;
}, { glob: /^\/xpui\.js/ });
const openedFromProfileMenu = (ctx) => {
	if (!ctx || ctx.trigger !== "click") return false;
	const button = ctx.target?.closest?.("button");
	if (!button) return false;
	return !!button.querySelector("img, figure") || button.getAttribute("data-testid") === "user-widget-link";
};
const createProfileMenuShouldAdd = () => (ctx) => openedFromProfileMenu(ctx);
const closeMenu = () => {
	setTimeout(() => {
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
	}, 0);
};
if (!globalThis.__SPICETIFY_APPLY_TRANSFORMS__ && typeof document !== "undefined") CHUNKS.xpui.promise.then(async () => {
	const { ReactDOM } = await import("../expose/React.js");
	const { createItemBoundary } = await import("./mount.js");
	const R = React;
	const createRoot = ReactDOM.createRoot;
	if (typeof createRoot !== "function") {
		warn("[stdlib] cannot mount menu items (no createRoot)");
		return;
	}
	let last = {
		trigger: "",
		target: document.body
	};
	document.addEventListener("contextmenu", (e) => {
		last = {
			trigger: "right-click",
			target: e.target
		};
	}, true);
	document.addEventListener("mousedown", (e) => {
		last = {
			trigger: "click",
			target: e.target
		};
	}, true);
	const ItemBoundary = createItemBoundary(R, "menu");
	const live = [];
	const processed = /* @__PURE__ */ new WeakSet();
	const sweep = (records = []) => {
		const changedMenus = new Set(records.map((record) => record.target));
		for (let i = live.length - 1; i >= 0; i--) if (!live[i].menu.isConnected) {
			live[i].root.unmount();
			live.splice(i, 1);
		} else if (changedMenus.has(live[i].menu)) placeMenuItemsHost(live[i].menu, live[i].host);
		if (items.size === 0) return;
		for (const menu of document.querySelectorAll("#context-menu [role=menu]")) {
			if (processed.has(menu)) continue;
			processed.add(menu);
			const host = document.createElement("li");
			host.setAttribute("role", "presentation");
			host.className = "spicetify-menu-items";
			placeMenuItemsHost(menu, host);
			const root = createRoot(host);
			globalThis.__MenuContext ??= R.createContext(null);
			root.render(R.createElement(globalThis.__MenuContext.Provider, { value: {
				props: null,
				...last
			} }, ...items.all().map((item, i) => R.createElement(ItemBoundary, { key: i }, item))));
			live.push({
				menu,
				host,
				root
			});
		}
	};
	new MutationObserver(sweep).observe(document.body, {
		childList: true,
		subtree: true
	});
});
//#endregion
export { closeMenu, createProfileMenuShouldAdd, items as default, openedFromProfileMenu, useMenuItem };

//# sourceMappingURL=menu.js.map