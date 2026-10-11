import { postWebpackRequireHooks } from "./wpunpk.mix.js";
import { BehaviorSubject, Subject } from "../modules/stdlib/vendor/rxjs.js";
import "../deps.js";
//#region modules/stdlib/src/events.mix.ts
function createGlobalThisShadow() {
	const globalThisShadow = {};
	Object.setPrototypeOf(globalThisShadow, globalThis);
	Object.defineProperty(globalThisShadow, "self", { value: globalThisShadow });
	Object.defineProperty(globalThisShadow, "globalThis", { value: globalThisShadow });
	Object.defineProperty(globalThisShadow, "window", { value: globalThisShadow });
	return globalThisShadow;
}
const CosmosRequestSubject = new Subject();
const UpdateTitlebarSubject = new BehaviorSubject(-1);
postWebpackRequireHooks.push(($) => {
	const globalThisShadow = $.g = createGlobalThisShadow();
	const $sendCosmosRequest = globalThis.sendCosmosRequest;
	Object.defineProperty(globalThisShadow, "sendCosmosRequest", { value: function($) {
		const request = JSON.parse($.request);
		CosmosRequestSubject.next(request);
		return $sendCosmosRequest($);
	} });
});
const controlMessageListener = (request) => {
	const { uri, method } = request;
	if (uri === "sp://messages/v1/container/control" && method === "POST") {
		const { type, height } = JSON.parse(request.body);
		if (type === "update_titlebar") UpdateTitlebarSubject.next(height);
	}
};
CosmosRequestSubject.subscribe(controlMessageListener);
//#endregion
export { UpdateTitlebarSubject };

//# sourceMappingURL=events.mix.js.map