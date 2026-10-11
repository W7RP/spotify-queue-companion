import { warn } from "../logger.js";
import { React } from "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { UI } from "../webpack/ComponentLibrary.gen.js";
import "../webpack/ComponentLibrary.js";
import { createIconComponent } from "../createIconComponent.js";
import { Platform } from "../expose/Platform.js";
import { classnames } from "../webpack/ClassNames.gen.js";
import "../webpack/ClassNames.js";
import { Tooltip } from "../webpack/ReactComponents.gen.js";
import "../webpack/ReactComponents.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/navlink.tsx
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
mountRegistryAnchor({
	className: "spicetify-navlinks-anchor",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
	},
	findSlot: () => {
		const wrapper = document.querySelector(".main-globalNav-historyButtonsWrapper");
		return wrapper ? { parent: wrapper } : null;
	},
	hostDisplay: "flex"
});
const useHistoryRefresh = () => {
	const [, force] = React.useReducer((n) => n + 1, 0);
	React.useEffect(() => {
		try {
			return Platform.getHistory().listen(() => force());
		} catch (e) {
			warn("[stdlib] cannot follow history:", e);
			return;
		}
	}, []);
};
const NavLink = (props) => {
	useHistoryRefresh();
	const isActive = Platform.getHistory().location.pathname?.startsWith(props.appRoutePath);
	const createIcon = () => createIconComponent({
		icon: isActive ? props.activeIcon : props.icon,
		iconSize: 16,
		realIconSize: 24
	});
	return /* @__PURE__ */ jsx(_NavLinkGlobal, {
		localizedApp: props.localizedApp,
		appRoutePath: props.appRoutePath,
		createIcon,
		isActive
	});
};
const _NavLinkGlobal = (props) => {
	return /* @__PURE__ */ jsx("div", {
		className: "inline-flex",
		children: /* @__PURE__ */ jsx(Tooltip, {
			label: props.localizedApp,
			children: /* @__PURE__ */ jsx(UI.ButtonTertiary, {
				iconOnly: props.createIcon,
				className: classnames("main-globalNav-navLink", "main-globalNav-link-icon link-subtle", { "main-globalNav-navLinkActive": props.isActive }),
				"aria-label": props.localizedApp,
				onClick: () => Platform.getHistory().push(props.appRoutePath)
			})
		})
	});
};
//#endregion
export { NavLink, registry as default, useHistoryRefresh };

//# sourceMappingURL=navlink.js.map