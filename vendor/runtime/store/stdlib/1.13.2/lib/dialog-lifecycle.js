//#region modules/stdlib/lib/dialog-lifecycle.ts
const FOCUSABLE_SELECTOR = [
	"button:not([disabled])",
	"[href]",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");
const focusableElements = (dialog) => [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
function activateDialog(dialog, close) {
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const onKeyDown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (event.key !== "Tab") return;
		const focusable = focusableElements(dialog);
		if (focusable.length === 0) {
			event.preventDefault();
			dialog.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};
	document.addEventListener("keydown", onKeyDown, true);
	(focusableElements(dialog)[0] ?? dialog).focus();
	return () => {
		document.removeEventListener("keydown", onKeyDown, true);
		if (previousFocus?.isConnected) previousFocus.focus();
	};
}
//#endregion
export { activateDialog };

//# sourceMappingURL=dialog-lifecycle.js.map