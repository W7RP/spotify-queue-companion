import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/ReduxStore.ts
let ReduxStore;
let Platform;
transformer((emit) => (str) => {
	str = str.replace(/\.jsx\)\(([a-zA-Z_\$][\w\$]*),\{store:([a-zA-Z_\$][\w\$]*),platform:([a-zA-Z_\$][\w\$]*)\}\)/, ".jsx)($1,{store:__ReduxStore=$2,platform:__Platform=$3})");
	Object.defineProperty(globalThis, "__ReduxStore", {
		set: (value) => {
			emit();
			ReduxStore = value;
		},
		get: () => ReduxStore
	});
	return str;
}, { glob: /^\/xpui\.js/ });
//#endregion
export { Platform, ReduxStore };

//# sourceMappingURL=ReduxStore.js.map