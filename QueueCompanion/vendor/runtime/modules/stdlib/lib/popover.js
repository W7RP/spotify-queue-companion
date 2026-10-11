import { React, ReactDOM } from "../src/expose/React.js";
import { calculateFloatingPosition } from "./floating-position.js";
//#region modules/stdlib/lib/popover.ts
function openPopover({ anchor, content, onClose, gap = 8 }) {
	const host = document.createElement("div");
	host.className = "spicetify-popover";
	host.style.visibility = "hidden";
	const place = () => {
		if (!anchor.isConnected || !host.isConnected) return;
		const position = calculateFloatingPosition(anchor.getBoundingClientRect(), host.getBoundingClientRect(), {
			width: window.innerWidth,
			height: window.innerHeight
		}, {
			align: "start",
			gap
		});
		host.style.left = `${position.left}px`;
		host.style.top = `${position.top}px`;
		host.style.visibility = "visible";
		host.dataset.placement = position.placement;
	};
	let root;
	if (content instanceof HTMLElement) host.appendChild(content);
	else {
		root = ReactDOM.createRoot(host);
		root.render(React.createElement(React.Fragment, null, content));
	}
	const resizeObserver = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(place);
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		window.removeEventListener("resize", place);
		document.removeEventListener("scroll", place, true);
		document.removeEventListener("mousedown", onDocDown, true);
		document.removeEventListener("keydown", onKey, true);
		resizeObserver?.disconnect();
		root?.unmount();
		host.remove();
		onClose?.();
	};
	const onDocDown = (e) => {
		const target = e.target;
		if (!host.contains(target) && !anchor.contains(target)) close();
	};
	const onKey = (e) => {
		if (e.key !== "Escape") return;
		e.preventDefault();
		e.stopPropagation();
		close();
	};
	document.body.appendChild(host);
	place();
	requestAnimationFrame(place);
	window.addEventListener("resize", place);
	document.addEventListener("scroll", place, true);
	document.addEventListener("mousedown", onDocDown, true);
	document.addEventListener("keydown", onKey, true);
	resizeObserver?.observe(anchor);
	resizeObserver?.observe(host);
	return {
		close,
		host
	};
}
//#endregion
export { openPopover };

//# sourceMappingURL=popover.js.map