//#region modules/stdlib/src/webpack/React.gen.ts
let ReactJSX;
let ReactDOM;
let ReactDOMServer;
import("./React.xpui.js").then((m) => {
	ReactJSX = m.ReactJSX;
	ReactDOM = m.ReactDOM;
	ReactDOMServer = m.ReactDOMServer;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./React.xpui.ts failed:", e));
//#endregion
export { ReactDOM, ReactDOMServer, ReactJSX };

//# sourceMappingURL=React.gen.js.map