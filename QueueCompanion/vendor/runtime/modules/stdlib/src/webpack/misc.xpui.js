import { findBy } from "../util.js";
import { exported, exportedFunctions } from "./index.js";
//#region modules/stdlib/src/webpack/misc.xpui.ts
await CHUNKS.xpui.promise;
const Color = Object.assign(findBy("this.rgb")(exportedFunctions), { Format: exported.find((m) => typeof m?.RGBA === "number" && typeof m?.HEX === "number") });
const Locale = exported.find((m) => typeof m.getTranslations === "function");
const createUrlLocale = findBy("has", "baseName", "language")(exportedFunctions);
const InternalPropetyMap = exported.find((o) => typeof o.Builder === "function");
//#endregion
export { Color, InternalPropetyMap, Locale, createUrlLocale };

//# sourceMappingURL=misc.xpui.js.map