import { exportedFunctions } from "./index.js";
//#region modules/stdlib/src/webpack/ReactFlipToolkit.xpui.ts
await CHUNKS.xpui.promise;
const Flipper = exportedFunctions.find((m) => m.prototype?.getSnapshotBeforeUpdate);
const Flipped = exportedFunctions.find((m) => m.displayName === "Flipped");
//#endregion
export { Flipped, Flipper };

//# sourceMappingURL=ReactFlipToolkit.xpui.js.map