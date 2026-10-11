import "../src/expose/React.js";
import root_default from "../src/registers/root.js";
import { Dialog } from "./primitives.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/lib/modal.tsx
const [RootChildrenRegistry] = root_default;
let mountedModal;
function display({ title, content, isLarge = false }) {
	hide();
	mountedModal = /* @__PURE__ */ jsx(Dialog, {
		title,
		size: isLarge ? "large" : "normal",
		onClose: hide,
		children: content
	});
	RootChildrenRegistry.add(mountedModal);
}
function hide() {
	if (!mountedModal) return;
	RootChildrenRegistry.delete(mountedModal);
	mountedModal = void 0;
}
//#endregion
export { display, hide };

//# sourceMappingURL=modal.js.map