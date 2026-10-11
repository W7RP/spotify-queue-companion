import { findBy } from "../util.js";
import { exported, exportedFunctions } from "./index.js";
import { Platform } from "../expose/Platform.js";
//#region modules/stdlib/src/webpack/ReactHooks.xpui.ts
await CHUNKS.xpui.promise;
const DragHandler = findBy("dataTransfer", "data-dragging")(exportedFunctions);
const usePanelAPI = findBy("panelSend", "context")(exportedFunctions);
const useContextMenuState = findBy("useContextMenuState")(exportedFunctions);
const imageAnalysis = findBy(/\![a-zA-Z_\$][\w\$]*\.isFallback|\{extractColor/)(exportedFunctions);
const fallbackPreset = exported.find((m) => m.colorDark && Object.hasOwn(m, "colorDark"));
const getPlayContext = findBy("referrerIdentifier", "usePlayContextItem")(exportedFunctions);
const useTrackListColumns = findBy("useTrackListColumns")(exportedFunctions);
const usePanelStateMachine = findBy("usePanelStateMachine")(exportedFunctions);
const extractColorPreset = async (image) => {
	return await imageAnalysis(Platform.getGraphQLLoader(), image);
};
//#endregion
export { DragHandler, extractColorPreset, fallbackPreset, getPlayContext, imageAnalysis, useContextMenuState, usePanelAPI, usePanelStateMachine, useTrackListColumns };

//# sourceMappingURL=ReactHooks.xpui.js.map