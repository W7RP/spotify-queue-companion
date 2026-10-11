import { warn } from "../logger.js";
import { toPascalCase } from "../util.js";
import { webpackRequire } from "../wpunpk.mix.js";
import { modules, src } from "./index.js";
//#region modules/stdlib/src/webpack/URI.xpui.ts
await CHUNKS.xpui.promise;
const URIModuleHit = modules.find(([id, v]) => src(v).includes("Invalid Spotify URI!") && Object.keys(webpackRequire(id) ?? {}).length > 10);
if (!URIModuleHit) warn("[stdlib] webpack needle miss: URI module (Invalid Spotify URI!)");
const URIModule = URIModuleHit ? webpackRequire(URIModuleHit[0]) : {};
const [_Types, ...vs] = Object.values(URIModule);
const Types = _Types ?? {};
const TypesKeys = Object.keys(Types);
const isTestFn = (fn) => TypesKeys.some((t) => src(fn).includes(`${t}}`));
const isCreateFn = (fn) => TypesKeys.some((t) => src(fn).includes(`${t},`));
const fnsByType = Object.groupBy(vs, (fn) => isTestFn(fn) ? "test" : isCreateFn(fn) ? "create" : void 0);
const is = Object.fromEntries((fnsByType.test ?? []).flatMap((fn) => {
	const name = src(fn).match(/([\w_\d]{2,})\}/)?.[1];
	return name ? [[toPascalCase(name), fn]] : [];
}));
const create = Object.fromEntries((fnsByType.create ?? []).flatMap((fn) => {
	const name = src(fn).match(/([\w_\d]{2,})\,/)?.[1];
	return name ? [[toPascalCase(name), fn]] : [];
}));
const uniqueFns = fnsByType[void 0] ?? [];
const findAndExcludeBy = (...strings) => {
	const i = uniqueFns.findIndex((f) => strings.every((str) => src(f).includes(str)));
	if (i < 0) {
		warn("[stdlib] webpack needle miss: URI helper", strings.join(" + "));
		return;
	}
	return uniqueFns.splice(i, 1)[0];
};
const isSameIdentity = findAndExcludeBy("PLAYLIST");
const urlEncode = findAndExcludeBy(".URI");
const idToHex = findAndExcludeBy("22===");
const hexToId = findAndExcludeBy("32===");
const from = findAndExcludeBy("allowedTypes");
const fromString = findAndExcludeBy("Argument `uri` must be a string.");
is.PlaylistV1OrV2 = typeof is.Playlist === "function" && typeof is.PlaylistV2 === "function" ? findAndExcludeBy(`${is.Playlist.name}(e)||${is.PlaylistV2.name}(e)`) : void 0;
//#endregion
export { Types, create, from, fromString, hexToId, idToHex, is, isSameIdentity, urlEncode };

//# sourceMappingURL=URI.xpui.js.map