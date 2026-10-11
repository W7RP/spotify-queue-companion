//#region modules/stdlib/src/webpack/misc.gen.ts
let Color;
let Locale;
let createUrlLocale;
let InternalPropetyMap;
import("./misc.xpui.js").then((m) => {
	Color = m.Color;
	Locale = m.Locale;
	createUrlLocale = m.createUrlLocale;
	InternalPropetyMap = m.InternalPropetyMap;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./misc.xpui.ts failed:", e));
//#endregion
export { Color, InternalPropetyMap, Locale, createUrlLocale };

//# sourceMappingURL=misc.gen.js.map