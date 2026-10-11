import { React, ReactDOM } from "../src/expose/React.js";
import { calculateFloatingPosition } from "./floating-position.js";
import { jsx, jsxs } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/lib/floating.tsx
const TOOLTIP_HIDE_DELAY_MS = 300;
const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";
function useFloatingPlacement(open, anchorRef, surfaceRef, align, gap) {
	React.useLayoutEffect(() => {
		if (!open) return;
		const anchor = anchorRef.current;
		const surface = surfaceRef.current;
		if (!anchor || !surface) return;
		const place = () => {
			if (!anchor.isConnected || !surface.isConnected) return;
			const position = calculateFloatingPosition(anchor.getBoundingClientRect(), surface.getBoundingClientRect(), {
				width: window.innerWidth,
				height: window.innerHeight
			}, {
				align,
				gap
			});
			surface.style.left = `${position.left}px`;
			surface.style.top = `${position.top}px`;
			surface.style.visibility = "visible";
			surface.dataset.placement = position.placement;
		};
		place();
		window.addEventListener("resize", place);
		document.addEventListener("scroll", place, true);
		const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(place);
		observer?.observe(anchor);
		observer?.observe(surface);
		return () => {
			window.removeEventListener("resize", place);
			document.removeEventListener("scroll", place, true);
			observer?.disconnect();
		};
	}, [
		align,
		anchorRef,
		gap,
		open,
		surfaceRef
	]);
}
function focusTrigger(anchor) {
	anchor?.querySelector(FOCUSABLE_SELECTOR)?.focus();
}
function moveMenuFocus(event) {
	if (![
		"ArrowDown",
		"ArrowUp",
		"Home",
		"End"
	].includes(event.key)) return;
	const items = [...event.currentTarget.querySelectorAll("[role^=\"menuitem\"]:not([disabled])")];
	if (!items.length) return;
	event.preventDefault();
	const currentIndex = items.indexOf(document.activeElement);
	items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}
