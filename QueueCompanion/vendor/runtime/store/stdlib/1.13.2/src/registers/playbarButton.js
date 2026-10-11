import "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { UI } from "../webpack/ComponentLibrary.gen.js";
import "../webpack/ComponentLibrary.js";
import { createIconComponent } from "../createIconComponent.js";
import { classnames } from "../webpack/ClassNames.gen.js";
import "../webpack/ClassNames.js";
import { Tooltip } from "../webpack/ReactComponents.gen.js";
import "../webpack/ReactComponents.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/playbarButton.tsx
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
	className: "spicetify-playbar-buttons",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
	},
	findSlot: () => {
		const controls = document.querySelector(".main-nowPlayingBar-extraControls");
		return controls ? {
			parent: controls,
			before: controls.firstChild
		} : null;
	}
});
const PlaybarButton = ({ label, isActive = false, isActiveNoIndicator = false, disabled = false, icon, onClick }) => /* @__PURE__ */ jsx(Tooltip, {
	label,
	children: /* @__PURE__ */ jsx(UI.ButtonTertiary, {
		"aria-label": label,
		size: "small",
		className: classnames(MAP.main.playbar.buttons.button.wrapper, {
			[MAP.main.playbar.buttons.button.wrapper__indicator]: isActive,
			[MAP.main.playbar.buttons.button.wrapper__active]: isActive || isActiveNoIndicator
		}),
		disabled,
		iconOnly: icon && (() => createIconComponent({ icon })),
		onClick,
		"data-active": isActive.toString(),
		"aria-pressed": isActive
	})
});
//#endregion
export { PlaybarButton, registry as default };

//# sourceMappingURL=playbarButton.js.map