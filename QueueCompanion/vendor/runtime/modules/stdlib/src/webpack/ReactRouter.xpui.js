import { findBy } from "../util.js";
import { webpackRequire } from "../wpunpk.mix.js";
import { exportedFunctions, modules, src } from "./index.js";
//#region modules/stdlib/src/webpack/ReactRouter.xpui.ts
await CHUNKS.xpui.promise;
const [ReactRouterModuleID] = modules.find(([_, v]) => v.toString().includes("React Router"));
const useMatch = Object.values(webpackRequire(ReactRouterModuleID)).find((f) => src(f).includes("let{pathname:") && !src(f).includes(".createElement("));
const useLocation = findBy("location", "useContext")(exportedFunctions);
//#endregion
export { useLocation, useMatch };

//# sourceMappingURL=ReactRouter.xpui.js.map