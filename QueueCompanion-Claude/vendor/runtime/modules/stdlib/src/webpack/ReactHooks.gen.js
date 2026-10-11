//#region modules/stdlib/src/webpack/ReactHooks.gen.ts
let useExtractedColor;
import("./ReactHooks.fullscreen.js").then((m) => {
	useExtractedColor = m.useExtractedColor;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactHooks.fullscreen.ts failed:", e));
let DragHandler;
let usePanelAPI;
let useContextMenuState;
let imageAnalysis;
let fallbackPreset;
let getPlayContext;
let useTrackListColumns;
let usePanelStateMachine;
let extractColorPreset;
import("./ReactHooks.xpui.js").then((m) => {
	DragHandler = m.DragHandler;
	usePanelAPI = m.usePanelAPI;
	useContextMenuState = m.useContextMenuState;
	imageAnalysis = m.imageAnalysis;
	fallbackPreset = m.fallbackPreset;
	getPlayContext = m.getPlayContext;
	useTrackListColumns = m.useTrackListColumns;
	usePanelStateMachine = m.usePanelStateMachine;
	extractColorPreset = m.extractColorPreset;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactHooks.xpui.ts failed:", e));
//#endregion
export { DragHandler, extractColorPreset, fallbackPreset, getPlayContext, imageAnalysis, useContextMenuState, useExtractedColor, usePanelAPI, usePanelStateMachine, useTrackListColumns };

//# sourceMappingURL=ReactHooks.gen.js.map