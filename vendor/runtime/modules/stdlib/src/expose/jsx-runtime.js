import { React } from "./React.js";
//#region modules/stdlib/src/expose/jsx-runtime.ts
const Fragment = Symbol.for("spicetify.jsx.Fragment");
function create(type, props, key) {
	if (type === Fragment) type = React.Fragment;
	const config = key !== void 0 ? {
		...props,
		key
	} : props ?? {};
	const ce = React.createElement;
	return ce(type, config);
}
const jsx = create;
const jsxs = create;
const jsxDEV = create;
//#endregion
export { Fragment, jsx, jsxDEV, jsxs };

//# sourceMappingURL=jsx-runtime.js.map