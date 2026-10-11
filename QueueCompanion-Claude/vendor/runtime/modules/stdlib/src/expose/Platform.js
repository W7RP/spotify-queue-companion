//#region modules/stdlib/src/expose/Platform.ts
let cached;
function resolvePlatform() {
	if (cached === void 0) cached = globalThis.Spicetify?._platform ?? null;
	return cached ?? void 0;
}
const Platform = new Proxy({}, {
	get: (_, key) => {
		const p = resolvePlatform();
		if (!p) return void 0;
		if (key in p) return p[key];
		if (typeof key === "string" && key.startsWith("get") && typeof p.getRegistry === "function") {
			const description = key.slice(3);
			for (const s of p.getRegistry()._map.keys()) if (s.description === description) return () => p.getRegistry().resolve(s);
		}
	},
	has: (_, key) => {
		const p = resolvePlatform();
		if (!p) return false;
		if (key in p) return true;
		if (typeof key === "string" && key.startsWith("get") && typeof p.getRegistry === "function") {
			const description = key.slice(3);
			for (const s of p.getRegistry()._map.keys()) if (s.description === description) return true;
		}
		return false;
	}
});
//#endregion
export { Platform };

//# sourceMappingURL=Platform.js.map