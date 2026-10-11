import { exports } from "./index.js";
//#region modules/stdlib/src/webpack/React.xpui.ts
await CHUNKS.xpui.promise;
const ReactJSX = exports.find((m) => m.jsx);
const ReactDOM = exports.find((m) => m.createRoot);
const ReactDOMServer = exports.find((m) => m.renderToString);
//#endregion
export { ReactDOM, ReactDOMServer, ReactJSX };

//# sourceMappingURL=React.xpui.js.map