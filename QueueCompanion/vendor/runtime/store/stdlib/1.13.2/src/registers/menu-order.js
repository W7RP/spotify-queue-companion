//#region modules/stdlib/src/registers/menu-order.ts
const placeMenuItemsHost = (menu, host) => {
	const settingsRow = Array.from(menu.children).find((child) => child.matches("a[href=\"/preferences\"]") || child.querySelector("a[href=\"/preferences\"]"));
	if (settingsRow) {
		if (settingsRow.nextElementSibling !== host) settingsRow.after(host);
		return;
	}
	if (host.parentElement !== menu) menu.append(host);
};
//#endregion
export { placeMenuItemsHost };

//# sourceMappingURL=menu-order.js.map