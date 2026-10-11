//#region modules/stdlib/src/webpack/ReactRouter.gen.ts
let useMatch;
let useLocation;
import("./ReactRouter.xpui.js").then((m) => {
	useMatch = m.useMatch;
	useLocation = m.useLocation;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactRouter.xpui.ts failed:", e));
//#endregion
export { useLocation, useMatch };

//# sourceMappingURL=ReactRouter.gen.js.map