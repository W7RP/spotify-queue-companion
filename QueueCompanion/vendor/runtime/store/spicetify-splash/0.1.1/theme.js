//#region modules/spicetify-splash/theme.ts
const CSS_KEY = "spicetify:splash:css";
const SNAPSHOT_KEY = "spicetify:splash:theme";
const MAX_CSS = 32 * 1024;
const MAX_SNAPSHOT = 64 * 1024;
const SELECTOR = "spicetify-splash";
const STYLE_RULE = 1;
const IMPORT_RULE = 3;
const KEYFRAMES_RULE = 7;
function getCustomCss() {
	const css = localStorage.getItem(CSS_KEY) ?? "";
	return css.length <= MAX_CSS ? css : "";
}
function saveCustomCss(css) {
	if (css.length > MAX_CSS) throw new Error("Keep custom CSS under 32 KB.");
	if (css.trim()) localStorage.setItem(CSS_KEY, css);
	else localStorage.removeItem(CSS_KEY);
}
function getThemeSnapshot() {
	const css = localStorage.getItem(SNAPSHOT_KEY) ?? "";
	return css.length <= MAX_SNAPSHOT ? css : "";
}
function saveThemeSnapshot(baseCss, customCss) {
	const keyframes = /* @__PURE__ */ new Map();
	let rules = "";
	for (const sheet of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets ?? []]) rules += pickRules(sheet, keyframes);
	const animated = /* @__PURE__ */ new Set();
	for (const [, value] of `${rules}${customCss}`.matchAll(/animation(?:-name)?\s*:([^;}]+)/g)) for (const name of value.split(/[\s,]+/)) animated.add(name);
	let motion = "";
	for (const name of animated) motion += keyframes.get(name)?.cssText ?? "";
	const root = window.getComputedStyle(document.documentElement);
	let properties = "";
	for (const name of new Set(`${baseCss}${customCss}${rules}`.match(/--(?!_)[\w-]+/g))) {
		const value = root.getPropertyValue(name).trim();
		if (value) properties += `${name}:${value};`;
	}
	const snapshot = (properties ? `@layer spicetify-splash{:root{${properties}}}` : "") + (rules ? `@layer spicetify-splash-theme{${motion}${rules}}` : "");
	try {
		if (!snapshot) localStorage.removeItem(SNAPSHOT_KEY);
		else if (snapshot.length <= MAX_SNAPSHOT) localStorage.setItem(SNAPSHOT_KEY, snapshot);
		else {
			localStorage.removeItem(SNAPSHOT_KEY);
			console.warn("[spicetify-splash] Theme splash styles exceed 64 KB; they apply once the theme loads.");
		}
	} catch (error) {
		console.warn("[spicetify-splash] Could not save the theme's splash styles.", error);
	}
}
function pickRules(sheet, keyframes) {
	let rules;
	try {
		rules = sheet.cssRules;
	} catch {
		return "";
	}
	return pickFrom(rules, keyframes, sheet.href);
}
function pickFrom(rules, keyframes, base) {
	let css = "";
	for (const rule of Array.from(rules)) if (rule.type === STYLE_RULE) {
		if (rule.selectorText.includes(SELECTOR)) css += absolutize(rule.cssText, base);
	} else if (rule.type === KEYFRAMES_RULE) keyframes.set(rule.name, rule);
	else if (rule.type === IMPORT_RULE) {
		const imported = rule.styleSheet;
		if (imported) css += pickRules(imported, keyframes);
	} else if ("cssRules" in rule) {
		const inner = pickFrom(rule.cssRules, keyframes, base);
		if (inner) css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${inner}}`;
	}
	return css;
}
function absolutize(css, base) {
	if (!base) return css;
	return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, _quote, url) => /^(?:[a-z][\w+.-]*:|\/|#)/i.test(url) || !URL.canParse(url, base) ? match : `url("${new URL(url, base).href}")`);
}
//#endregion
export { getCustomCss, getThemeSnapshot, saveCustomCss, saveThemeSnapshot };

//# sourceMappingURL=theme.js.map