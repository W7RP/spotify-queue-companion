import { webpackRequire } from "../wpunpk.mix.js";
import { analyzeWebpackRequire, src } from "./index.js";
//#region modules/stdlib/src/webpack/ReactComponents.panel.ts
await (CHUNKS["/dwp-panel-section.js"] ??= Promise.withResolvers()).promise;
const { exportedFunctions, exportedForwardRefs } = analyzeWebpackRequire(webpackRequire);
const PanelContainer = exportedFunctions.find((f) => src(f).includes("\"Desktop_PanelContainer_Id\""));
const PanelContent = exportedForwardRefs.find((f) => src(f.render).includes("fixedHeader"));
const PanelHeader = exportedFunctions.find((m) => src(m).includes("PanelHeader_CloseButton"));
//#endregion
export { PanelContainer, PanelContent, PanelHeader };

//# sourceMappingURL=ReactComponents.panel.js.map