import "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { UI } from "../webpack/ComponentLibrary.gen.js";
import "../webpack/ComponentLibrary.js";
import { createIconComponent } from "../createIconComponent.js";
import { Tooltip } from "../webpack/ReactComponents.gen.js";
import "../webpack/ReactComponents.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/topbarLeftButton.tsx
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
	className: "spicetify-topbar-left-buttons",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
	},
	findSlot: () => {
		const history = document.querySelector(".main-globalNav-historyButtons");
		return history?.parentElement ? {
			parent: history.parentElement,
			before: history.nextSibling
		} : null;
	}
});
const TopbarLeftButton = (props) => /* @__PURE__ */ jsx(Tooltip, {
	label: props.label,
	children: /* @__PURE__ */ jsx(UI.ButtonTertiary, {
		size: "medium",
		iconOnly: () => props.icon && createIconComponent({
			icon: props.icon,
			iconSize: 16,
			realIconSize: 24
		}),
		condensed: true,
		"aria-label": props.label,
		disabled: props.disabled,
		onClick: props.onClick,
		className: MAP.main.topbar.left.button_t.wrapper
	})
});
//#endregion
export { TopbarLeftButton, registry as default };

//# sourceMappingURL=topbarLeftButton.js.map