import { warn } from "../logger.js";
import { React } from "../expose/React.js";
import items, { closeMenu, openedFromProfileMenu, useMenuItem } from "./menu.js";
import { mountAdjacent } from "./mount.js";
import { isNativeAnchor, resolveNativeAnchor } from "./nativeAnchors.js";
import registry, { NavLink, useHistoryRefresh } from "./navlink.js";
import panel_default from "./panel.js";
import registry$1, { PlaybarButton } from "./playbarButton.js";
import registry$2 from "./playbarWidget.js";
import root_default from "./root.js";
import registry$3 from "./route.js";
import registry$4, { SPICETIFY_SETTINGS_ROUTE, settingsAction } from "./settingsSection.js";
import registry$5 from "./settingsRow.js";
import registry$6, { TopbarLeftButton } from "./topbarLeftButton.js";
import registry$7, { TopbarRightButton } from "./topbarRightButton.js";
//#region modules/stdlib/src/registers/index.ts
const [rootChild, rootProvider] = root_default;
const registers = {
	menu: items,
	navlink: registry,
	panel: panel_default,
	playbarButton: registry$1,
	playbarWidget: registry$2,
	rootChild,
	rootProvider,
	route: registry$3,
	settingsRow: registry$5,
	settingsAction,
	settingsSection: registry$4,
	topbarLeftButton: registry$6,
	topbarRightButton: registry$7
};
const BUTTON_SLOTS = {
	"topbar-left": ["topbarLeftButton", TopbarLeftButton],
	"topbar-right": ["topbarRightButton", TopbarRightButton],
	playbar: ["playbarButton", PlaybarButton]
};
var Registrar = class {
	id;
	constructor(id) {
		this.id = id;
	}
	ledger = /* @__PURE__ */ new Map();
	disposers = /* @__PURE__ */ new Set();
	/**
	* Place a button in a known client location without touching register keys
	* or building the component yourself. Returns a handle to remove it early;
	* otherwise it is cleaned up when the module unloads.
	*/
	placeButton(location, options) {
		const slot = BUTTON_SLOTS[location];
		if (!slot) throw new Error(`[stdlib] unknown button location: ${location}`);
		const [key, Component] = slot;
		const element = React.createElement(Component, {
			order: 0,
			...options
		});
		const inGroup = () => {
			this.register(key, element);
			return { remove: () => this.unregister(key, element) };
		};
		if (!options.near) return inGroup();
		const { anchor, side = "after" } = options.near;
		if (!isNativeAnchor(anchor)) {
			warn(`[stdlib] unknown native anchor "${anchor}"; placing "${options.label}" with order instead`);
			return inGroup();
		}
		let fellBackHandle;
		const adjacent = mountAdjacent({
			className: "spicetify-near-button",
			element,
			findTarget: () => resolveNativeAnchor(anchor),
			side,
			giveUpMs: 5e3,
			onGiveUp: () => {
				fellBackHandle ??= inGroup();
			}
		});
		const cleanup = () => {
			adjacent.remove();
			fellBackHandle?.remove();
		};
		this.disposers.add(cleanup);
		return { remove: () => {
			this.disposers.delete(cleanup);
			cleanup();
		} };
	}
	/**
	* Register a Spicetify-owned right-sidebar panel. The returned controller
	* opens, closes and observes the panel; module unload disposes it.
	*/
	registerPanel(options) {
		const registration = {
			...options,
			id: `${this.id}:${options.id ?? "default"}`
		};
		panel_default.add(registration);
		const controller = panel_default.controller(registration);
		if (!controller) throw new Error(`[stdlib] failed to register panel: ${registration.id}`);
		const dispose = () => panel_default.delete(registration);
		this.disposers.add(dispose);
		return {
			...controller,
			dispose: () => {
				this.disposers.delete(dispose);
				dispose();
			}
		};
	}
	register(type, ...args) {
		this.ledger.set(args[0], type);
		registers[type].add(...args);
	}
	registerRoute(path, element) {
		const item = React.createElement("route", {
			path,
			element
		});
		this.register("route", item);
		return item;
	}
	unregister(type, ...args) {
		this.ledger.delete(args[0]);
		registers[type].delete(...args);
	}
	dispose() {
		for (const [item, type] of this.ledger.entries()) this.unregister(type, item);
		this.ledger.clear();
		for (const dispose of this.disposers) dispose();
		this.disposers.clear();
	}
};
const createRegistrar = (ctx) => {
	const registrar = new Registrar(ctx.identifier);
	ctx.defer(() => {
		registrar.dispose();
	});
	return registrar;
};
//#endregion
export { NavLink, PlaybarButton, Registrar, SPICETIFY_SETTINGS_ROUTE, TopbarLeftButton, TopbarRightButton, closeMenu, createRegistrar, openedFromProfileMenu, useHistoryRefresh, useMenuItem };

//# sourceMappingURL=index.js.map