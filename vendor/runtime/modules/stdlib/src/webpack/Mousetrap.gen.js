//#region modules/stdlib/src/webpack/Mousetrap.gen.ts
let Mousetrap;
import("./Mousetrap.xpui.js").then((m) => {
	Mousetrap = m.Mousetrap;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./Mousetrap.xpui.ts failed:", e));
//#endregion
export { Mousetrap };

//# sourceMappingURL=Mousetrap.gen.js.map