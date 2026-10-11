//#region modules/stdlib/src/webpack/ComponentLibrary.gen.ts
let UI;
import("./ComponentLibrary.xpui.js").then((m) => {
	UI = m.UI;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ComponentLibrary.xpui.ts failed:", e));
//#endregion
export { UI };

//# sourceMappingURL=ComponentLibrary.gen.js.map