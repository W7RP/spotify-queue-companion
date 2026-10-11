import { webpackRequire } from "../wpunpk.mix.js";
import { analyzeWebpackRequire, src } from "./index.js";
//#region modules/stdlib/src/webpack/ReactHooks.fullscreen.ts
await (CHUNKS["/dwp-full-screen-mode-container.js"] ??= Promise.withResolvers()).promise;
const { exportedFunctions } = analyzeWebpackRequire(webpackRequire);
const useExtractedColor = exportedFunctions.find((m) => src(m).includes("extracted-color") || src(m).includes("colorRaw") && src(m).includes("useEffect"));
//#endregion
export { useExtractedColor };

//# sourceMappingURL=ReactHooks.fullscreen.js.map