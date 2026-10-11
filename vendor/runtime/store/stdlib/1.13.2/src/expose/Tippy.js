import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/Tippy.ts
let Tippy;
transformer((emit) => (str) => {
	str = str.replace(/(([a-zA-Z_\$][\w\$]*)\.setDefaultProps=)/, "__Tippy=$2;$1");
	Object.defineProperty(globalThis, "__Tippy", { set: emit });
	return str;
}, { glob: /^\/vendor~xpui\.js/ }).then(($) => {
	Tippy = $;
});
//#endregion
export { Tippy };

//# sourceMappingURL=Tippy.js.map