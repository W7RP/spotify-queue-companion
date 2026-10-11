//#region modules/stdlib/src/registers/order.ts
const byOrder = (items) => items.map((item, i) => [item, i]).sort(([a, ai], [b, bi]) => (a?.props?.order ?? 0) - (b?.props?.order ?? 0) || ai - bi).map(([item]) => item);
//#endregion
export { byOrder };

//# sourceMappingURL=order.js.map