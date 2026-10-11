import { webpackRequire } from "../wpunpk.mix.js";
import { modules } from "./index.js";
//#region modules/stdlib/src/webpack/ClassNames.xpui.ts
await globalThis.CHUNKS.xpui.promise;
const classnames = modules.filter(([_, v]) => v.toString().includes("[native code]")).map(([i]) => webpackRequire(i)).find((e) => typeof e === "function");
//#endregion
export { classnames };

//# sourceMappingURL=ClassNames.xpui.js.map