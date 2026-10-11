//#region modules/stdlib/src/webpack/URI.gen.ts
let Types;
let is;
let create;
let isSameIdentity;
let urlEncode;
let idToHex;
let hexToId;
let from;
let fromString;
import("./URI.xpui.js").then((m) => {
	Types = m.Types;
	is = m.is;
	create = m.create;
	isSameIdentity = m.isSameIdentity;
	urlEncode = m.urlEncode;
	idToHex = m.idToHex;
	hexToId = m.hexToId;
	from = m.from;
	fromString = m.fromString;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./URI.xpui.ts failed:", e));
//#endregion
export { Types, create, from, fromString, hexToId, idToHex, is, isSameIdentity, urlEncode };

//# sourceMappingURL=URI.gen.js.map