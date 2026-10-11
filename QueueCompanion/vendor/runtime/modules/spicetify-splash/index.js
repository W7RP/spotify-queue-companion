import { showSplash } from "./splash.js";
//#region modules/spicetify-splash/index.ts
let splash;
function mixin() {
	splash?.dispose();
	splash = showSplash();
}
async function load(ctx) {
	if (splash) {
		const current = splash;
		ctx.defer(current.dispose);
		const { client } = await import("/modules/stdlib/mod.js");
		current.watchReady(() => !!document.querySelector("main") && !!client.modules);
	}
	await (await import("./mod.js")).default(ctx);
}
//#endregion
export { load, mixin };

//# sourceMappingURL=index.js.map