import "../expose/React.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
import { UI } from "../webpack/ComponentLibrary.gen.js";
import "../webpack/ComponentLibrary.js";
import { createIconComponent } from "../createIconComponent.js";
import { Tooltip } from "../webpack/ReactComponents.gen.js";
import "../webpack/ReactComponents.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/playbarWidget.tsx
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
	className: "spicetify-playbar-widgets",
	registry,
	setRefresh: (cb) => {
		refresh = cb;
	},
	findSlot: () => {
		const left = document.querySelector(".main-nowPlayingBar-left");
		return left ? { parent: left } : null;
	}
});
const PlaybarWidget = ({ label, icon, onClick }) => /* @__PURE__ */ jsx(Tooltip, {
	label,
	children: /* @__PURE__ */ jsx(UI.ButtonTertiary, {
		size: "small",
		className: void 0,
		"aria-label": label,
		condensed: false,
		iconOnly: icon && (() => createIconComponent({ icon })),
		onClick
	})
});
//#endregion
export { PlaybarWidget, registry as default };

//# sourceMappingURL=playbarWidget.js.map