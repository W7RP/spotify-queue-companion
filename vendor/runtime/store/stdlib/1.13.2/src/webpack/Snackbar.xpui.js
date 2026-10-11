import { findBy } from "../util.js";
import { exportedFunctions } from "./index.js";
//#region modules/stdlib/src/webpack/Snackbar.xpui.ts
await CHUNKS.xpui.promise;
const useSnackbar = findBy(/^function\(\)\{return\(0,[a-zA-Z_\$][\w\$]*\.useContext\)\([a-zA-Z_\$][\w\$]*\)\}$/)(exportedFunctions);
const enqueueCustomSnackbar = findBy("enqueueCustomSnackbar", "headless")(exportedFunctions);
//#endregion
export { enqueueCustomSnackbar, useSnackbar };

//# sourceMappingURL=Snackbar.xpui.js.map