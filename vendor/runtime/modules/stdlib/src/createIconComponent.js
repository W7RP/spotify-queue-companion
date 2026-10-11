import "./expose/React.js";
import { UI } from "./webpack/ComponentLibrary.gen.js";
import "./webpack/ComponentLibrary.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/createIconComponent.tsx
const createIconComponent = ({ icon, iconSize = 16, realIconSize = iconSize, ...props }) => {
	return /* @__PURE__ */ jsx(UI.Icon, {
		autoMirror: false,
		iconSize: realIconSize,
		viewBox: `0 0 ${iconSize} ${iconSize}`,
		dangerouslySetInnerHTML: { __html: icon },
		...props
	});
};
//#endregion
export { createIconComponent };

//# sourceMappingURL=createIconComponent.js.map