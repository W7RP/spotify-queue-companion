import { getSplashImage, readSplashImage, resetSplashImage, saveSplashImage } from "./image.js";
import { getCustomCss, saveCustomCss } from "./theme.js";
import { showSplash } from "./splash.js";
import { React, createRegistrar } from "/modules/stdlib/mod.js";
import { Button, SettingsActions, SettingsLabel, SettingsRow, SettingsSection } from "/modules/stdlib/lib/primitives.js";
import { jsx, jsxs } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/spicetify-splash/mod.tsx
const CSS_PLACEHOLDER = `.spicetify-splash {
  --splash-accent: #cba6f7;
  --splash-logo-fill: var(--splash-accent);
  --splash-caption: "warming up";
}`;
let preview;
function SplashSettings() {
	const input = React.useRef(null);
	const [custom, setCustom] = React.useState(() => getSplashImage() !== null);
	const [savedCss, setSavedCss] = React.useState(getCustomCss);
	const [css, setCss] = React.useState(savedCss);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState("");
	const choose = async (file) => {
		setBusy(true);
		setError("");
		try {
			const source = await readSplashImage(file);
			const image = new Image();
			image.src = source;
			await image.decode();
			saveSplashImage(source);
			setCustom(true);
		} catch (error) {
			console.error("[spicetify-splash] Could not save the selected image.", error);
			setError(error instanceof Error && error.name === "Error" ? error.message : "The image could not be saved. Choose another file.");
		} finally {
			setBusy(false);
			if (input.current) input.current.value = "";
		}
	};
	const saveCss = () => {
		try {
			saveCustomCss(css);
			setSavedCss(css);
			setError("");
		} catch (error) {
			console.error("[spicetify-splash] Could not save the custom CSS.", error);
			setError(error instanceof Error && error.name === "Error" ? error.message : "The CSS could not be saved. Try again.");
		}
	};
	return /* @__PURE__ */ jsxs(SettingsSection, {
		title: "Spicetify Splash",
		children: [
			/* @__PURE__ */ jsx(SettingsRow, {
				label: /* @__PURE__ */ jsx(SettingsLabel, {
					label: "Preview",
					description: "Shows the splash with your image and CSS, including unsaved CSS. Click it or press Escape to close."
				}),
				children: /* @__PURE__ */ jsx(SettingsActions, { children: /* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					onClick: () => {
						preview?.dispose();
						preview = showSplash({
							preview: true,
							css
						});
					},
					children: "Preview splash"
				}) })
			}),
			/* @__PURE__ */ jsx(SettingsRow, {
				label: /* @__PURE__ */ jsx(SettingsLabel, {
					label: "Splash image",
					description: `${custom ? "Custom image saved." : "Using the Spicetify logo."} Changes appear next startup. Choose PNG, JPEG, WebP, GIF, or SVG up to 512 KB.`
				}),
				children: /* @__PURE__ */ jsxs(SettingsActions, { children: [
					/* @__PURE__ */ jsx(Button, {
						variant: "secondary",
						disabled: busy,
						onClick: () => input.current?.click(),
						children: busy ? "Saving…" : "Choose image…"
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "secondary",
						disabled: busy || !custom,
						onClick: () => {
							try {
								resetSplashImage();
								setCustom(false);
								setError("");
							} catch (error) {
								console.error("[spicetify-splash] Could not reset the splash image.", error);
								setError("The image could not be reset. Try again.");
							}
						},
						children: "Reset image"
					}),
					/* @__PURE__ */ jsx("input", {
						ref: input,
						type: "file",
						hidden: true,
						onChange: (event) => {
							const file = event.target.files?.[0];
							if (file) choose(file);
						}
					})
				] })
			}),
			/* @__PURE__ */ jsx(SettingsRow, {
				label: /* @__PURE__ */ jsx(SettingsLabel, {
					label: "Custom CSS",
					description: "Restyle the splash with --splash-* variables or .spicetify-splash selectors. Theme rules for the splash also apply from the first frame after one startup."
				}),
				children: /* @__PURE__ */ jsx(SettingsActions, { children: /* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					disabled: css === savedCss,
					onClick: saveCss,
					children: "Save CSS"
				}) })
			}),
			/* @__PURE__ */ jsx("textarea", {
				className: "spicetify-splash-settings__css",
				"aria-label": "Custom splash CSS",
				spellCheck: false,
				placeholder: CSS_PLACEHOLDER,
				value: css,
				rows: 8,
				onChange: (event) => setCss(event.target.value),
				style: {
					width: "100%",
					boxSizing: "border-box",
					padding: "12px",
					resize: "vertical",
					font: "13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
					color: "var(--spice-text, inherit)",
					background: "var(--spice-card, rgba(255, 255, 255, 0.07))",
					border: "1px solid var(--spice-misc, rgba(255, 255, 255, 0.1))",
					borderRadius: "6px"
				}
			}),
			error ? /* @__PURE__ */ jsx("p", {
				role: "alert",
				children: error
			}) : null
		]
	});
}
function spicetify_splash_default(ctx) {
	ctx.defer(() => {
		preview?.dispose();
		preview = void 0;
	});
	createRegistrar(ctx).register("settingsSection", /* @__PURE__ */ jsx(SplashSettings, {}));
}
//#endregion
export { spicetify_splash_default as default };

//# sourceMappingURL=mod.js.map