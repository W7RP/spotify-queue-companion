import { exported, exportedForwardRefs, exportedFunctions, src } from "./index.js";
//#region modules/stdlib/src/webpack/ComponentLibrary.xpui.ts
await CHUNKS.xpui.promise;
const componentNames = Object.keys(exported.find((e) => e.BrowserDefaultFocusStyleProvider && Object.hasOwn(e, "BrowserDefaultFocusStyleProvider")));
const componentRegexes = componentNames.map((n) => new RegExp(String.raw`"data-encore-id":(?:[a-zA-Z_$][\w$]*\.){2}${n}\b`));
const componentPairs = [exportedFunctions.map((f) => [f, f]), exportedForwardRefs.map((f) => [f.render, f])].flat().map(([s, f]) => {
	const code = src(s);
	return [code.includes("\"data-encore-id\"") ? componentNames.find((_, i) => componentRegexes[i].test(code)) : void 0, f];
});
const UI = Object.fromEntries(componentPairs);
//#endregion
export { UI };

//# sourceMappingURL=ComponentLibrary.xpui.js.map