function usePopoverDismissal(open, close, anchorRef, surfaceRef) {
	React.useEffect(() => {
		if (!open) return;
		const onDocumentMouseDown = (event) => {
			const target = event.target;
			if (!anchorRef.current?.contains(target) && !surfaceRef.current?.contains(target)) close();
		};
		const onDocumentKeyDown = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			close();
			requestAnimationFrame(() => focusTrigger(anchorRef.current));
		};
		const onDocumentFocus = (event) => {
			const target = event.target;
			if (!anchorRef.current?.contains(target) && !surfaceRef.current?.contains(target)) close();
		};
		document.addEventListener("mousedown", onDocumentMouseDown, true);
		document.addEventListener("keydown", onDocumentKeyDown, true);
		document.addEventListener("focusin", onDocumentFocus, true);
		return () => {
			document.removeEventListener("mousedown", onDocumentMouseDown, true);
			document.removeEventListener("keydown", onDocumentKeyDown, true);
			document.removeEventListener("focusin", onDocumentFocus, true);
		};
	}, [
		anchorRef,
		close,
		open,
		surfaceRef
	]);
}
const Tooltip = (props) => {
	const id = React.useId();
	const anchorRef = React.useRef(null);
	const tooltipRef = React.useRef(null);
	const hideTimer = React.useRef();
	const [visible, setVisible] = React.useState(false);
	const cancelHide = React.useCallback(() => window.clearTimeout(hideTimer.current), []);
	const show = React.useCallback(() => {
		cancelHide();
		setVisible(true);
	}, [cancelHide]);
	const dismiss = React.useCallback(() => {
		cancelHide();
		setVisible(false);
	}, [cancelHide]);
	const scheduleHide = React.useCallback(() => {
		cancelHide();
		hideTimer.current = window.setTimeout(() => setVisible(false), TOOLTIP_HIDE_DELAY_MS);
	}, [cancelHide]);
	useFloatingPlacement(visible, anchorRef, tooltipRef, "center", 8);
	React.useEffect(() => () => cancelHide(), [cancelHide]);
	React.useEffect(() => {
		if (!visible) return;
		const onKeyDown = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			cancelHide();
			setVisible(false);
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [cancelHide, visible]);
	const describedBy = [props.children.props["aria-describedby"], id].filter(Boolean).join(" ");
	const child = React.cloneElement(props.children, { "aria-describedby": describedBy });
	const disabled = props.children.props.disabled === true;
	return /* @__PURE__ */ jsxs("span", {
		ref: anchorRef,
		className: "spicetify-floating-anchor",
		tabIndex: disabled ? 0 : void 0,
		"aria-describedby": disabled ? id : void 0,
		onClickCapture: dismiss,
		onPointerEnter: show,
		onPointerLeave: scheduleHide,
		onFocusCapture: show,
		onBlurCapture: scheduleHide,
		children: [child, visible ? ReactDOM.createPortal(/* @__PURE__ */ jsx("div", {
			ref: tooltipRef,
			id,
			role: "tooltip",
			className: "spicetify-tooltip",
			style: { visibility: "hidden" },
			onPointerEnter: cancelHide,
			onPointerLeave: scheduleHide,
			children: props.label
		}), document.body) : null]
	});
};
const Popover = (props) => {
	const id = React.useId();
	const anchorRef = React.useRef(null);
	const surfaceRef = React.useRef(null);
	const openRef = React.useRef(false);
	const [open, setOpen] = React.useState(false);
	const close = React.useCallback(() => {
		if (!openRef.current) return;
		openRef.current = false;
		setOpen(false);
		props.onClose?.();
	}, [props.onClose]);
	const toggle = () => {
		if (openRef.current) {
			close();
			return;
		}
		openRef.current = true;
		setOpen(true);
	};
	const role = props.role ?? "dialog";
	useFloatingPlacement(open, anchorRef, surfaceRef, props.align ?? "start", 8);
	usePopoverDismissal(open, close, anchorRef, surfaceRef);
	React.useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() => {
			const surface = surfaceRef.current;
			(surface?.querySelector(FOCUSABLE_SELECTOR) ?? surface)?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [open]);
	React.useEffect(() => () => {
		openRef.current = false;
	}, []);
	const originalClick = props.children.props.onClick;
	const trigger = React.cloneElement(props.children, {
		"aria-haspopup": role,
		"aria-expanded": open,
		"aria-controls": open ? id : void 0,
		onClick: (event) => {
			originalClick?.(event);
			if (!event.defaultPrevented) toggle();
		}
	});
	const describedTrigger = props.tooltip ? /* @__PURE__ */ jsx(Tooltip, {
		label: props.tooltip,
		children: trigger
	}) : trigger;
	const surfaceClass = props.className ? `spicetify-popover spicetify-popover--owned ${props.className}` : "spicetify-popover spicetify-popover--owned";
	return /* @__PURE__ */ jsxs("span", {
		ref: anchorRef,
		className: "spicetify-floating-anchor",
		children: [describedTrigger, open ? ReactDOM.createPortal(/* @__PURE__ */ jsx("div", {
			ref: surfaceRef,
			id,
			role,
			"aria-label": props.ariaLabel,
			className: surfaceClass,
			tabIndex: -1,
			style: { visibility: "hidden" },
			onKeyDown: role === "menu" ? moveMenuFocus : void 0,
			children: typeof props.content === "function" ? props.content(close) : props.content
		}), document.body) : null]
	});
};
const PopoverMenu = (props) => /* @__PURE__ */ jsx("div", {
	className: "spicetify-popover-menu",
	children: props.children
});
const PopoverMenuItem = (props) => /* @__PURE__ */ jsx("button", {
	type: "button",
	role: props.selected === void 0 ? "menuitem" : "menuitemradio",
	"aria-checked": props.selected,
	className: "spicetify-popover-menu-item",
	disabled: props.disabled,
	onClick: props.onSelect,
	children: /* @__PURE__ */ jsx("span", { children: props.children })
});
//#endregion
export { Popover, PopoverMenu, PopoverMenuItem, Tooltip };

//# sourceMappingURL=floating.js.map