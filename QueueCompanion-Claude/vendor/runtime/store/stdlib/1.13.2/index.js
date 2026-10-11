//#region modules/stdlib/index.ts
async function mixin(transformer, ctx) {
	return (await import("./mixin.js")).default(transformer, ctx);
}
async function preload() {
	const { waitForWebpackCapture } = await import("./src/webpack/index.js");
	await waitForWebpackCapture();
}
async function load(ctx) {
	return (await import("./load.js")).default(ctx);
}
//#endregion
export { load, mixin, preload };

//# sourceMappingURL=index.js.map