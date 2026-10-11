import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/ReactFlipToolkitSpring.ts
let ReactFlipToolkitSpring;
transformer((emit) => (str) => {
	str = str.replace(/([a-zA-Z_\$][\w\$]*)=((?:function|\()([\w$.,{}()= ]+(?:springConfig|overshootClamping)){2})/, "$1=__ReactFlipToolkitSpring=$2");
	Object.defineProperty(globalThis, "__ReactFlipToolkitSpring", { set: emit });
	return str;
}, { glob: /^\/vendor~xpui\.js/ }).then(($) => {
	ReactFlipToolkitSpring = $;
});
//#endregion
export { ReactFlipToolkitSpring };

//# sourceMappingURL=ReactFlipToolkitSpring.js.map