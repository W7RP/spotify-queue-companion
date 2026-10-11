//#region modules/stdlib/lib/floating-position.ts
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
function calculateFloatingPosition(anchor, surface, viewport, options) {
	const margin = options.margin ?? 8;
	const spaceBelow = viewport.height - anchor.bottom - margin;
	const spaceAbove = anchor.top - margin;
	const placement = spaceBelow >= surface.height + options.gap || spaceBelow >= spaceAbove ? "below" : "above";
	const desiredTop = placement === "below" ? anchor.bottom + options.gap : anchor.top - options.gap - surface.height;
	const anchorCenter = anchor.left + (anchor.right - anchor.left) / 2;
	const desiredLeft = options.align === "center" ? anchorCenter - surface.width / 2 : anchor.left;
	return {
		left: Math.round(clamp(desiredLeft, margin, viewport.width - surface.width - margin)),
		top: Math.round(clamp(desiredTop, margin, viewport.height - surface.height - margin)),
		placement
	};
}
//#endregion
export { calculateFloatingPosition };

//# sourceMappingURL=floating-position.js.map