import { warn } from "../logger.js";
import { onWebpackCaptured } from "../webpack/index.js";
import { ReactDOM, onFallbackRecovery } from "./React.js";
//#region modules/stdlib/src/expose/react-dom-shim.ts
const RD = ReactDOM;
var react_dom_shim_default = ReactDOM;
let createPortal;
let createRoot;
let findDOMNode;
let flushSync;
let hydrate;
let hydrateRoot;
let render;
let unmountComponentAtNode;
let version;
function populate() {
	createPortal = RD.createPortal;
	createRoot = RD.createRoot;
	findDOMNode = RD.findDOMNode;
	flushSync = RD.flushSync;
	hydrate = RD.hydrate;
	hydrateRoot = RD.hydrateRoot;
	render = RD.render;
	unmountComponentAtNode = RD.unmountComponentAtNode;
	version = RD.version;
}
onWebpackCaptured(() => {
	populate();
	if (typeof createRoot !== "function") {
		warn("[stdlib] capture health: the client ReactDOM was not found in the webpack capture — named `react-dom` imports are degraded until the fallback loads");
		onFallbackRecovery(populate);
	}
});
//#endregion
export { createPortal, createRoot, react_dom_shim_default as default, findDOMNode, flushSync, hydrate, hydrateRoot, render, unmountComponentAtNode, version };

//# sourceMappingURL=react-dom-shim.js.map