import { exports } from "../webpack/index.js";
//#region modules/stdlib/src/expose/React.ts
const recoverySubscribers = /* @__PURE__ */ new Set();
let anyFallbackLanded = false;
function onFallbackRecovery(cb) {
	recoverySubscribers.add(cb);
	if (anyFallbackLanded) cb();
}
const notifyRecovery = () => {
	anyFallbackLanded = true;
	for (const cb of recoverySubscribers) try {
		cb();
	} catch {}
};
const lazyFallback = (url, pick) => {
	let mod;
	let requested = false;
	return () => {
		if (!mod && !requested) {
			requested = true;
			import(url).then((m) => {
				mod = pick(m);
				notifyRecovery();
			}).catch(() => {});
		}
		return mod;
	};
};
const lazyInstance = (find, fallback) => {
	let cached;
	return new Proxy({}, { get: (_target, key) => {
		cached ??= find();
		return (cached ?? fallback())?.[key];
	} });
};
const React = lazyInstance(() => exports?.find((m) => m && typeof m.createElement === "function" && typeof m.useReducer === "function" && typeof m.useEffect === "function"), lazyFallback("https://esm.sh/react@18.3.1", (m) => m.default ?? m));
const ReactDOM = lazyInstance(() => exports?.find((m) => m && typeof m.createRoot === "function" && typeof m.createPortal === "function"), lazyFallback("https://esm.sh/react-dom@18.3.1", (m) => m.default ?? m));
const ReactDOMServer = lazyInstance(() => exports?.find((m) => m && typeof m.renderToString === "function"), lazyFallback("https://esm.sh/react-dom@18.3.1/server", (m) => m.default ?? m));
//#endregion
export { React, ReactDOM, ReactDOMServer, onFallbackRecovery };

//# sourceMappingURL=React.js.map