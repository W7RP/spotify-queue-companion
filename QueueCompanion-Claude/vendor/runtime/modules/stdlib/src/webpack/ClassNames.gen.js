//#region modules/stdlib/src/webpack/ClassNames.gen.ts
let classnames;
import("./ClassNames.xpui.js").then((m) => {
	classnames = m.classnames;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ClassNames.xpui.ts failed:", e));
//#endregion
export { classnames };

//# sourceMappingURL=ClassNames.gen.js.map