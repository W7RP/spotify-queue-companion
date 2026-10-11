import { webpackRequire } from "../wpunpk.mix.js";
import { analyzeWebpackRequire } from "./index.js";
//#region modules/stdlib/src/webpack/ReactComponents.desktop.ts
await (CHUNKS["/xpui-desktop-routes-settings.js"] ??= Promise.withResolvers()).promise;
const { exports } = analyzeWebpackRequire(webpackRequire);
const Settings = exports.find((m) => m.SettingsRow);
//#endregion
export { Settings };

//# sourceMappingURL=ReactComponents.desktop.js.map