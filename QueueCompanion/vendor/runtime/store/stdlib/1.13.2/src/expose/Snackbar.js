import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/Snackbar.ts
let Snackbar;
transformer((emit) => (str) => {
	str = str.replace(/var ([a-zA-Z_\$][\w\$]*);return\(\1=([^;]*?)\)\.enqueueSnackbar=/, "var $1;return($1=__Snackbar=$2).enqueueSnackbar=");
	let __Snackbar = void 0;
	Object.defineProperty(globalThis, "__Snackbar", {
		set: (value) => {
			emit(value);
			__Snackbar = value;
		},
		get: () => __Snackbar
	});
	return str;
}, { glob: /^\/vendor~xpui\.js/ }).then(($) => {
	Snackbar = $;
});
//#endregion
export { Snackbar };

//# sourceMappingURL=Snackbar.js.map