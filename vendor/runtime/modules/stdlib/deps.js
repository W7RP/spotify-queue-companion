import { BehaviorSubject, Subject, Subscription } from "./modules/stdlib/vendor/rxjs.js";
//#region modules/stdlib/deps.ts
const startCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^a-zA-Z0-9]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
//#endregion
export { BehaviorSubject, Subject, Subscription, startCase };

//# sourceMappingURL=deps.js.map