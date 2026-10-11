import { Platform } from "./expose/Platform.js";
import { fromString } from "./webpack/URI.gen.js";
import "./webpack/URI.js";
//#region modules/stdlib/src/storage.ts
const createStorage = (ctx) => {
	const hookedNativeStorageMethods = /* @__PURE__ */ new Set([
		"getItem",
		"setItem",
		"removeItem"
	]);
	return new Proxy(globalThis.localStorage, { get(target, p, receiver) {
		const func = Reflect.get(target, p, receiver);
		if (typeof p === "string" && hookedNativeStorageMethods.has(p) && typeof func === "function") return (key, ...data) => func.call(target, `module:${ctx.identifier}:${key}`, ...data);
		return func;
	} });
};
function createSyncedStorage(playlistUri) {
	const CHUNK_SIZE = 200;
	const MAX_DOUBLE_CHUNKS = 1e3;
	const PlaylistAPI = Platform.getPlaylistAPI();
	function markKey(key) {
		return `\x02${key}\x03`;
	}
	function assertSmallerSize(encodedKey, chunk_size, chunk_count, message) {
		for (let n = 0, o = 0, l = 0;; l++) {
			if (chunk_size * n + l + o >= encodedKey.length) return encodedKey;
			if (n >= chunk_count) throw new Error(message);
			if (encodedKey[chunk_size * n + l + o] === "%") o += 2;
			if (l === chunk_size - 1) {
				l = -1;
				n++;
			}
		}
	}
	async function getUris(key) {
		assertSmallerSize(encodeURIComponent(key), CHUNK_SIZE, 1, "Can't fit key in a single chunk");
		const { items } = await PlaylistAPI.getContents(playlistUri, {
			filter: key,
			limit: 1e9
		});
		return items.map((item) => fromString(item.uri)).filter((uri) => uri.type === "local").filter((uri) => uri.track === key);
	}
	async function getKey(key) {
		const uris = await getUris(key);
		if (uris.length === 0) return null;
		return uris.sort((a, b) => a.duration - b.duration).map((uri) => uri.artist + uri.album).join("");
	}
	async function removeKey(key) {
		const uris = await getUris(key);
		if (uris.length > 0) await PlaylistAPI.remove(playlistUri, uris.map((u) => ({
			uri: u.toURI(),
			uid: ""
		})));
	}
	async function addKey(key, encodedValue) {
		assertSmallerSize(encodeURIComponent(key), CHUNK_SIZE, 1, "Can't fit key in a single chunk");
		assertSmallerSize(encodedValue, CHUNK_SIZE, MAX_DOUBLE_CHUNKS, `Can't fit value in ${MAX_DOUBLE_CHUNKS} double chunks`);
		const uris = Array.from(collectTuples(generateStringChunks(encodedValue, CHUNK_SIZE), 2, "")).map(([a, b], i) => `spotify:local:${a}:${b}:${key}:${i + 1}`);
		await PlaylistAPI.add(playlistUri, uris, { after: "end" });
	}
	return {
		async getItem(key) {
			const encodedData = await getKey(markKey(key));
			return encodedData === null ? null : decodeURIComponent(encodedData);
		},
		async removeItem(key) {
			try {
				await removeKey(markKey(key));
			} catch (_) {
				return false;
			}
			return true;
		},
		async setItem(key, value) {
			const encodedValue = encodeURIComponent(value);
			await removeKey(markKey(key));
			await addKey(markKey(key), encodedValue);
			return value;
		}
	};
}
function* generateStringChunks(string, chunk_size) {
	for (let s = "", n = 0, o = 0, l = 0;; l++) {
		if (chunk_size * n + l + o >= string.length) {
			if (l > 0) yield s;
			break;
		}
		s += string[chunk_size * n + l + o];
		if (string[chunk_size * n + l + o] === "%") s += string[chunk_size * n + l + ++o] + string[chunk_size * n + l + ++o];
		if (l === chunk_size - 1) {
			l = -1;
			n++;
			yield s;
			s = "";
		}
	}
}
function* collectTuples(gen, l, unit) {
	let result;
	let done;
	function next() {
		if (done) return unit;
		result = gen.next();
		done = result.done;
		if (done) return unit;
		return result.value;
	}
	while (!done) yield Array.from({ length: l }, next);
}
//#endregion
export { createStorage, createSyncedStorage };

//# sourceMappingURL=storage.js.map