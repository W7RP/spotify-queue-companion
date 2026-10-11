//#region modules/stdlib/src/webpack/ReactFlipToolkit.gen.ts
let Flipper;
let Flipped;
import("./ReactFlipToolkit.xpui.js").then((m) => {
	Flipper = m.Flipper;
	Flipped = m.Flipped;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactFlipToolkit.xpui.ts failed:", e));
//#endregion
export { Flipped, Flipper };

//# sourceMappingURL=ReactFlipToolkit.gen.js.map