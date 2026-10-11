import "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { UI } from "../webpack/ComponentLibrary.gen.js";
import "../webpack/ComponentLibrary.js";
import { createIconComponent } from "../createIconComponent.js";
import { Tooltip } from "../webpack/ReactComponents.gen.js";
import "../webpack/ReactComponents.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/topbarRightButton.tsx
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
	className: "spicetify-topbar-right-buttons",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
	},
	findSlot: () => {
		const actions = document.querySelector(".main-actionButtons");
		return actions ? {
			parent: actions,
			before: actions.firstChild
		} : null;
	}
});
const TopbarRightButton = (props) => /* @__PURE__ */ jsx(Tooltip, {
	label: props.label,
	children: /* @__PURE__ */ jsx(UI.ButtonTertiary, {
		"aria-label": props.label,
		onClick: props.onClick,
		size: "small",
		iconOnly: () => props.icon && createIconComponent({
			icon: props.icon,
			iconSize: 16
		}),
		className: MAP.main.topbar.right.button_t.wrapper
	})
});
//#endregion
export { TopbarRightButton, registry as default };

//# sourceMappingURL=topbarRightButton.js.map