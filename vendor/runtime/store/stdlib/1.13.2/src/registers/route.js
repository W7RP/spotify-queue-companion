import { React } from "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { Platform } from "../expose/Platform.js";
//#region modules/stdlib/src/registers/route.ts
const registry = new class extends Registry {
	add(value) {
		refresh?.();
		return super.add(value);
	}
	delete(value) {
		refresh?.();
		return super.delete(value);
	}
}();
let refresh;
let historyHooked = false;
const matchRoute = (pathname, pattern) => {
	const path = pathname.split("/").filter(Boolean);
	const parts = pattern.split("/").filter(Boolean);
	for (let i = 0; i < parts.length; i++) {
		if (parts[i] === "*") return true;
		if (parts[i].startsWith(":")) {
			if (path[i] === void 0) return false;
			continue;
		}
		if (parts[i] !== path[i]) return false;
	}
	return path.length === parts.length;
};
mountRegistryAnchor({
	className: "spicetify-route-overlay",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
		if (cb && !historyHooked) {
			historyHooked = true;
			try {
				Platform.getHistory().listen(() => refresh?.());
			} catch (e) {
				console.warn("[stdlib] route overlay cannot follow history:", e);
			}
		}
	},
	findSlot: () => {
		const main = document.querySelector(".main-view-container");
		return main ? { parent: main } : null;
	},
	renderItems: (items) => {
		const pathname = (() => {
			try {
				return Platform.getHistory().location.pathname;
			} catch {
				return null;
			}
		})();
		if (!pathname) return null;
		const route = items.find((item) => {
			const path = item?.props?.path;
			return typeof path === "string" && matchRoute(pathname, path);
		});
		if (!route) return null;
		return React.createElement("div", {
			key: route.props.path,
			className: "spicetify-route-page",
			style: {
				position: "absolute",
				inset: 0,
				zIndex: 2,
				overflow: "auto"
			}
		}, route.props.element ?? route.props.children);
	}
});
//#endregion
export { registry as default };

//# sourceMappingURL=route.js.map