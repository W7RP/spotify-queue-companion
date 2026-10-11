//#region modules/stdlib/mixin.ts
const nativeObjectDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
	if (prop !== "prototype" && descriptor) descriptor.configurable ??= true;
	return nativeObjectDefineProperty(obj, prop, descriptor);
};
let transformer;
async function mixin_default(t, _ctx) {
	transformer = t;
	await Promise.all([
		import("./src/expose/index.js"),
		import("./src/registers/index.js"),
		import("./src/events.mix.js"),
		import("./src/wpunpk.mix.js")
	]);
}
//#endregion
export { mixin_default as default, transformer };

//# sourceMappingURL=mixin.js.map