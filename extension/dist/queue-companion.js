"use strict";
(() => {
  // src/ipc.ts
  var Helper = class {
    socket;
    ready;
    pending = /* @__PURE__ */ new Map();
    closed = false;
    async connect() {
      if (this.ready) return this.ready;
      const config = window.__queueCompanionPairing;
      if (!config) throw Error("Queue Companion needs repair. Open Queue Companion Setup.");
      this.closed = false;
      this.ready = new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${config.port}/v1`);
        this.socket = ws;
        const deadline = window.setTimeout(() => {
          ws.close();
          reject(Error("Local helper is unavailable. Open Queue Companion."));
        }, 5e3);
        ws.onopen = () => ws.send(JSON.stringify({ v: 1, type: "pair", token: config.token }));
        ws.onmessage = (e) => {
          let m;
          try {
            m = JSON.parse(e.data);
          } catch {
            return;
          }
          if (m.v !== 1) return;
          if (m.type === "paired") {
            clearTimeout(deadline);
            resolve();
            return;
          }
          const p = this.pending.get(m.id);
          if (!p) return;
          this.pending.delete(m.id);
          clearTimeout(p.timer);
          m.ok ? p.resolve(m.data) : p.reject(Error(m.error));
        };
        ws.onerror = () => reject(Error("Cannot connect to the local helper. Open Queue Companion."));
        ws.onclose = () => {
          clearTimeout(deadline);
          this.ready = void 0;
          for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(Error("Helper disconnected. No queue write has been retried."));
          }
          this.pending.clear();
          if (!this.closed) reject(Error("Local pairing failed. Open Queue Companion Setup and use Repair."));
        };
      });
      return this.ready;
    }
    async request(type, data = {}, signal) {
      await this.connect();
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const abort = () => {
          this.socket?.send(JSON.stringify({ v: 1, type: "cancel", id }));
          const p = this.pending.get(id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.reject(new DOMException("Cancelled", "AbortError"));
          }
        };
        const timer = window.setTimeout(() => {
          this.pending.delete(id);
          signal?.removeEventListener("abort", abort);
          reject(Error("Helper timed out. Nothing was queued."));
        }, 55e3);
        this.pending.set(id, { resolve: (x) => {
          signal?.removeEventListener("abort", abort);
          resolve(x);
        }, reject: (e) => {
          signal?.removeEventListener("abort", abort);
          reject(e);
        }, timer });
        signal?.addEventListener("abort", abort, { once: true });
        this.socket.send(JSON.stringify({ v: 1, type, id, data }));
      });
    }
    dispose() {
      this.closed = true;
      this.socket?.close();
      this.ready = void 0;
    }
  };

  // src/spotify.ts
  var TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;
  var SEARCH = { name: "searchTracks", operation: "query", sha256Hash: "b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751", value: null };
  function normalize(raw, source = "catalogue") {
    const item = raw?.item?.data ?? raw?.data ?? raw?.track ?? raw;
    if (!TRACK.test(item?.uri ?? "")) return null;
    if (item.isPlayable === false || item.playability?.playable === false || item.isLocal || item.isBanned) return null;
    const artists = Array.isArray(item.artists) ? item.artists : item.artists?.items ?? [];
    const title = item.name ?? item.title ?? item.metadata?.title;
    const artist = artists.map((a) => a.name ?? a.profile?.name).filter(Boolean).join(", ") || (item.artist ?? item.metadata?.artist_name);
    if (typeof title !== "string" || typeof artist !== "string") return null;
    return { id: item.uri.split(":")[2], uri: item.uri, title: title.slice(0, 200), artist: artist.slice(0, 200), source, artistNames: artists.map((a) => a.name ?? a.profile?.name).filter((s) => typeof s === "string").map((s) => s.slice(0, 200)) };
  }
  var Spotify = class {
    constructor(helper2) {
      this.helper = helper2;
    }
    async account() {
      const u = await Spicetify.Platform.UserAPI.getUser();
      if (!u.username) throw Error("Spotify sign-in is unavailable.");
      return u.username;
    }
    async snapshot() {
      const account = await this.account();
      const q = Spicetify.Queue;
      const device = Spicetify.Platform.ConnectAPI.getState().activeDevice;
      if (!q?.track?.contextTrack || !Array.isArray(q.nextTracks)) throw Error("Start a song on this computer before adding to the queue.");
      return { account, local: device?.isLocal === true && device?.isActive === true, revision: String(q.queueRevision), current: q.track.contextTrack.uri, entries: q.nextTracks.map((e) => ({ uri: e.contextTrack.uri, uid: e.contextTrack.uid ?? "", manual: e.provider === "queue" && e.contextTrack.metadata?.is_queued === "true", raw: { uri: e.contextTrack.uri, uid: e.contextTrack.uid } })) };
    }
    replaceSupported() {
      return !(typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent ?? "")) && Spicetify.Platform.version === "1.3.4.258" && typeof Spicetify.removeFromQueue === "function" && typeof Spicetify.Player.origin?._queue?.removeFromQueue === "function";
    }
    async append(uris) {
      if (typeof Spicetify.Player.origin?._queue?.addToQueue !== "function") throw Error("Native queue integration is unavailable. Repair Spicetify.");
      await Spicetify.addToQueue(uris.map((uri) => ({ uri })));
    }
    async remove(before) {
      const q = Spicetify.Queue;
      if (String(q.queueRevision) !== before.revision || q.track.contextTrack.uri !== before.current || Spicetify.Platform.ConnectAPI.getState().activeDevice?.isLocal !== true) throw Error("The queue changed immediately before replacement. Nothing was removed.");
      const manual = before.entries.filter((e) => e.manual);
      if (manual.some((e) => !e.uid)) throw Error("Queue entry identity is unavailable. Replacement stopped.");
      const all = Spicetify.Player.origin._queue.getQueue().queued;
      if (Array.isArray(all) && all.length !== manual.length) throw Error("The full manual queue is not visible. Replacement stopped.");
      await Spicetify.removeFromQueue(manual.map((e) => ({ uri: e.uri, uid: e.uid })));
      for (let i = 0; i < 20; i++) {
        if (!Spicetify.Queue.nextTracks.some((e) => manual.some((m) => m.uid === e.contextTrack.uid))) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Native queue removal could not be confirmed.");
    }
    async cached(key, ttl, load, fresh = false) {
      const account = await this.account();
      if (!fresh) {
        const item = await this.helper.request("cache.get", { account, key });
        if (item != null) return item;
      }
      const data = await load();
      if (account !== await this.account()) throw Error("Spotify account changed during retrieval.");
      await this.helper.request("cache.put", { account, key, ttl, value: data });
      return data;
    }
    async search(term, limit = 30) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw Error("Catalogue search exceeds the candidate limit.");
      return this.cached("search:v3:" + term + ":" + limit, 300, async () => {
        const tracks = /* @__PURE__ */ new Map();
        let offset = 0;
        for (let pages = 0; offset < limit && pages < 5; pages++) {
          const pageLimit = Math.min(40, limit - offset);
          const result = await Spicetify.GraphQL.Request(SEARCH, { searchTerm: term, offset, limit: pageLimit, numberOfTopResults: Math.min(pageLimit, 30), includeAudiobooks: true, includeAuthors: true, includePreReleases: false, includeArtistHasConcertsField: false, includeEpisodeContentRatingsV2: false });
          if (result.errors?.length) throw Error("Spotify catalogue search is unavailable on this build. Repair and retry.");
          const page = result.data?.searchV2?.tracksV2;
          const items = page?.items;
          if (!Array.isArray(items)) throw Error("Spotify search returned an unsupported response.");
          for (const item of items) {
            const track = normalize(item);
            if (track) tracks.set(track.uri, track);
          }
          if (!items.length || typeof page.totalCount === "number" && offset + items.length >= page.totalCount) break;
          const next = page.pagingInfo?.nextOffset ?? offset + items.length;
          if (!Number.isInteger(next) || next < offset + items.length || items.length < pageLimit && page.pagingInfo?.nextOffset == null) break;
          offset = next;
        }
        return [...tracks.values()].slice(0, limit);
      });
    }
    async resolve(title, artist) {
      const found = await this.search(title + " " + artist, 5);
      const clean2 = (s) => s.normalize("NFKD").toLowerCase().replace(new RegExp("\\p{M}", "gu"), "").replace(/[^\p{L}\p{N}]/gu, "");
      const sameArtist = (t) => clean2(t.artist) === clean2(artist) || (t.artistNames ?? t.artist.split(", ")).some((name) => clean2(name) === clean2(artist));
      const recording = (value) => value.replace(/\s*[-–—(\[]\s*(?:(?:19|20)\d{2}\s*)?(?:remaster(?:ed)?(?:\s*(?:19|20)\d{2})?|mono|stereo)(?:\s*version)?[)\]]?\s*$/i, "");
      return found.find((t) => clean2(t.title) === clean2(title) && sameArtist(t)) ?? found.find((t) => clean2(recording(t.title)) === clean2(recording(title)) && sameArtist(t)) ?? null;
    }
    async liked(limit = 200) {
      return this.pageTracks("liked", (o) => Spicetify.Platform.LibraryAPI.getTracks(o), limit, "liked");
    }
    async playlist(uri, limit = 200) {
      return this.pageTracks("playlist:" + uri, (o) => Spicetify.Platform.PlaylistAPI.getContents(uri, o), limit, uri);
    }
    async pageTracks(key, loader, maximum, source) {
      const items = [];
      let offset = 0;
      let total = Infinity;
      const account = await this.account();
      while (offset < total && offset < maximum) {
        const page = await loader({ offset, limit: Math.min(100, maximum - offset) });
        if (!Array.isArray(page.items)) throw Error("Spotify library response changed. Repair Queue Companion.");
        total = page.totalLength ?? page.unfilteredTotalLength ?? page.items.length;
        for (const raw of page.items) {
          const t = normalize(raw, source);
          if (t) items.push(t);
        }
        if (!page.items.length) break;
        offset += page.items.length;
      }
      if (account !== await this.account()) throw Error("Spotify account changed during library retrieval.");
      await this.helper.request("cache.put", { account, key, ttl: 60, value: items });
      return items;
    }
    async playlists() {
      const out = [];
      const account = await this.account();
      const result = await Spicetify.Platform.RootlistAPI.getContents();
      if (!Array.isArray(result.items)) throw Error("Spotify playlist listing changed. Repair Queue Companion.");
      const walk = (items) => {
        for (const x of items) {
          if (x.type === "playlist") out.push({ uri: x.uri, name: x.name, owner: x.owner?.displayName });
          else if (x.type === "folder" && Array.isArray(x.items)) walk(x.items);
        }
      };
      walk(result.items);
      if (account !== await this.account()) throw Error("Spotify account changed.");
      return [...new Map(out.map((p) => [p.uri, p])).values()];
    }
    async recent() {
      const account = await this.account();
      const data = await Spicetify.Platform.PlayHistoryAPI.getContents();
      if (account !== await this.account()) throw Error("Spotify account changed during history retrieval.");
      return (data.items ?? []).slice(0, 200).map((x) => normalize(x, "recently played")).filter(Boolean);
    }
    async validate(tracks) {
      const validated = [];
      for (let at = 0; at < tracks.length; at += 10) {
        const batch = await Promise.all(tracks.slice(at, at + 10).map(async (t) => {
          const response = await Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.getTrack, { uri: t.uri });
          const raw = response.data?.trackUnion ?? response.data?.track;
          if (response.errors?.length || !raw || raw.__typename !== "Track" || raw.playability?.playable !== true) throw Error("A selected song is unavailable. Nothing was queued.");
          return t;
        }));
        validated.push(...batch);
      }
      return validated;
    }
    startHistory(onError) {
      let session = crypto.randomUUID(), uri = "", position = 0, at = performance.now(), listened = 0, sent = false, account = "";
      let checking = false;
      const tick = async () => {
        const state = Spicetify.Platform.PlayerAPI.getState();
        const now = performance.now();
        const progress = Spicetify.Player.getProgress();
        const item = state.item;
        const local = Spicetify.Platform.ConnectAPI.getState().activeDevice?.isLocal === true;
        if (!item?.uri || !local) {
          at = now;
          position = progress;
          return;
        }
        if (item.uri !== uri || progress < position - 1e3) {
          uri = item.uri;
          session = crypto.randomUUID();
          listened = 0;
          sent = false;
          position = progress;
          at = now;
        }
        const delta = progress - position;
        const elapsed = now - at;
        if (!state.isPaused && !state.isBuffering && delta > 0 && delta < 2e3 && elapsed < 2e3) listened += Math.min(delta, elapsed + 100);
        position = progress;
        at = now;
        if (sent || checking || listened < Math.min(3e4, state.duration / 2)) return;
        checking = true;
        try {
          const current = await this.account();
          if (account && account !== current) {
            listened = 0;
            session = crypto.randomUUID();
            sent = false;
          } else {
            await this.helper.request("observe", { account: current, duration: state.duration, listen: { uri, title: item.metadata.title, artist: item.metadata.artist_name, session, milliseconds: Math.round(listened), at: (/* @__PURE__ */ new Date()).toISOString() } });
            sent = true;
          }
          account = current;
        } catch (e) {
          onError?.(e instanceof Error ? e.message : "History recording unavailable.");
        } finally {
          checking = false;
        }
      };
      const reset = () => {
        at = performance.now();
        position = Spicetify.Player.getProgress();
      };
      Spicetify.Player.addEventListener("onprogress", tick);
      Spicetify.Player.addEventListener("onplaypause", reset);
      return () => {
        Spicetify.Player.removeEventListener("onprogress", tick);
        Spicetify.Player.removeEventListener("onplaypause", reset);
      };
    }
  };

  // src/domain.ts
  function parseIntent(prompt, length = 15, cap = 50, preference = "append") {
    const text = prompt.trim();
    if (!text || text.length > 1e3) throw Error("Use a request between 1 and 1,000 characters.");
    const words2 = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
    const countText = text.replace(/[“"][^”"]+[”"]/g, "").replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g, "");
    const inclusionPattern = /\b(?:include|including|mix in|add in|throw in|keep)\s+(?:(a few|a couple|few|couple|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+)?(?:of\s+)?(?:the\s+|its\s+)?(?:(original)\s+)?(?:songs?|tracks?)\s*(?:(?:from|off|of)\b|(?=too\b|as well\b|[,.!?]|$))/gi;
    const positiveInclusions = (value) => [...value.matchAll(inclusionPattern)].filter((m) => !/(?:\b(?:do not|don't|never|not|without)\s+)$/i.test(value.slice(0, m.index)));
    const hasSimilarity = /\b(?:like|similar|based on|inspired by|in the style of|branch out)\b/i.test(countText);
    const inclusions = hasSimilarity ? positiveInclusions(countText) : [];
    const totalText = inclusions.reduceRight((s, m) => s.slice(0, m.index) + s.slice(m.index + m[0].length), countText);
    const number = totalText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:(?!songs?\b|tracks?\b)[\p{L}-]+\s+){0,4}(?:songs?|tracks?)\b/iu)?.[1]?.toLowerCase();
    const count = Math.max(1, Math.min(cap, number ? words2[number] ?? Number(number) : length));
    const semantic = countText;
    const followup = /\b(add (?:another|more)|more (?:music|songs|tracks)|like (?:these|this))\b/i.test(semantic);
    const replace = /\b(replace (?:the |my )?queue|start over|make a new queue)\b/i.test(semantic);
    const liked = /\b(liked songs|my likes|favorites|favourites)\b/i.test(semantic);
    const mentionsHistory = /\b(most played|top tracks|listening history|recently played|recent (?:plays|tracks|songs))\b/i.test(semantic);
    const discover = mentionsHistory && /\b(like|similar|based on|inspired by|discover|recommend|suggest|new|different)\b/i.test(semantic) && !/\b(?:replay|play again)\b|\bonly\s+(?:(?:songs?|tracks?)\s+)?from\s+(?:my\s+)?(?:recently played|recent (?:plays|tracks|songs)|listening history|most played|top tracks)\b/i.test(semantic);
    const inspiration = discover ? /\b(most played|top tracks)\b/i.test(semantic) ? "history" : "recent" : null;
    const history = mentionsHistory && !discover;
    const playlistUris = [], playlistNames = [], referencePlaylistUris = [], referencePlaylistNames = [], includedPlaylistUris = [], includedPlaylistNames = [];
    const mentions = [...text.matchAll(/[“"]([^”"]+)[”"]|(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)([A-Za-z0-9]{22})/g)];
    const similarity = /\b(?:like|similar|based on|inspired by|in the style of|branch out)\b/gi;
    let reference = false, includedRole = false, previousEnd = 0;
    for (const mention of mentions) {
      const prefix = text.slice(previousEnd, mention.index);
      const similar = [...prefix.matchAll(similarity)].at(-1)?.index ?? -1;
      const strict = [...prefix.matchAll(/\b(?:only|exclusively|strictly)\b/gi)].at(-1)?.index ?? -1;
      const included = positiveInclusions(prefix).at(-1);
      const includeAt = included?.index ?? -1;
      if (strict > similar && strict > includeAt) {
        reference = false;
        includedRole = false;
      } else if (similar >= 0 && similar > includeAt) {
        reference = true;
        includedRole = false;
      } else if (included && hasSimilarity) {
        reference = false;
        includedRole = true;
      } else if (/\b(?:from|within|mix|mashup|combine)\b/i.test(prefix)) {
        reference = false;
        includedRole = false;
      }
      if (mentions.length === 1) {
        const suffix = text.slice(mention.index + mention[0].length);
        if (/\bbranch out\b/i.test(suffix) && strict < 0) reference = true;
        if (/\bonly\s+from\s+(?:it|that|this)|\b(?:playlist\s+only|only\s+(?:that|this)\s+playlist)\b/i.test(suffix)) reference = false;
      }
      if (includedRole) {
        if (mention[1]) includedPlaylistNames.push(mention[1]);
        else includedPlaylistUris.push("spotify:playlist:" + mention[2]);
      } else if (mention[1]) (reference ? referencePlaylistNames : playlistNames).push(mention[1]);
      else (reference ? referencePlaylistUris : playlistUris).push("spotify:playlist:" + mention[2]);
      previousEnd = mention.index + mention[0].length;
    }
    const mash = text.match(/(?:mix|mashup|combine)\s+(?:my\s+)?(.+?)\s+playlists?\b/i)?.[1];
    if (!mentions.length && mash) playlistNames.push(...mash.split(/\s*,\s*|\s+and\s+|\s*&\s*/).map((s) => s.trim()).filter(Boolean));
    if (inclusions.length && !referencePlaylistNames.length && !referencePlaylistUris.length) {
      referencePlaylistNames.push(...includedPlaylistNames);
      referencePlaylistUris.push(...includedPlaylistUris);
    }
    let playlistCount = 0;
    if (inclusions.length && (referencePlaylistNames.length || referencePlaylistUris.length)) {
      const amount = inclusions.at(-1)[1]?.toLowerCase();
      playlistCount = amount && words2[amount] !== void 0 ? words2[amount] : amount && /^\d+$/.test(amount) ? Number(amount) : /couple/.test(amount ?? "") ? 2 : Math.min(3, Math.max(1, Math.round(count / 5)));
      if (playlistCount && count < 2) throw Error("Choose at least two songs to mix playlist songs with discoveries.");
      if (playlistCount >= count) throw Error("The playlist portion must be smaller than the total song count.");
      if (!includedPlaylistNames.length && !includedPlaylistUris.length) {
        includedPlaylistNames.push(...referencePlaylistNames);
        includedPlaylistUris.push(...referencePlaylistUris);
      }
    }
    const more = followup && !mentionsHistory && !mentions.length && !playlistNames.length;
    if (/\bplaylist(?:s)?\b|\bmy library\b/i.test(text) && !liked && !mentions.length && !playlistNames.length) throw Error("Put playlist names in quotes, mix named playlists, or paste their Spotify links.");
    let remaining = text;
    for (const name of [...playlistNames, ...referencePlaylistNames, ...includedPlaylistNames]) remaining = remaining.replace(name, "");
    remaining = remaining.replace(/(?:spotify:playlist:|https:\/\/open\.spotify\.com\/playlist\/)[A-Za-z0-9]{22}[^\s]*/g, "");
    remaining = remaining.replace(/\b(mix|mashup|combine|add|another|more|songs?|tracks?|only|from|my|these|the|and|playlists?|liked|likes|favorites|favourites|please|repeat|duplicates|twice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\b|\d+|[^\p{L}\p{N}\s]/giu, " ").trim();
    const repeat = !/\b(no|without|avoid|skip|exclude)\s+(?:any\s+)?(?:repeats?|duplicates?)\b|\b(?:do not|don't|never)\s+(?:(?:allow|include|add|use)\s+)?(?:repeat|duplicates)\b/i.test(semantic) && /\b(repeat|allow duplicates|include duplicates|twice)\b/i.test(semantic);
    return { prompt: text, count, mode: replace ? "replace" : followup ? "append" : preference, liked, history, inspiration, more, repeat, playlistNames, playlistUris, referencePlaylistNames, referencePlaylistUris, includedPlaylistNames, includedPlaylistUris, playlistCount, filtered: remaining.length > 0 };
  }
  function playlistMatches(name, playlists) {
    const normalize2 = (s) => s.normalize("NFKC").trim().toLocaleLowerCase();
    const target = normalize2(name);
    const exact = playlists.filter((p) => normalize2(p.name) === target);
    return exact.length ? exact : playlists.filter((p) => normalize2(p.name).includes(target));
  }
  function balancedMix(groups, count, repeat = false) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const positions = groups.map(() => 0);
    while (out.length < count) {
      let progressed = false;
      for (let i = 0; i < groups.length && out.length < count; i++) {
        let t;
        while (positions[i] < groups[i].length) {
          const c = groups[i][positions[i]++];
          if (repeat || !seen.has(c.uri)) {
            t = c;
            break;
          }
        }
        if (t) {
          out.push(t);
          seen.add(t.uri);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return out;
  }
  function validateSelection(tracks, sources, count, repeat = false) {
    if (!tracks.length) throw Error("No matching playable songs were found. Try a broader request.");
    if (tracks.length > count) throw Error("Selection exceeded the requested count.");
    if (tracks.some((t) => !/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri))) throw Error("Selection contains an invalid track.");
    if (sources && tracks.some((t) => !sources.has(t.uri))) throw Error("Selection left the requested source. Nothing was queued.");
    if (!repeat && new Set(tracks.map((t) => t.uri)).size !== tracks.length) throw Error("Selection contains accidental duplicates.");
    return tracks;
  }
  function sameQueue(a, b) {
    return a.account === b.account && a.local && b.local && a.current === b.current && a.revision === b.revision && JSON.stringify(a.entries.map((e) => [e.uid, e.uri, e.manual])) === JSON.stringify(b.entries.map((e) => [e.uid, e.uri, e.manual]));
  }
  function inserted(before, after, uris) {
    if (before.account !== after.account || !after.local) return false;
    const old = new Set(before.entries.map((e) => e.uid));
    const fresh = after.entries.filter((e) => e.manual && e.uid && !old.has(e.uid));
    const wanted = uris.slice();
    let at = 0;
    for (const e of fresh) if (e.uri === wanted[at]) at++;
    return at === wanted.length;
  }

  // src/queue.ts
  var QueueWriter = class {
    constructor(adapter, journal) {
      this.adapter = adapter;
      this.journal = journal;
    }
    chain = Promise.resolve();
    uncertain = false;
    get blocked() {
      return this.uncertain;
    }
    acknowledge() {
      this.uncertain = false;
    }
    commit(tracks, mode, expected) {
      const run2 = () => this.mutate(tracks, mode, expected);
      const task = this.chain.then(run2, run2);
      this.chain = task.catch(() => {
      });
      return task;
    }
    async mutate(tracks, mode, expected) {
      if (this.uncertain) throw Error("A previous write is uncertain. Inspect Spotify\u2019s Queue, then restart Spotify to reconcile.");
      validateSelection(tracks, null, 50, true);
      const before = await this.adapter.snapshot();
      if (before.account !== expected.account) throw Error("Spotify account changed. Submit your request again.");
      if (!before.local) throw Error("Playback moved to another device. Select this computer in Spotify before queueing.");
      if (mode === "replace" && !sameQueue(expected, before)) throw Error("The queue changed while selecting songs. Review it and retry.");
      if (mode === "replace" && !this.adapter.replaceSupported()) throw Error("Queue replacement is unavailable on this Spotify build. Use append.");
      const uris = tracks.map((t) => t.uri);
      const start2 = performance.now();
      this.journal({ state: "writing", mode, before, uris, at: Date.now() });
      let writeError;
      try {
        if (mode === "replace" && before.entries.some((e) => e.manual)) {
          await this.adapter.remove(before);
          const afterRemove = await this.adapter.snapshot();
          if (afterRemove.entries.some((e) => e.manual) || afterRemove.current !== before.current || afterRemove.account !== before.account || !afterRemove.local) throw Error("Queue removal was partial or playback changed. Replacement stopped.");
        }
        await this.adapter.append(uris);
      } catch (e) {
        writeError = e;
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        let after;
        try {
          after = await this.adapter.snapshot();
        } catch {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        if (inserted(before, after, uris)) {
          this.journal({ state: "confirmed", mode, uris, revision: after.revision, at: Date.now() });
          return { count: uris.length, insertionMs: Math.round(performance.now() - start2) };
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      this.uncertain = true;
      this.journal({ state: "uncertain", mode, before, uris, at: Date.now() });
      throw Error("Queue write could not be confirmed. Some songs may have been added. Inspect Spotify\u2019s Queue; do not repeat append." + (writeError instanceof Error ? " " + writeError.message : ""));
    }
  };

  // src/selection.ts
  function shortfallReason(selected, requested, report) {
    if (selected >= requested) return "";
    if (report.kind === "history") return `Only ${selected} songs were available in this history.`;
    if (report.kind === "sources") return `Only ${selected} matches were selected from the ${report.candidates} source songs checked.`;
    const reasons = [];
    if (report.proposed < requested) reasons.push(`The model returned ${report.proposed} choices`);
    if (report.unmatched) reasons.push(`${report.unmatched} suggested ${report.unmatched === 1 ? "song could" : "songs could"} not be matched on Spotify`);
    if (report.duplicates) reasons.push(`${report.duplicates} duplicate ${report.duplicates === 1 ? "match was" : "matches were"} skipped`);
    if (report.previous) reasons.push(`${report.previous} ${report.previous === 1 ? "song was" : "songs were"} already in your listening references, queue or previous selection`);
    if (report.invalid) reasons.push(`${report.invalid} invalid song ${report.invalid === 1 ? "suggestion was" : "suggestions were"} skipped`);
    if (report.diversity) reasons.push(`${report.diversity} choices from overrepresented artists were skipped to keep the selection varied`);
    return reasons.length ? reasons.join("; ") + "." : `Only ${selected} matching songs were found.`;
  }

  // src/music.ts
  var clean = (value) => value.normalize("NFKD").toLowerCase().replace(new RegExp("\\p{M}", "gu"), "").replace(/[^\p{L}\p{N}]/gu, "");
  var primaryArtist = (track) => track.artistNames?.[0] ?? track.artist;
  function spread(items, limit) {
    if (items.length <= limit) return items.slice();
    if (limit === 1) return items.slice(0, 1);
    return Array.from({ length: limit }, (_, i) => items[Math.round(i * (items.length - 1) / (limit - 1))]);
  }
  function songKeys(track) {
    const title = track.title.replace(/\s*(?:-\s*|\(|\[)(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|mono(?: version)?|stereo(?: version)?)\s*[)\]]?$/i, "");
    return [...new Set((track.artistNames?.length ? track.artistNames : [track.artist]).map((artist) => clean(title) + "|" + clean(artist)))];
  }
  var songKey = (track) => songKeys(track)[0];
  function uniqueMusic(tracks, limit = 200) {
    const uris = /* @__PURE__ */ new Set(), songs = /* @__PURE__ */ new Set();
    const out = [];
    for (const track of tracks) {
      const keys = songKeys(track);
      if (uris.has(track.uri) || keys.some((key) => songs.has(key))) continue;
      uris.add(track.uri);
      for (const key of keys) songs.add(key);
      out.push(track);
      if (out.length === limit) break;
    }
    return out;
  }
  function tasteSeeds(tracks, limit = 12) {
    const groups = /* @__PURE__ */ new Map();
    for (const track of uniqueMusic(tracks)) {
      const artist = clean(primaryArtist(track));
      const group = groups.get(artist) ?? [];
      group.push(track);
      groups.set(artist, group);
    }
    const representative = spread([...groups.values()], limit);
    const out = [];
    for (let row = 0; out.length < limit; row++) {
      let found = false;
      for (const group of representative) {
        if (group[row]) {
          out.push(group[row]);
          found = true;
          if (out.length === limit) break;
        }
      }
      if (!found) break;
    }
    return out;
  }

  // src/curation.ts
  var selectionPolicy = {
    "schemaVersion": 1,
    "version": "1.2.0",
    "collectives": [
      {
        "name": "Drain Gang",
        "members": [
          "Bladee",
          "Ecco2k",
          "Thaiboy Digital",
          "Whitearmor"
        ],
        "source": "https://year0001.com/label/cases/yr0048"
      }
    ],
    "defaults": {
      "artistShareDivisor": 5,
      "minimumOtherArtistSongs": 2
    },
    "models": {
      "effort": "low",
      "chatgpt": {
        "preferredFamily": "luna",
        "fallbackFamilies": [],
        "lowEffortFamilies": [
          "gpt-6-luna",
          "gpt-6-sol",
          "gpt-6-astra",
          "gpt-6.1-sol"
        ]
      },
      "claude": {
        "preferredFamily": "haiku",
        "fallbackFamilies": [
          "sonnet"
        ],
        "lowEffortModels": [
          "claude-haiku-5-5"
        ]
      }
    },
    "refill": {
      "maxAttempts": 1,
      "deadlineMs": 6e4,
      "maxAvoid": 75
    }
  };
  var words = (text) => text.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  var artistKey = (track) => words(track.artistNames?.[0] ?? track.artist);
  function validateMusicBrief(value, prompt, count) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("The music brief could not be read. Nothing was queued.");
    let b = value;
    const names = (v) => Array.isArray(v) && v.length <= 6 && v.every((s) => typeof s === "string" && !!s.trim() && s.length <= 120 && !/[\u0000-\u001f]/.test(s));
    if (!["similarity", "artist-only", "discovery"].includes(b.kind) || !names(b.referenceArtists) || !names(b.excludedArtists) || !["balanced", "deep-cuts", "new-artists", "familiar"].includes(b.discovery) || !Number.isInteger(b.referenceCount) || b.referenceCount < -1 || b.referenceCount > count || !Array.isArray(b.excludedVersions) || b.excludedVersions.length > 4 || b.excludedVersions.some((v) => !["live", "acoustic", "remix", "cover"].includes(v)) || [b.genre, b.mood, b.era].some((s) => typeof s !== "string" || s.length > 200 || /[\u0000-\u001f]/.test(s))) throw Error("The music brief exceeded selection limits. Nothing was queued.");
    const text = " " + words(prompt) + " ";
    const knownCollectives = selectionPolicy.collectives.filter((group) => b.referenceArtists.some((name) => words(name) === words(group.name)));
    const collective = b.referenceType === "collective" || knownCollectives.length > 0;
    const members = knownCollectives.length ? knownCollectives.flatMap((group) => [...group.members]) : b.collectiveMembers ?? [];
    if (b.referenceType != null && !["artist", "collective", "none"].includes(b.referenceType) || b.collectiveMembers != null && (!Array.isArray(b.collectiveMembers) || b.collectiveMembers.length > 12 || b.collectiveMembers.some((s) => typeof s !== "string" || !s.trim() || s.length > 120 || /[\u0000-\u001f]/.test(s))) || collective && (!b.referenceArtists.length || !members.length) || !collective && (b.collectiveMembers?.length ?? 0) > 0) throw Error("The music brief exceeded selection limits. Nothing was queued.");
    if (b.kind === "artist-only" && !b.referenceArtists.length) b = { ...b, kind: "discovery", referenceCount: -1 };
    if ([...b.referenceArtists, ...b.excludedArtists].some((a) => !text.includes(" " + words(a) + " "))) throw Error("The music brief introduced an artist restriction that was not requested. Nothing was queued.");
    if (b.kind === "artist-only" && (!b.referenceArtists.length || !b.referenceArtists.some((a) => {
      const name = words(a);
      return text.trim() === name || ["only ", "only songs by ", "only music by ", "only tracks by ", "exclusively ", "exclusively by ", "songs by ", "music by ", "tracks by ", "songs from ", "music from ", "tracks from ", "nothing but "].some((prefix) => text.includes(" " + prefix + name + " "));
    }))) throw Error("The music brief changed an inspiration into an artist-only request. Nothing was queued.");
    if (b.excludedArtists.length && !/\b(?:no|not|without|avoid|exclude|excluding|except|none)\b/.test(words(prompt))) throw Error("The music brief invented an artist exclusion. Nothing was queued.");
    return { kind: b.kind, referenceArtists: [...new Set(b.referenceArtists.map((a) => a.trim()))], excludedArtists: [...new Set(b.excludedArtists.map((a) => a.trim()))], genre: b.genre, mood: b.mood, era: b.era, discovery: b.discovery, referenceCount: b.referenceCount, excludedVersions: [...new Set(b.excludedVersions)], ...collective ? { referenceType: "collective", collectiveMembers: [...new Set(members)] } : b.referenceType != null ? { referenceType: b.referenceType, collectiveMembers: [] } : {} };
  }
  var referenceNames = (music) => music.referenceType === "collective" ? [...music.referenceArtists, ...music.collectiveMembers ?? []] : music.referenceArtists;
  function selectionBrief(prompt, count, modelBrief) {
    const music = modelBrief == null ? null : validateMusicBrief(modelBrief, prompt, count);
    const text = words(prompt);
    const similarity = /\b(?:like|similar to|similar music to|inspired by|in the style of|sounds like)\b/.test(text);
    const referenceText = text.split(/\b(?:similar to|similar music to|inspired by|in the style of|sounds like|like)\b/).slice(1).map((part) => part.split(/\b(?:but|without|except|excluding|only|include|including)\b/)[0].trim()).filter(Boolean);
    const narrow = text.match(/\b(?:only|exclusively|nothing but|all by)\s+(?:(?:songs?|tracks?|music)\s+)?(?:(?:by|from)\s+)?(.+)/)?.[1];
    const artistOnly = !!narrow && (/^(?:them|that band|that artist)\b/.test(narrow) || referenceText.some((part) => (" " + narrow + " ").includes(" " + part + " ")));
    const allocation = artistOnly || /\b(?:mostly|mainly|more (?:of|from)|half|percent|equal|evenly|\d+\s+(?:songs?|tracks?)\s+(?:by|from)|include|including|mix in)\b/.test(text) || /\d\s*%/.test(prompt);
    const explicitCount = music && music.referenceCount >= 0 ? music.referenceCount : null;
    return {
      similarity: music ? music.kind === "similarity" : similarity,
      balance: music ? music.kind === "similarity" && explicitCount === null : similarity && !allocation,
      referenceText: music ? referenceNames(music).map(words) : referenceText,
      count,
      music,
      explicitCount,
      referenceLimit: explicitCount ?? Math.min(count - 1, Math.max(1, Math.floor(count / selectionPolicy.defaults.artistShareDivisor))),
      artistLimit: Math.max(selectionPolicy.defaults.minimumOtherArtistSongs, Math.ceil(count / selectionPolicy.defaults.artistShareDivisor))
    };
  }
  function isReferenceArtist(track, brief) {
    return (track.artistNames?.length ? track.artistNames : [track.artist]).some((name) => {
      const key = words(name);
      return !!key && (brief.music ? brief.referenceText.includes(key) : brief.referenceText.some((part) => (" " + part + " ").includes(" " + key + " ")));
    });
  }
  function curateArtists(tracks, brief, restricted = false) {
    if (restricted) return tracks.slice(0, brief.count);
    const references = [], others = [], totals = /* @__PURE__ */ new Map();
    for (const track of tracks) {
      if (!allowedByBrief(track, brief)) continue;
      const reference = isReferenceArtist(track, brief), key = artistKey(track);
      if (reference && (brief.balance || brief.explicitCount !== null) && references.length >= brief.referenceLimit || !reference && brief.balance && (totals.get(key) ?? 0) >= brief.artistLimit) continue;
      totals.set(key, (totals.get(key) ?? 0) + 1);
      (reference ? references : others).push(track);
    }
    if (brief.balance && !others.length) return [];
    const referenceCount = brief.balance ? Math.min(references.length, brief.count - 1) : Math.min(references.length, brief.explicitCount ?? brief.count);
    const familiar = references.slice(0, referenceCount);
    const remaining = others.slice();
    const ordered = [];
    let previous = "";
    while (ordered.length < brief.count - (brief.explicitCount ?? familiar.length) && remaining.length) {
      let index = remaining.findIndex((track2) => artistKey(track2) !== previous);
      if (index < 0) index = 0;
      const [track] = remaining.splice(index, 1);
      ordered.push(track);
      previous = artistKey(track);
    }
    if (!ordered.length) {
      if (brief.music?.referenceType !== "collective") return familiar.slice(0, brief.count);
      const pool = familiar.slice(), result2 = [];
      let previous2 = "";
      while (pool.length && result2.length < brief.count) {
        let index = pool.findIndex((track2) => artistKey(track2) !== previous2);
        if (index < 0) index = 0;
        const [track] = pool.splice(index, 1);
        result2.push(track);
        previous2 = artistKey(track);
      }
      return result2;
    }
    const result = [];
    let at = 0;
    for (let i = 0; i < ordered.length; i++) {
      result.push(ordered[i]);
      while (at < familiar.length && Math.floor((i + 1) * familiar.length / ordered.length) > at) result.push(familiar[at++]);
    }
    return result.slice(0, brief.count);
  }
  function allowedByBrief(track, brief) {
    const artists = (track.artistNames?.length ? track.artistNames : [track.artist]).map(words), music = brief.music;
    if (!music) return true;
    if (music.excludedArtists.some((a) => artists.includes(words(a)))) return false;
    if (music.kind === "artist-only" && !referenceNames(music).some((a) => artists.includes(words(a)))) return false;
    const rawTitle = track.title ?? "";
    return !music.excludedVersions.some((v) => v === "live" ? /(?:[-–—(\[]\s*[^)\]]*\blive\b)|\blive (?:at|from|in|version|recording)\b/i.test(rawTitle) : new RegExp("[-\u2013\u2014(\\[]\\s*[^)\\]]*\\b" + v + "\\b", "i").test(rawTitle));
  }
  function canRefill(selected, target, started, eligible = true) {
    return eligible && selected < target && Date.now() - started < selectionPolicy.refill.deadlineMs;
  }

  // src/pipeline.ts
  var Pipeline = class {
    constructor(spotify2, helper2, writer2, choose2, activity) {
      this.spotify = spotify2;
      this.helper = helper2;
      this.writer = writer2;
      this.choose = choose2;
      this.activity = activity;
    }
    generation;
    mutation = false;
    previous = [];
    previousReferences = [];
    previousAccount = "";
    previousSources = { liked: false, playlists: [] };
    async run(prompt, settings) {
      if (this.mutation) throw Error("Finishing the current queue change. Please wait.");
      this.generation?.abort();
      const abort = new AbortController();
      this.generation = abort;
      const signal = abort.signal;
      const check = () => {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      };
      const intent = parseIntent(prompt, settings.length, settings.cap, settings.mode);
      const start2 = performance.now(), selectingAt = Date.now();
      let finalBrief;
      this.activity("Selecting songs\u2026");
      const initial = await this.spotify.snapshot();
      if (!initial.local) throw Error("Choose this computer in Spotify\u2019s device menu before queueing.");
      const account = initial.account;
      if (this.previousAccount !== account) {
        this.previous = [];
        this.previousReferences = [];
        this.previousSources = { liked: false, playlists: [] };
        this.previousAccount = account;
      }
      if (intent.more && !this.previous.length) throw Error("Make a selection first, then ask for more like it.");
      if (intent.more && !intent.liked && !intent.playlistNames.length && !intent.playlistUris.length) {
        intent.liked = this.previousSources.liked;
        intent.playlistUris = this.previousSources.playlists.slice();
      }
      const usedSources = { liked: intent.liked, playlists: [] };
      let tracks = [];
      let coverage = "";
      let generationMs = 0, retrievalMs = 0, resolutionMs = 0;
      let sourceSet = null;
      const selection = { kind: intent.history ? "history" : "discovery", candidates: 0, proposed: 0, unmatched: 0, duplicates: 0, previous: 0, invalid: 0, truncated: 0 };
      let references = [], seeds = [];
      if (intent.inspiration) {
        this.activity("Reading your listening references\u2026");
        if (intent.inspiration === "history") {
          const result = await this.helper.request("history", { account, count: 50, days: 30 }, signal);
          references = result.tracks.map((t) => ({ id: t.uri.split(":")[2], uri: t.uri, title: t.title, artist: t.artist, source: "observed history" }));
          coverage = result.coverage + " \xB7 Used as taste references; the selected songs are different.";
        } else {
          references = await this.spotify.recent();
          coverage = "Inspired by Spotify\u2019s available recent plays; seed songs are excluded.";
        }
        check();
        if (await this.spotify.account() !== account) throw Error("Spotify account changed while reading your listening references.");
        references = uniqueMusic(references);
        seeds = tasteSeeds(references);
        if (!seeds.length) throw Error("No listening references are available yet. Play a few songs or describe a genre or mood.");
      }
      const sourcePlaylists = [], referencePlaylists = [], includedPlaylists = [];
      const playlistTracks = /* @__PURE__ */ new Map();
      if (intent.playlistNames.length || intent.playlistUris.length || intent.referencePlaylistNames.length || intent.referencePlaylistUris.length) {
        this.activity("Reading your playlists\u2026");
        const playlists = await this.spotify.playlists();
        const resolvedNames = /* @__PURE__ */ new Map();
        const resolve = async (names, uris, target) => {
          for (const name of names) {
            check();
            const key = name.normalize("NFKC").trim().toLocaleLowerCase();
            let resolved2 = resolvedNames.get(key);
            if (!resolved2) {
              const matches = playlistMatches(name, playlists);
              if (!matches.length) throw Error(`No playlist named \u201C${name}\u201D was found.`);
              resolved2 = matches.length === 1 ? matches[0] : await this.choose(name, matches, signal);
              resolvedNames.set(key, resolved2);
            }
            target.push(resolved2);
          }
          for (const uri of uris) target.push(playlists.find((p) => p.uri === uri) ?? { uri, name: uri });
        };
        await resolve(intent.playlistNames, intent.playlistUris, sourcePlaylists);
        await resolve(intent.referencePlaylistNames, intent.referencePlaylistUris, referencePlaylists);
        if (intent.playlistCount) await resolve(intent.includedPlaylistNames, intent.includedPlaylistUris, includedPlaylists);
        const resolved = [...new Map([...sourcePlaylists, ...referencePlaylists, ...includedPlaylists].map((p) => [p.uri, p])).values()];
        if (resolved.length > 6) throw Error("Use up to six playlists per request.");
        for (const p of resolved) {
          check();
          playlistTracks.set(p.uri, await this.spotify.playlist(p.uri, 200));
        }
        check();
        if (await this.spotify.account() !== account) throw Error("Spotify account changed while reading your playlists.");
        usedSources.playlists = [...new Set(sourcePlaylists.map((p) => p.uri))];
        if (referencePlaylists.length) {
          const groups = referencePlaylists.map((p) => playlistTracks.get(p.uri));
          if (groups.some((g) => !g.length)) throw Error("A reference playlist has no available playable songs. Choose another playlist or describe a genre or mood.");
          seeds = tasteSeeds([...seeds, ...balancedMix(groups, 200)]);
          references = uniqueMusic([...references, ...groups.flat()], 1400);
          coverage += (coverage ? " \xB7 " : "") + "Inspired by the available playlist songs; reference songs are excluded.";
        }
      }
      const includedGroups = includedPlaylists.map((p) => playlistTracks.get(p.uri));
      if (intent.playlistCount) references = uniqueMusic([...references, ...includedGroups.flat()], 1400);
      if (intent.more) {
        seeds = tasteSeeds(this.previous);
        references = uniqueMusic([...references, ...this.previousReferences], 1400);
      }
      const excludedUris = /* @__PURE__ */ new Set(), excludedSongs = /* @__PURE__ */ new Set(), hardUris = /* @__PURE__ */ new Set(), hardSongs = /* @__PURE__ */ new Set();
      if (!intent.repeat && !intent.history) {
        const previous = intent.more || !intent.liked && !intent.playlistNames.length && !intent.playlistUris.length ? this.previous : [];
        for (const t of previous) {
          hardUris.add(t.uri);
          for (const key of songKeys(t)) hardSongs.add(key);
        }
        hardUris.add(initial.current);
        if (intent.mode === "append") for (const entry of initial.entries) hardUris.add(entry.uri);
        for (const t of references) {
          excludedUris.add(t.uri);
          for (const key of songKeys(t)) excludedSongs.add(key);
        }
        for (const uri of hardUris) excludedUris.add(uri);
        for (const key of hardSongs) excludedSongs.add(key);
      }
      const excluded = (track) => excludedUris.has(track.uri) || songKeys(track).some((key) => excludedSongs.has(key));
      const hardExcluded = (track) => hardUris.has(track.uri) || songKeys(track).some((key) => hardSongs.has(key));
      const referenceSongs = new Set(references.flatMap(songKeys));
      const originalUris = /* @__PURE__ */ new Set();
      let originalSelected = 0;
      if (intent.history) {
        if (/most played|top tracks/i.test(prompt)) {
          const result = await this.helper.request("history", { account, count: intent.count, days: 30 }, signal);
          coverage = result.coverage;
          if (!result.tracks.length) throw Error("No local listening counts yet. Meaningful plays will be counted from now on; Spotify does not provide complete past counts here.");
          tracks = result.tracks.map((t) => ({ id: t.uri.split(":")[2], uri: t.uri, title: t.title, artist: t.artist, source: "observed history" }));
        } else {
          const recent = await this.spotify.recent();
          tracks = (intent.repeat ? recent : uniqueMusic(recent)).slice(0, intent.count);
          coverage = "Spotify\u2019s available recent songs; no play counts or complete historical coverage.";
        }
        if (!intent.repeat) tracks = uniqueMusic(tracks, intent.count);
        if (intent.liked || sourcePlaylists.length || referencePlaylists.length) throw Error("Combine history with a library restriction in a separate request for now.");
      } else {
        let candidates = [];
        let groups = [];
        const likedTracks = intent.liked ? await this.spotify.liked(200) : [];
        if (intent.liked && !intent.playlistNames.length && !intent.playlistUris.length) groups.push(likedTracks);
        if (sourcePlaylists.length) {
          const likedSet = new Set(likedTracks.map((t) => t.uri));
          for (const p of [...new Map(sourcePlaylists.map((p2) => [p2.uri, p2])).values()]) {
            const songs = playlistTracks.get(p.uri);
            groups.push(intent.liked ? songs.filter((t) => likedSet.has(t.uri)) : songs);
          }
        }
        const allowedSources = groups.length ? new Set(groups.flat().map((t) => t.uri)) : null;
        if (!intent.repeat || intent.playlistCount) groups = groups.map((g) => g.filter((t) => !excluded(t) && (!intent.playlistCount || !songKeys(t).some((key) => referenceSongs.has(key)))));
        if (groups.length) {
          candidates = intent.repeat ? balancedMix(groups, 200) : uniqueMusic(balancedMix(groups, 200));
          sourceSet = new Set(candidates.map((t) => t.uri));
          selection.kind = "sources";
        } else if (seeds.length || intent.more && this.previous.length) {
          const references2 = seeds.length ? seeds : tasteSeeds(this.previous);
          const artists = spread([...new Set(references2.map(primaryArtist))], 4);
          const perArtist = Math.max(20, Math.ceil(intent.count * 2 / artists.length));
          this.activity("Searching for similar music\u2026");
          const found = await Promise.all(artists.map((artist) => this.spotify.search(artist, perArtist)));
          check();
          candidates = uniqueMusic(balancedMix(found, 200).filter((t) => !excluded(t)));
        } else {
          const term = prompt.replace(/\b(something|songs?|tracks?|for|working|listening|add|another|start over|please|my|only)\b/gi, " ").replace(/\d+/g, " ").trim();
          candidates = await this.spotify.search(term || "mellow", Math.max(40, intent.count * 2));
        }
        if (!intent.repeat || intent.playlistCount) candidates = uniqueMusic(candidates.filter((t) => !excluded(t) && (!intent.playlistCount || !songKeys(t).some((key) => referenceSongs.has(key)))));
        if (intent.playlistCount) {
          const originals = uniqueMusic(balancedMix(includedGroups, 1200).filter((t) => !hardExcluded(t) && (!allowedSources || allowedSources.has(t.uri))));
          const pool = spread(originals, Math.min(75, Math.max(12, intent.playlistCount * 2)));
          for (const t of pool) originalUris.add(t.uri);
          candidates = [...pool, ...candidates.slice(0, 200 - pool.length)];
          if (sourceSet) sourceSet = new Set(candidates.map((t) => t.uri));
        }
        check();
        selection.candidates = candidates.length;
        retrievalMs = Math.round(performance.now() - start2);
        if (groups.length && !intent.filtered && !intent.playlistCount) {
          tracks = intent.repeat ? balancedMix(groups, intent.count, true) : uniqueMusic(balancedMix(groups, 200), intent.count);
        } else {
          const compact = candidates.map((t, i) => ({ ...t, id: "c" + i }));
          const reserve = sourceSet ? 0 : Math.min(25, Math.ceil(intent.count / 2));
          this.activity("Choosing matching songs\u2026");
          const request = { prompt: intent.prompt, count: intent.count, reserve, candidates: compact, restricted: !!sourceSet, previous: intent.more ? this.previous.slice(-10).map((t) => ({ title: t.title, artist: t.artist })) : [], seeds: seeds.map((t) => ({ title: t.title, artist: primaryArtist(t) })), playlistCount: intent.playlistCount, playlistIds: compact.filter((t) => originalUris.has(t.uri)).map((t) => t.id), structured: true };
          const response = await this.helper.request("generate", request, signal);
          generationMs = response.generationMs;
          const resolvingAt = performance.now();
          const acceptedUris = /* @__PURE__ */ new Set(), acceptedSongs = /* @__PURE__ */ new Set();
          const brief = selectionBrief(intent.prompt, intent.count, response.brief);
          finalBrief = brief;
          const balanceNamedArtist = !sourceSet && !seeds.length && !intent.playlistCount && brief.balance;
          const artistCounts = /* @__PURE__ */ new Map();
          let referenceCount = 0;
          const accept = (t, fromId = false) => {
            if (!t) {
              selection.unmatched++;
              return;
            }
            if (!allowedByBrief(t, brief)) return;
            const keys = songKeys(t);
            const original = intent.playlistCount > 0 && originalUris.has(t.uri);
            if (intent.playlistCount) {
              if (original && (!fromId || originalSelected >= intent.playlistCount)) return;
              if (!original && (keys.some((key) => referenceSongs.has(key)) || tracks.length - originalSelected >= intent.count - intent.playlistCount)) return;
            }
            if (!intent.repeat && (acceptedUris.has(t.uri) || keys.some((key) => acceptedSongs.has(key)))) {
              selection.duplicates++;
              return;
            }
            if (!intent.repeat && (original ? hardExcluded(t) : excluded(t))) {
              selection.previous++;
              return;
            }
            const artist = primaryArtist(t).normalize("NFKD").toLocaleLowerCase().replace(new RegExp("\\p{M}", "gu"), "");
            const reference = isReferenceArtist(t, brief);
            if (brief.explicitCount !== null && (reference ? referenceCount >= brief.referenceLimit : tracks.length - referenceCount >= intent.count - brief.explicitCount)) return;
            if (balanceNamedArtist && (reference ? referenceCount >= brief.referenceLimit : (artistCounts.get(artist) ?? 0) >= brief.artistLimit)) {
              selection.diversity = (selection.diversity ?? 0) + 1;
              return;
            }
            if (tracks.length < intent.count) {
              tracks.push(t);
              if (original) originalSelected++;
              acceptedUris.add(t.uri);
              for (const key of keys) acceptedSongs.add(key);
              artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
              if (reference) referenceCount++;
            }
          };
          const seenProposals = /* @__PURE__ */ new Set();
          const consume = async (answer, limit, allowIds = true) => {
            const suggestions = answer.suggestions ?? [];
            if (!Array.isArray(answer.ids) || !Array.isArray(suggestions) || answer.ids.length + suggestions.length > limit) throw Error("Selection exceeded the bounded selection limit.");
            if (!allowIds && answer.ids.length) throw Error("Invalid model track selection in refill.");
            selection.proposed += answer.ids.length + suggestions.length;
            selection.invalid += answer.rejectedSuggestions ?? 0;
            selection.truncated += answer.extraChoices ?? 0;
            if (sourceSet && suggestions.length) throw Error("Selection left the requested source. Nothing was queued.");
            const proposed = answer.ids.map((id) => {
              const index = compact.findIndex((c) => c.id === id);
              if (index < 0) throw Error("Invalid model track selection.");
              return candidates[index];
            });
            if (proposed.length) validateSelection(proposed, sourceSet, limit, true);
            for (const t of proposed) {
              if (tracks.length === intent.count) break;
              accept(t, true);
            }
            const suggestedKeys = /* @__PURE__ */ new Set();
            const pending = [];
            for (const song of suggestions) {
              const key = songKey(song);
              if (seenProposals.has(key)) {
                selection.duplicates++;
                continue;
              }
              if (!intent.repeat && (suggestedKeys.has(key) || acceptedSongs.has(key))) {
                selection.duplicates++;
                continue;
              }
              if (intent.playlistCount && referenceSongs.has(key) || !intent.repeat && excludedSongs.has(key)) {
                selection.previous++;
                continue;
              }
              suggestedKeys.add(key);
              pending.push(song);
            }
            for (let i = 0; i < pending.length && tracks.length < intent.count && (!intent.playlistCount || tracks.length - originalSelected < intent.count - intent.playlistCount); i += 10) {
              check();
              const resolved = await Promise.all(pending.slice(i, i + 10).map((song) => this.spotify.resolve(song.title, song.artist)));
              check();
              for (const t of resolved) {
                if (tracks.length === intent.count) break;
                accept(t);
              }
            }
            for (const song of suggestions) seenProposals.add(songKey(song));
          };
          await consume(response, intent.count + reserve);
          if (response.brief && canRefill(tracks.length, intent.count, selectingAt, !sourceSet && !intent.playlistCount)) {
            check();
            this.activity("Finding a few more matching songs\u2026");
            const missing = intent.count - tracks.length, extraReserve = Math.min(25, Math.ceil(missing / 2));
            const timeout = new AbortController();
            const cancel = () => timeout.abort();
            signal.addEventListener("abort", cancel, { once: true });
            const timer = setTimeout(() => timeout.abort(), 2e4);
            let refill;
            try {
              refill = await this.helper.request("generate", { ...request, candidates: [], previous: [], seeds: [], playlistIds: [], reserve: extraReserve, refillCount: missing, brief: response.brief, avoid: (response.suggestions ?? []).slice(0, 75), excludeIds: [] }, timeout.signal);
            } finally {
              clearTimeout(timer);
              signal.removeEventListener("abort", cancel);
            }
            check();
            const refillBrief = selectionBrief(intent.prompt, intent.count, refill.brief);
            if (JSON.stringify(refillBrief.music) !== JSON.stringify(brief.music)) throw Error("The refill changed the musical request. Nothing was queued.");
            generationMs += refill.generationMs;
            await consume(refill, missing + extraReserve, false);
          }
          if (groups.length > 1) {
            const selected = new Set(tracks.map((t) => t.uri));
            const mixed = balancedMix(groups.map((g) => g.filter((t) => selected.has(t.uri))), 200, intent.repeat);
            tracks = intent.repeat ? mixed.slice(0, intent.count) : uniqueMusic(mixed, intent.count);
          }
          resolutionMs = Math.round(performance.now() - resolvingAt);
        }
      }
      if (!sourceSet && !seeds.length && !intent.playlistCount && !intent.history) tracks = curateArtists(tracks, finalBrief ?? selectionBrief(intent.prompt, intent.count));
      if (seeds.length && !sourceSet) {
        const artists = /* @__PURE__ */ new Map();
        for (const track of tracks) {
          const artist = primaryArtist(track);
          const group = artists.get(artist) ?? [];
          group.push(track);
          artists.set(artist, group);
        }
        tracks = balancedMix([...artists.values()], intent.count, intent.repeat);
      }
      if (intent.playlistCount) {
        const originals = tracks.filter((t) => originalUris.has(t.uri)), discoveries = tracks.filter((t) => !originalUris.has(t.uri));
        const mixed = [];
        let at = 0;
        if (!discoveries.length) throw Error("No matching discoveries were found for the mix. Nothing was queued. Try a broader request.");
        for (let i = 0; i < discoveries.length; i++) {
          mixed.push(discoveries[i]);
          while (at < originals.length && Math.floor((i + 1) * originals.length / discoveries.length) > at) mixed.push(originals[at++]);
        }
        tracks = [...mixed, ...originals.slice(at)];
      }
      check();
      validateSelection(tracks, sourceSet, intent.count, intent.repeat);
      if (intent.history) retrievalMs = Math.round(performance.now() - start2);
      const validatingAt = performance.now();
      this.activity("Checking songs\u2026");
      tracks = await this.spotify.validate(tracks);
      check();
      if (await this.spotify.account() !== account) throw Error("Spotify account changed during selection. Try again.");
      if (sourceSet) {
        let fresh = /* @__PURE__ */ new Set();
        const playlists = usedSources.playlists;
        for (const source of playlists) {
          for (const t of await this.spotify.playlist(source, 200)) fresh.add(t.uri);
        }
        if (intent.liked) {
          const likes = new Set((await this.spotify.liked(200)).map((t) => t.uri));
          fresh = playlists.length ? new Set([...fresh].filter((uri) => likes.has(uri))) : likes;
        }
        validateSelection(tracks, fresh, intent.count, intent.repeat);
      }
      if (intent.playlistCount) {
        const originals = tracks.filter((t) => originalUris.has(t.uri));
        const fresh = /* @__PURE__ */ new Set();
        for (const p of includedPlaylists) {
          check();
          for (const t of await this.spotify.playlist(p.uri, 200)) fresh.add(t.uri);
        }
        if (originals.length) validateSelection(originals, fresh, intent.playlistCount, intent.repeat);
        originalSelected = originals.length;
        coverage = `Mixed ${originalSelected} playlist ${originalSelected === 1 ? "song" : "songs"} with ${tracks.length - originalSelected} similar discoveries. Reference retrieval is limited to the first 200 songs per playlist.`;
      }
      if (await this.spotify.account() !== account) throw Error("Spotify account changed during selection. Try again.");
      const validationMs = Math.round(performance.now() - validatingAt);
      check();
      this.mutation = true;
      this.activity("Updating Spotify\u2019s queue\u2026", true);
      try {
        const result = await this.writer.commit(tracks, intent.mode, initial);
        this.previous = tracks;
        this.previousReferences = sourceSet ? [] : references;
        this.previousSources = usedSources;
        const blend = intent.playlistCount ? { requested: intent.playlistCount, included: originalSelected, discovered: tracks.length - originalSelected } : null;
        let shortfall = shortfallReason(result.count, intent.count, selection);
        if (blend && originalSelected < intent.playlistCount) shortfall += ` Only ${originalSelected} of ${intent.playlistCount} requested playlist songs were selected.`;
        return { ...result, requested: intent.count, generationMs, totalMs: Math.round(performance.now() - start2), timings: { retrievalMs, resolutionMs, validationMs }, coverage, mode: intent.mode, selection, blend, shortfall: shortfall.trim() };
      } finally {
        this.mutation = false;
        if (this.generation === abort) this.generation = void 0;
      }
    }
    cancel() {
      if (!this.mutation) this.generation?.abort();
    }
  };

  // src/placement.ts
  var SEARCH2 = 'input[data-testid="search-input"][data-top-bar-search="true"]';
  var BROWSE = '[data-testid="browse-button"]';
  var NATIVE_QUEUE = 'button[data-testid="control-button-queue"]';
  var QueuePlacement = class {
    constructor(host2, focus, hidden, notify) {
      this.host = host2;
      this.focus = focus;
      this.hidden = hidden;
      this.notify = notify;
    }
    shortcut;
    shortcutStyle;
    search;
    restorers = [];
    observer;
    scheduled = false;
    disposed = false;
    focusPending = false;
    openTimer;
    start() {
      this.update();
      this.observer = new MutationObserver(() => {
        if (this.scheduled || this.disposed) return;
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          if (!this.disposed) this.update();
        });
      });
      this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-pressed"] });
    }
    reserve(element2, property, amount) {
      const base = parseFloat(getComputedStyle(element2).getPropertyValue(property)) || 0;
      this.ownStyle(element2, property, `${base + amount}px`);
    }
    ownStyle(element2, property, owned) {
      const old = element2.style.getPropertyValue(property), priority = element2.style.getPropertyPriority(property);
      element2.style.setProperty(property, owned);
      this.restorers.push(() => {
        if (element2.style.getPropertyValue(property) === owned) {
          if (old) element2.style.setProperty(property, old, priority);
          else element2.style.removeProperty(property);
        }
      });
    }
    removeShortcut() {
      this.shortcut?.remove();
      this.shortcutStyle?.remove();
      this.restorers.splice(0).forEach((restore) => restore());
      this.shortcut = void 0;
      this.shortcutStyle = void 0;
      this.search = void 0;
    }
    mountShortcut() {
      const search = document.querySelector(SEARCH2);
      const form = search?.closest("form");
      const browse = form?.querySelector(BROWSE);
      const wrapper = browse?.parentElement;
      const trailing = wrapper?.parentElement;
      if (!search || !form || !browse || !wrapper || !trailing) {
        this.removeShortcut();
        return;
      }
      if (this.search === search && this.shortcut?.isConnected && this.shortcut.parentElement === trailing && this.shortcut.nextElementSibling === wrapper) return;
      this.removeShortcut();
      this.search = search;
      const button = document.createElement("button");
      button.id = "queue-companion-shortcut";
      button.type = "button";
      button.className = browse.className;
      button.title = "Open Queue Companion";
      button.setAttribute("aria-label", "Open Queue Companion");
      button.setAttribute("aria-controls", this.host.id);
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h16M3 10h16M3 15h9M16 15l5 3-5 3z"/></svg>';
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      };
      button.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && e.repeat) e.preventDefault();
      };
      button.onkeyup = (e) => e.stopPropagation();
      this.shortcutStyle = document.createElement("style");
      this.shortcutStyle.id = "queue-companion-shortcut-style";
      this.shortcutStyle.textContent = "#queue-companion-shortcut{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;padding:4px;margin:0;border:0;background:transparent;border-radius:50%;cursor:pointer;color:var(--text-subdued,#b3b3b3)}#queue-companion-shortcut:hover{color:var(--text-base,#fff)}#queue-companion-shortcut[aria-expanded=true]{color:var(--text-positive,#1ed760)}#queue-companion-shortcut:focus-visible{outline:2px solid var(--text-base,#fff);outline-offset:2px}#queue-companion-shortcut:disabled{opacity:.5;cursor:default}";
      document.head.append(this.shortcutStyle);
      trailing.insertBefore(button, wrapper);
      this.shortcut = button;
      this.ownStyle(trailing, "align-items", "center");
      this.reserve(search, "padding-right", 40);
      const overlay = Array.from(search.parentElement.children).find((e) => e.querySelector("kbd"));
      if (overlay instanceof HTMLElement) this.reserve(overlay, "padding-right", 40);
    }
    queueTarget() {
      if (document.querySelector(NATIVE_QUEUE)?.getAttribute("aria-pressed") !== "true") return;
      const tab = document.querySelector('#queue-tab[role="tab"][aria-controls="queue-panel"]');
      const panel = document.getElementById("queue-panel");
      if (!tab || !panel || tab.getAttribute("aria-selected") !== "true" || panel.hidden) return;
      const aside = tab.closest("aside");
      if (!aside || !aside.contains(panel)) return;
      let before = panel, parent = before.parentElement;
      while (parent && parent !== aside) {
        if (parent.contains(tab)) return { parent, before };
        before = parent;
        parent = parent.parentElement;
      }
    }
    update() {
      this.mountShortcut();
      const target = this.queueTarget();
      if (target) {
        if (this.host.parentElement !== target.parent || this.host.nextElementSibling !== target.before) target.parent.insertBefore(this.host, target.before);
      } else if (this.host.parentElement) {
        this.hidden();
        this.host.remove();
      }
      const source = this.search ?? document.querySelector(NATIVE_QUEUE);
      if (source) {
        const s = getComputedStyle(source);
        const properties = { "--qc-font": s.fontFamily, "--qc-text": s.color, "--qc-bg": "var(--background-elevated-base, #282828)", "--qc-muted": "var(--text-subdued, #b3b3b3)", "--qc-border": "var(--background-tinted-highlight, #404040)" };
        for (const [key, value] of Object.entries(properties)) if (this.host.style.getPropertyValue(key) !== value) this.host.style.setProperty(key, value);
      }
      this.shortcut?.setAttribute("aria-expanded", String(!!target));
      if (target && this.focusPending) {
        this.focusPending = false;
        clearTimeout(this.openTimer);
        this.focus();
      }
    }
    open() {
      if (this.disposed) return;
      this.update();
      if (this.queueTarget()) {
        this.focus();
        return;
      }
      if (this.focusPending) return;
      const queue = document.querySelector(NATIVE_QUEUE);
      if (!queue || queue.disabled) {
        this.notify("Start a song on this computer to open Spotify\u2019s Queue.");
        return;
      }
      this.focusPending = true;
      this.openTimer = window.setTimeout(() => {
        if (!this.focusPending) return;
        this.focusPending = false;
        this.notify("Spotify\u2019s Queue did not open. Try its Queue button beside the playback controls.");
      }, 3e3);
      const tab = document.querySelector('#queue-tab[role="tab"][aria-controls="queue-panel"]');
      if (queue.getAttribute("aria-pressed") !== "true") queue.click();
      else if (tab) tab.click();
      this.update();
    }
    dispose() {
      this.disposed = true;
      this.observer?.disconnect();
      clearTimeout(this.openTimer);
      this.focusPending = false;
      this.hidden();
      this.host.remove();
      this.removeShortcut();
    }
  };

  // src/index.ts
  window.__queueCompanion?.dispose();
  var lifecycle = new AbortController();
  var helper = new Helper();
  var spotify = new Spotify(helper);
  var preferences = { length: 15, cap: 50, mode: "append", history: true };
  var host;
  var root;
  var placement;
  var input;
  var feedback;
  var submit;
  var popover;
  var feedbackTimer;
  var authTimer;
  var settingsEpoch = 0;
  var historyDispose;
  var epoch = 0;
  var disposing = false;
  var lastPrompt = "";
  var lastSuccessPrompt = "";
  var lastSuccessAt = 0;
  var status;
  var journalKey = () => `queue-companion-write:${Spicetify.Platform.username}`;
  var writer = new QueueWriter(spotify, (x) => localStorage.setItem(journalKey(), JSON.stringify(x)));
  function message(text, error = false, retry = false) {
    if (!feedback) return;
    clearTimeout(feedbackTimer);
    feedback.replaceChildren();
    feedback.append(document.createTextNode(text));
    feedback.dataset.error = String(error);
    if (retry && !writer.blocked) {
      const b = document.createElement("button");
      b.textContent = "Retry";
      b.type = "button";
      b.onclick = () => void run(lastPrompt);
      feedback.append(b);
    }
    if (!error) feedbackTimer = window.setTimeout(() => feedback.replaceChildren(), 5e3);
  }
  async function choose(name, choices, signal) {
    return new Promise((resolve, reject) => {
      clearTimeout(feedbackTimer);
      feedback.replaceChildren();
      const title = document.createElement("span");
      title.textContent = `Choose \u201C${name}\u201D: `;
      feedback.append(title);
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Choose playlist ${name}`);
      const placeholder = document.createElement("option");
      placeholder.textContent = "Select playlist";
      placeholder.value = "";
      select.append(placeholder);
      for (const p of choices) {
        const option = document.createElement("option");
        option.value = p.uri;
        option.textContent = p.name + (p.owner ? " \u2014 " + p.owner : "") + " \xB7 " + p.uri.slice(-6);
        select.append(option);
      }
      feedback.append(select);
      select.focus();
      const abort = () => {
        feedback.replaceChildren();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      select.onchange = () => {
        const p = choices.find((c) => c.uri === select.value);
        if (p) {
          signal.removeEventListener("abort", abort);
          feedback.replaceChildren();
          resolve(p);
          input.focus();
        }
      };
    });
  }
  var pipeline = new Pipeline(spotify, helper, writer, choose, (text, writing) => {
    if (writing) submit.disabled = true;
    message(text);
  });
  async function refreshSettings() {
    const account = await spotify.account();
    status = await helper.request("status", { account });
    preferences = status.settings;
    return status;
  }
  async function reconcile() {
    const raw = localStorage.getItem(journalKey());
    if (!raw) return;
    try {
      const j = JSON.parse(raw);
      if (j.state === "writing" || j.state === "uncertain") {
        await spotify.snapshot();
        message("A previous queue write was interrupted. Inspect Spotify\u2019s Queue before submitting another request.", true);
        const b = document.createElement("button");
        b.textContent = "I checked the Queue";
        b.onclick = () => {
          localStorage.removeItem(journalKey());
          writer.acknowledge();
          submit.disabled = false;
          feedback.replaceChildren();
          input.focus();
        };
        feedback.append(b);
        submit.disabled = true;
      }
    } catch {
      message("The saved queue receipt could not be read. Inspect Spotify\u2019s Queue, then repair Queue Companion.", true);
      submit.disabled = true;
    }
  }
  async function run(prompt) {
    if (submit.disabled) return;
    if (submit.dataset.busy === "true" && prompt.trim() === lastPrompt.trim() || prompt.trim() === lastSuccessPrompt && performance.now() - lastSuccessAt < 1500) return;
    pipeline.cancel();
    const call = ++epoch;
    lastPrompt = prompt;
    submit.dataset.busy = "true";
    submit.textContent = "\u2026";
    submit.setAttribute("aria-label", "Selecting songs");
    try {
      await refreshSettings();
      const result = await pipeline.run(prompt, preferences);
      if (call !== epoch) return;
      const amount = `${result.count}${result.count < result.requested ? " of " + result.requested : ""} ${result.count === 1 ? "song" : "songs"}`;
      message((result.mode === "replace" ? "Updated your queue" + (result.count < result.requested ? " \xB7 " + amount : ".") : "Added " + amount) + (result.shortfall ? " \xB7 " + result.shortfall : "") + (result.coverage ? " \xB7 " + result.coverage : ""));
      window.__queueCompanion.lastResult = result;
      lastSuccessPrompt = prompt.trim();
      lastSuccessAt = performance.now();
    } catch (e) {
      if (call !== epoch || e instanceof DOMException && e.name === "AbortError") return;
      message(e instanceof Error ? e.message : "Selection failed. Try again.", true, true);
    } finally {
      if (call === epoch) {
        submit.disabled = writer.blocked;
        submit.dataset.busy = "false";
        submit.textContent = "\u21B5";
        submit.setAttribute("aria-label", "Add songs");
      }
    }
  }
  function element(tag, text) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  }
  function closeSettings() {
    settingsEpoch++;
    clearTimeout(authTimer);
    popover.querySelectorAll("input[type=password]").forEach((key) => key.value = "");
    popover.hidden = true;
  }
  async function showSettings() {
    if (!popover.hidden) {
      closeSettings();
      input.focus();
      return;
    }
    const settingsCall = ++settingsEpoch;
    pipeline.cancel();
    popover.hidden = false;
    popover.replaceChildren(element("p", "Connecting to helper\u2026"));
    try {
      const s = await refreshSettings();
      if (popover.hidden || settingsCall !== settingsEpoch) return;
      popover.replaceChildren();
      const title = element("strong", "Queue Companion");
      popover.append(title);
      const provider = element("select");
      provider.setAttribute("aria-label", "Music selection provider");
      for (const [value, name] of [["claude", "Claude API"], ["chatgpt", "ChatGPT"]]) {
        const option = element("option", name);
        option.value = value;
        provider.append(option);
      }
      provider.value = preferences.provider ?? "claude";
      const providerLabel = element("label", "Provider ");
      providerLabel.append(provider);
      popover.append(providerLabel);
      const connection = element("div");
      popover.append(connection);
      const label = element("label", "Default songs ");
      const length = element("input");
      length.type = "number";
      length.min = "1";
      length.max = "50";
      length.value = String(preferences.length);
      label.append(length);
      popover.append(label);
      const capLabel = element("label", "Maximum songs ");
      const cap = element("input");
      cap.type = "number";
      cap.min = "1";
      cap.max = "50";
      cap.value = String(preferences.cap);
      capLabel.append(cap);
      popover.append(capLabel);
      const modeLabel = element("label", "Queue preference ");
      const mode = element("select");
      for (const value of ["append", "replace"]) {
        const option = element("option", value === "append" ? "Append" : "Replace manually queued songs");
        option.value = value;
        option.disabled = value === "replace" && !spotify.replaceSupported();
        mode.append(option);
      }
      mode.value = preferences.mode;
      modeLabel.append(mode);
      popover.append(modeLabel);
      const historyLabel = element("label", "Count meaningful listening locally ");
      const history = element("input");
      history.type = "checkbox";
      history.checked = preferences.history;
      historyLabel.append(history);
      popover.append(historyLabel);
      let model;
      let connectionEpoch = 0;
      const reopen = async () => {
        if (!popover.hidden && settingsCall === settingsEpoch) {
          closeSettings();
          await showSettings();
        }
      };
      const renderConnection = async () => {
        clearTimeout(authTimer);
        const call = ++connectionEpoch, chosen = provider.value;
        model = void 0;
        connection.replaceChildren();
        const error = element("p");
        if (chosen === "claude") {
          connection.append(element("p", s.claude.connected ? "Claude API connected" : "Connect an Anthropic API key to select by mood."));
          connection.append(element("p", s.claude.billing));
          if (s.claude.lastUsage) {
            const u = s.claude.lastUsage;
            connection.append(element("p", `Last selection: ${u.inputTokens} input / ${u.outputTokens} output tokens.`));
          }
          const key = element("input");
          key.type = "password";
          key.autocomplete = "off";
          key.spellcheck = false;
          key.maxLength = 512;
          key.placeholder = "Anthropic API key";
          key.setAttribute("aria-label", "Anthropic API key");
          const keyLabel = element("label", "API key ");
          keyLabel.append(key);
          connection.append(keyLabel);
          const connect = element("button", s.claude.connected ? "Replace API key" : "Connect Claude");
          connect.type = "button";
          connect.onclick = async () => {
            const apiKey = key.value;
            key.value = "";
            connect.disabled = true;
            try {
              await helper.request("claude.connect", { apiKey });
              preferences = await helper.request("settings", { ...preferences, provider: "claude", claudeModel: null });
              message("Claude API connected.");
              await reopen();
            } catch (e) {
              error.textContent = e.message;
            } finally {
              connect.disabled = false;
            }
          };
          connection.append(connect);
          if (s.claude.connected) {
            const remove = element("button", "Remove API key");
            remove.type = "button";
            remove.onclick = async () => {
              try {
                await helper.request("claude.disconnect");
                message("API key removed here. Revoke it in Claude Console if needed.");
                await reopen();
              } catch (e) {
                error.textContent = e.message;
              }
            };
            connection.append(remove);
          }
        } else {
          connection.append(element("p", s.auth.connected ? `ChatGPT connected \xB7 ${s.auth.email}` : "Connect ChatGPT to select by mood. Eligible plans and quota apply."));
          if (s.auth.error) connection.append(element("p", s.auth.error));
          const connect = element("button", s.auth.connected ? "Reconnect ChatGPT" : "Continue with ChatGPT");
          connect.type = "button";
          connect.onclick = async () => {
            try {
              await helper.request("connect", {});
              message("Finish ChatGPT sign-in in your browser.");
              let attempts = 0;
              const check = async () => {
                try {
                  const status2 = await refreshSettings();
                  if (!status2.auth.pending) {
                    await reopen();
                    return;
                  }
                  if (++attempts < 80 && !popover.hidden && provider.value === "chatgpt") authTimer = window.setTimeout(check, 1500);
                } catch {
                }
              };
              authTimer = window.setTimeout(check, 1500);
            } catch (e) {
              error.textContent = e.message;
            }
          };
          connection.append(connect);
          if (s.auth.connected) {
            const disconnect = element("button", "Disconnect ChatGPT");
            disconnect.type = "button";
            disconnect.onclick = async () => {
              try {
                await helper.request("disconnect");
                await reopen();
              } catch (e) {
                error.textContent = e.message;
              }
            };
            connection.append(disconnect);
          }
          connection.append(element("p", "ChatGPT plan usage applies. Exact remaining quota is unavailable."));
        }
        connection.append(error);
        if (chosen === "claude" ? s.claude.connected : s.auth.connected && s.auth.planUsage) {
          try {
            const choices = await helper.request("models", { provider: chosen });
            if (call !== connectionEpoch || popover.hidden || settingsCall !== settingsEpoch) return;
            model = element("select");
            model.setAttribute("aria-label", chosen === "claude" ? "Claude model" : "ChatGPT model");
            const auto = element("option", "Automatic \xB7 fast available model");
            auto.value = "";
            model.append(auto);
            for (const m of choices) {
              const option = element("option", m.displayName);
              option.value = m.slug;
              model.append(option);
            }
            model.value = (chosen === "claude" ? preferences.claudeModel : preferences.model) ?? "";
            const modelLabel = element("label", "Model ");
            modelLabel.append(model);
            connection.append(modelLabel);
          } catch (e) {
            if (call === connectionEpoch && settingsCall === settingsEpoch) error.textContent = e.message;
          }
        }
      };
      provider.onchange = () => void renderConnection();
      await renderConnection();
      if (settingsCall !== settingsEpoch || popover.hidden) return;
      popover.append(element("p", `${s.history.coverage}. ${s.history.meaningfulPlays} meaningful plays. ${s.history.threshold}`));
      const save = element("button", "Save");
      save.type = "button";
      save.onclick = async () => {
        try {
          preferences = await helper.request("settings", { length: Number(length.value), cap: Number(cap.value), mode: mode.value, history: history.checked, provider: provider.value, model: provider.value === "chatgpt" ? model?.value || null : preferences.model ?? null, claudeModel: provider.value === "claude" ? model?.value || null : preferences.claudeModel ?? null });
          closeSettings();
          message("Settings saved.");
          input.focus();
        } catch (e) {
          message(e.message, true);
        }
      };
      popover.append(save);
      const erase = element("button", "Clear local listening counts");
      erase.type = "button";
      erase.onclick = async () => {
        try {
          await helper.request("history.clear", { account: await spotify.account() });
          closeSettings();
          message("Local listening counts cleared.");
        } catch (e) {
          message(e.message, true);
        }
      };
      popover.append(erase);
    } catch (e) {
      if (settingsCall !== settingsEpoch || popover.hidden) return;
      popover.replaceChildren(element("p", e.message));
      const reconnect = element("a", "Start helper");
      reconnect.href = "queue-companion://start";
      popover.append(reconnect);
      const repair = element("a", "Repair installation");
      repair.href = "queue-companion://repair";
      popover.append(repair);
    }
  }
  function createUI() {
    if (!host) {
      host = element("div");
      host.id = "queue-companion";
      Object.assign(host.style, { display: "block", flex: "0 0 auto", minWidth: "0", padding: "0 16px 12px", boxSizing: "border-box" });
      root = host.attachShadow({ mode: "open" });
      const style = element("style");
      style.textContent = `
      :host{display:block;flex:0 0 auto;min-width:0;padding:0 16px 12px;color:var(--qc-text,#fff);font-family:var(--qc-font, sans-serif);font-size:16px;line-height:1.4}
      *{box-sizing:border-box} [hidden]{display:none!important} form{height:44px;display:flex;align-items:center;background:var(--qc-bg);border:1px solid var(--qc-border);border-radius:24px;padding:0 6px 0 12px;gap:6px}.queue-icon{flex:0 0 16px;color:var(--qc-muted)} form button{width:32px;height:32px;flex:0 0 32px;padding:3px}
      form:focus-within{outline:2px solid var(--qc-text);outline-offset:1px} input,button,select,a{font:inherit;color:inherit} input[type=text]{background:transparent;border:0;outline:0;min-width:0;flex:1;padding:0;height:42px} input::placeholder{color:var(--qc-muted)}
      button{border:0;border-radius:12px;background:transparent;cursor:pointer;padding:3px 7px;white-space:nowrap} button:hover,a:hover{background:var(--qc-border)} button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--qc-text)} button:disabled{opacity:.5;cursor:default}
      button[data-busy=true]{animation:pulse 1s ease-in-out infinite} @keyframes pulse{50%{opacity:.35}} @media(prefers-reduced-motion:reduce){button[data-busy=true]{animation:none}}
      .feedback:empty{display:none}.feedback{font-size:12px;margin-top:8px;max-height:96px;overflow:auto;overflow-wrap:anywhere;background:var(--qc-bg);border-radius:8px;padding:8px 10px}.feedback[data-error=true]{border:1px solid var(--qc-muted)}
      .popover{font-size:12px;margin-top:8px;width:100%;max-height:min(40vh,max(80px,calc(100vh - 380px)));overflow:auto;overflow-wrap:anywhere;background:var(--qc-bg);padding:14px;border-radius:8px;border:1px solid var(--qc-border)}.popover p{margin:8px 0;color:var(--qc-muted)}.popover label{display:flex;justify-content:space-between;align-items:center;margin:10px 0;gap:8px}.popover input[type=number]{width:55px}.popover input[type=password]{width:200px;min-width:0;max-width:65%}.popover select{min-width:0;max-width:65%}select,input[type=number],input[type=password]{background:var(--qc-bg);border:1px solid var(--qc-muted);border-radius:4px;padding:3px}.popover a{display:inline-block;margin:6px;padding:4px}
    `;
      root.append(style);
      const form = element("form");
      form.setAttribute("aria-label", "Queue Companion");
      input = element("input");
      input.type = "text";
      input.maxLength = 1e3;
      input.autocomplete = "off";
      input.placeholder = "What do you feel like listening to?";
      input.setAttribute("aria-label", input.placeholder);
      input.setAttribute("aria-describedby", "feedback");
      submit = element("button", "\u21B5");
      submit.type = "submit";
      submit.setAttribute("aria-label", "Add songs");
      const settings = element("button", "\u2699");
      settings.type = "button";
      settings.setAttribute("aria-label", "Queue Companion settings");
      settings.setAttribute("aria-haspopup", "dialog");
      settings.onclick = () => void showSettings();
      const icon = element("span");
      icon.className = "queue-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h16M3 10h16M3 15h9M16 15l5 3-5 3z"/></svg>';
      form.append(icon, input, submit, settings);
      form.onsubmit = (e) => {
        e.preventDefault();
        void run(input.value);
      };
      form.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && e.repeat) {
          e.preventDefault();
          return;
        }
        if (e.key === "Escape") {
          pipeline.cancel();
          closeSettings();
          input.focus();
        }
      };
      feedback = element("div");
      feedback.id = "feedback";
      feedback.className = "feedback";
      feedback.setAttribute("role", "status");
      feedback.setAttribute("aria-live", "polite");
      popover = element("div");
      popover.className = "popover";
      popover.hidden = true;
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", "Queue Companion settings");
      popover.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          closeSettings();
          input.focus();
        }
      };
      root.append(form, feedback, popover);
    }
    placement = new QueuePlacement(host, () => input.focus(), closeSettings, (text) => Spicetify.showNotification?.(text, true));
    placement.start();
  }
  function dispose() {
    if (popover) closeSettings();
    disposing = true;
    lifecycle.abort();
    placement?.dispose();
    clearTimeout(feedbackTimer);
    clearTimeout(authTimer);
    pipeline.cancel();
    historyDispose?.();
    helper.dispose();
    host?.remove();
  }
  window.__queueCompanion = { dispose, run: (prompt) => run(prompt), snapshot: () => spotify.snapshot(), status: () => refreshSettings(), history: () => helper.request("history", { account: Spicetify.Platform.username, count: 15, days: 30 }) };
  async function start() {
    for (let i = 0; i < 120; i++) {
      if (disposing) return;
      if (globalThis.Spicetify?.Platform?.PlayerAPI && Spicetify.Queue && Spicetify.GraphQL?.Definitions?.getTrack && Spicetify.Platform.ConnectAPI) break;
      if (i === 119) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    createUI();
    window.addEventListener("beforeunload", dispose, { once: true, signal: lifecycle.signal });
    historyDispose = spotify.startHistory();
    try {
      await refreshSettings();
      await reconcile();
    } catch {
    }
  }
  void start();
})();
