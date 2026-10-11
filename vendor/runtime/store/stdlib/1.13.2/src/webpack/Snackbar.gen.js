//#region modules/stdlib/src/webpack/Snackbar.gen.ts
let useSnackbar;
let enqueueCustomSnackbar;
import("./Snackbar.xpui.js").then((m) => {
	useSnackbar = m.useSnackbar;
	enqueueCustomSnackbar = m.enqueueCustomSnackbar;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./Snackbar.xpui.ts failed:", e));
//#endregion
export { enqueueCustomSnackbar, useSnackbar };

//# sourceMappingURL=Snackbar.gen.js.map