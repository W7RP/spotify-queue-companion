import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/enqueueImageSnackbar.ts
let enqueueImageSnackbar;
transformer((emit) => (str) => {
	str = str.replace(/(\(\({[^}]*,\s*imageSrc)/, "__enqueueImageSnackbar=$1");
	Object.defineProperty(globalThis, "__enqueueImageSnackbar", { set: emit });
	return str;
}, {
	glob: /^\/xpui\.js/,
	wait: false
}).then(($) => {
	enqueueImageSnackbar = $;
});
//#endregion
export { enqueueImageSnackbar };

//# sourceMappingURL=enqueueImageSnackbar.js.map