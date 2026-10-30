// tests/demo-sources.test.js — the demo sources (30 Oct 2026): the eBay
// category lanes, the iTunes song previews, the Ticketmaster events on the
// map, the Pexels licensed motions. Every seam is proven OFF (honest, the
// samples unchanged) and ON (against a recorded response shape, no network),
// and the one that widens an existing path — the eBay lanes — is pinned
// where the old code would still answer "fashion" and "tops".
import test from "node:test";
import assert from "node:assert/strict";
import { loadRoute, callRoute } from "./helpers/route.js";

const ENV = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_PARTNERSHIP_APPROVED", "EBAY_ENV", "ITUNES_SEARCH_ENABLED", "TICKETMASTER_API_KEY", "TICKETMASTER_COUNTRY", "PEXELS_API_KEY", "PEXELS_QUERIES"];
function withEnv(patch, fn) {
  const was = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, patch);
  const restore = () => { for (const k of ENV) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; } };
  try { const out = fn(); if (out && typeof out.then === "function") return out.finally(restore); restore(); return out; }
  catch (e) { restore(); throw e; }
}
function withFetch(impl, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => { const url = String(input); calls.push(url); return impl(url, init, calls); };
  const restore = () => { globalThis.fetch = original; };
  return Promise.resolve().then(() => fn(calls)).finally(restore);
}
const json = (body, status = 200) => Response.json(body, { status });

// ---- eBay lanes ---------------------------------------------------------------

test("eBay: the lanes name eBay's top-level categories, the URL asks for the lane, 'all' asks for none, an unknown lane throws", async () => {
  const { EBAY_CATEGORIES, EBAY_DEMO_LANES, CATALOG_CATEGORIES, browseSearchUrl, ebayCategoryIds } = await import("../lib/ingest/ebay.js");
  assert.deepEqual(Object.keys(EBAY_CATEGORIES), ["fashion", "jewelry", "home", "collectibles", "antiques", "art"]);
  await withEnv({ EBAY_ENV: "PRODUCTION" }, () => {
    assert.match(browseSearchUrl("rug", { category: "home" }), /category_ids=11700$/);
    assert.match(browseSearchUrl("ring", { category: "jewelry" }), /category_ids=281$/);
    assert.match(browseSearchUrl("coat"), /category_ids=11450$/, "the default is the lane the catalog always searched");
    assert.doesNotMatch(browseSearchUrl("x", { category: "all" }), /category_ids/);
    assert.match(browseSearchUrl("x", { category: "20081" }), /category_ids=20081$/, "a raw id passes");
    assert.throws(() => browseSearchUrl("x", { category: "furniture-shop" }), /unknown eBay category lane/);
  });
  assert.equal(ebayCategoryIds("nope"), null);
  for (const lane of EBAY_DEMO_LANES) {
    assert.ok(EBAY_CATEGORIES[lane.category], lane.query + " names a real lane");
    if (lane.hint) assert.ok(CATALOG_CATEGORIES.includes(lane.hint), lane.query + " hints a catalog category");
  }
  const cats = new Set(EBAY_DEMO_LANES.map((l) => l.category));
  for (const c of ["fashion", "jewelry", "home", "collectibles"]) assert.ok(cats.has(c), "the sweep covers " + c);
});

test("eBay: a chair is furniture, a rug a rug, a Rolex a watch, a figurine an object, a necklace jewelry; a bare title takes the lane's hint, else stays a top", async () => {
  const { guessCategory } = await import("../lib/ingest/ebay.js");
  assert.equal(guessCategory("Eames lounge chair rosewood"), "furniture");
  assert.equal(guessCategory("Hand knotted Persian rug 6x9"), "rugs");
  assert.equal(guessCategory("Rolex Submariner 1990"), "watches");
  assert.equal(guessCategory("Lladro porcelain figurine"), "objects");
  assert.equal(guessCategory("Murano glass vase"), "objects");
  assert.equal(guessCategory("Sterling silver chain necklace"), "jewelry");
  assert.equal(guessCategory("Nike Dunk Low", "footwear"), "footwear");
  assert.equal(guessCategory("Nike Dunk Low"), "tops", "no hint: the guess the catalog always made");
  assert.equal(guessCategory("Vintage bomber jacket", "objects"), "outerwear", "a garment word beats the hint");
});

test("eBay: the normalizer keeps a source's own catalog category for a bare title (the sneaker lane's listing is footwear, not a top)", async () => {
  const { normalizeSourceProduct } = await import("../lib/ingest/adapters/normalize.js");
  const shoe = normalizeSourceProduct({ id: "ebay-1", title: "Nike Dunk Low Panda 10.5", category: "footwear", source_product_id: "1" }, "ebay");
  assert.equal(shoe.category, "footwear");
  const chair = normalizeSourceProduct({ id: "ebay-2", title: "Cesca B32 cane seat", category: "furniture", source_product_id: "2" }, "ebay");
  assert.equal(chair.category, "furniture");
  const loose = normalizeSourceProduct({ id: "ebay-3", title: "Nike Dunk Low Panda 10.5", category: "Men's Shoes", source_product_id: "3" }, "ebay");
  assert.equal(loose.category, "footwear", "a merchant's category text is still a word for the guess");
});

test("eBay: the demo sweep asks every lane with its own category, de-duplicates, and carries the lane's hint into the category", async () => {
  const { ebayAdapter } = await import("../lib/ingest/adapters/ebayAdapter.js");
  const { EBAY_DEMO_LANES } = await import("../lib/ingest/ebay.js");
  await withEnv({ EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "s", EBAY_PARTNERSHIP_APPROVED: "1", EBAY_ENV: "PRODUCTION" }, () =>
    withFetch(async (url) => {
      if (/oauth2\/token/.test(url)) return json({ access_token: "tok-demo-sources", expires_in: 7200 });
      const u = new URL(url);
      const cat = u.searchParams.get("category_ids");
      // one listing per lane whose title names nothing, plus one shared listing in every lane
      return json({ itemSummaries: [
        { itemId: "v1|shared|0", title: "Untitled lot", price: { value: "10", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/1" },
        { itemId: "v1|" + cat + "|" + u.searchParams.get("q").length, title: "Lot " + cat, price: { value: "20", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/2" },
      ] });
    }, async (calls) => {
      const run = await ebayAdapter.syncProducts({ limit: 5 });
      const searches = calls.filter((c) => /item_summary\/search/.test(c)).map((c) => new URL(c));
      assert.equal(searches.length, EBAY_DEMO_LANES.length, "one search per lane");
      assert.deepEqual(searches.map((u) => u.searchParams.get("category_ids")), EBAY_DEMO_LANES.map((l) => ({ fashion: "11450", jewelry: "281", home: "11700", collectibles: "1", antiques: "20081", art: "550" })[l.category]));
      assert.ok(searches.every((u) => u.searchParams.get("limit") === "5"));
      assert.equal(run.status, "fetched");
      assert.equal(run.lanes.length, EBAY_DEMO_LANES.length);
      const ids = run.products.map((p) => p.id);
      assert.equal(new Set(ids).size, ids.length, "no listing twice");
      assert.equal(run.products.filter((p) => p.title === "Untitled lot").length, 1, "the shared listing once");
      const cats = new Set(run.products.map((p) => p.category));
      for (const c of ["footwear", "watches", "jewelry", "furniture", "rugs", "objects"]) assert.ok(cats.has(c), "a bare title in the lane became " + c);
    }));
});

test("eBay: /api/ebay refuses an unknown lane with the lanes it knows, before any key check", async () => {
  const { GET } = await loadRoute("app/api/ebay/route.js");
  const res = await withEnv({}, () => GET(new Request("http://localhost/api/ebay?q=rug&cat=garden")));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body.lanes, ["fashion", "jewelry", "home", "collectibles", "antiques", "art", "all"]);
});

// ---- iTunes song previews ------------------------------------------------------

const TRACK = { wrapperType: "track", trackId: 1, trackName: "Live Forever", artistName: "Oasis", collectionName: "Definitely Maybe", releaseDate: "1994-08-29T07:00:00Z", artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg", previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a", trackViewUrl: "https://music.apple.com/us/album/live-forever/1?i=1", trackTimeMillis: 276000, trackExplicitness: "notExplicit" };

test("iTunes: a track normalizes to the SONG record with the sleeve at 600px and the store link; no preview, no record", async () => {
  const { normalizeItunesTrack, pickMatch } = await import("../lib/music/itunes.js");
  const s = normalizeItunesTrack(TRACK);
  assert.equal(s.id, "itunes-1");
  assert.equal(s.sample, false);
  assert.equal(s.year, 1994);
  assert.match(s.art, /600x600bb\.jpg$/);
  assert.equal(s.previewUrl, TRACK.previewUrl);
  assert.equal(s.previewMs, 30_000);
  assert.equal(s.url, TRACK.trackViewUrl);
  assert.equal(normalizeItunesTrack({ ...TRACK, previewUrl: null }), null);
  assert.equal(normalizeItunesTrack({ ...TRACK, previewUrl: "http://insecure/x.m4a" }), null);
  assert.equal(pickMatch([s], { title: "Live Forever", artist: "Oasis" }), s);
  assert.equal(pickMatch([s], { title: "Live Forever", artist: "Liam Gallagher" }), null, "another artist's song is not this one");
  assert.equal(pickMatch([s], { title: "Slide Away", artist: "Oasis" }), null);
  assert.equal(pickMatch([s], { title: "Live Forever (Remastered)", artist: "oasis" }), s, "a longer title that starts the same");
  const live = { ...s, id: "itunes-2", title: "Live Forever (Live)" };
  const medley = { ...s, id: "itunes-3", title: "Live Forever / Slide Away" };
  assert.equal(pickMatch([live, medley, s], { title: "Live Forever", artist: "Oasis" }), s, "the record itself before the live take or the medley the store lists first");
  assert.equal(pickMatch([live, medley], { title: "Live Forever", artist: "Oasis" }), medley, "without the record, the nearer title, never the live take");
});

test("iTunes: OFF, the model's songs are the samples untouched and search answers 503; ON, a sample resolves to the real record and a miss stays a sample", async () => {
  const { resolveSongs, resolveSong, _resetItunesCache } = await import("../lib/music/itunes.js");
  const { SAMPLE_SONGS } = await import("../lib/model/songs.js");
  const { GET } = await loadRoute("app/api/music/route.js");
  await withEnv({}, async () => {
    const off = await resolveSongs(SAMPLE_SONGS);
    assert.deepEqual(off, SAMPLE_SONGS.map((s) => ({ ...s })));
    assert.equal(await resolveSong({ title: "x", artist: "y" }), null);
    const res = await callRoute(GET, { path: "/api/music", query: { q: "oasis" } });
    assert.equal(res.status, 503);
    const model = await callRoute(GET, { path: "/api/music", query: { model: 1 } });
    assert.equal(model.status, 200);
    const body = model.body;
    assert.equal(body.enabled, false);
    assert.equal(body.live, 0);
    assert.ok(body.songs.every((s) => s.sample === true), "every row is still a labelled sample");
  });
  _resetItunesCache();
  await withEnv({ ITUNES_SEARCH_ENABLED: "1" }, () =>
    withFetch(async (url) => {
      const term = new URL(url).searchParams.get("term");
      if (/Live Forever/.test(term)) return json({ resultCount: 1, results: [TRACK] });
      return json({ resultCount: 0, results: [] });
    }, async (calls) => {
      const rows = await resolveSongs(SAMPLE_SONGS);
      const live = rows.find((s) => s.title === "Live Forever");
      assert.equal(live.sample, false);
      assert.equal(live.modelId, "sample-s1");
      assert.equal(live.previewUrl, TRACK.previewUrl);
      const miss = rows.find((s) => s.title === "Reptilia");
      assert.equal(miss.sample, true, "a song the store lacks stays a sample");
      assert.equal(miss.art, undefined);
      const before = calls.length;
      await resolveSongs(SAMPLE_SONGS);
      assert.equal(calls.length, before, "cached — the catalog is not asked again");
      const { body } = await callRoute(GET, { path: "/api/music", query: { model: 1 } });
      assert.equal(body.enabled, true);
      assert.equal(body.live, 1);
    }));
  _resetItunesCache();
});

test("the music panel: a song source carries the store link and says it is a 30-second preview; a motion still says nothing is queued", async () => {
  const { panelFor } = await import("../lib/music/index.js");
  const song = panelFor({ state: "playing", source: { kind: "song", title: "Live Forever", by: "Oasis", url: "https://music.apple.com/x", identified: true } });
  assert.deepEqual(song.link, { href: "https://music.apple.com/x", label: "APPLE MUSIC ↗" });
  assert.equal(song.back, null);
  assert.match(song.label, /30-second preview/);
  assert.match(song.skipNote, /nothing queued/);
  const motion = panelFor({ state: "paused", source: { kind: "motion", postId: "p1", title: "t" } });
  assert.equal(motion.link, null);
  assert.ok(motion.back);
});

// ---- Ticketmaster events -------------------------------------------------------

const EVENT = {
  id: "Z7r9jZ1A", name: "Fontaines D.C.", url: "https://www.ticketmaster.com/event/Z7r9jZ1A",
  images: [{ ratio: "16_9", url: "https://s1.ticketm.net/a.jpg", width: 1024, height: 576 }, { ratio: "3_2", url: "https://s1.ticketm.net/b.jpg", width: 640, height: 427 }],
  dates: { start: { localDate: "2027-03-14", localTime: "20:00:00" }, status: { code: "onsale" }, timezone: "America/New_York" },
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  priceRanges: [{ type: "standard", currency: "USD", min: 45, max: 85 }],
  promoter: { name: "I.M.P." },
  _embedded: { venues: [{ name: "The Anthem", city: { name: "Washington" }, state: { stateCode: "DC" }, country: { name: "United States" }, address: { line1: "901 Wharf St SW" }, location: { latitude: "38.87773", longitude: "-77.02468" }, timezone: "America/New_York" }], attractions: [{ name: "Fontaines D.C." }] },
};

test("Ticketmaster: an event becomes a sourced, live, dated concert row pinned at its venue; without a venue it is nothing", async () => {
  const { normalizeTicketmasterEvent } = await import("../lib/places/ticketmaster.js");
  const { PLACE_KINDS, PLACE_STATUSES } = await import("../lib/places/registry.js");
  const row = normalizeTicketmasterEvent(EVENT, { today: "2026-10-30" });
  assert.equal(row.id, "tm-Z7r9jZ1A");
  assert.deepEqual([row.kind, row.dated, row.sample, row.live], ["concert", true, false, true]);
  assert.ok(PLACE_KINDS.includes(row.kind) && PLACE_STATUSES.includes(row.status));
  assert.deepEqual([row.lat, row.lng], [38.87773, -77.02468]);
  assert.deepEqual([row.startsAt, row.endsAt, row.time], ["2027-03-14", "2027-03-14", "20:00"]);
  assert.equal(row.price, "USD 45–85");
  assert.equal(row.sourceUrl, EVENT.url);
  assert.equal(row.image, "https://s1.ticketm.net/b.jpg", "the 3:2 image the cards prefer");
  assert.equal(row.city, "Washington");
  assert.match(row.note, /Fontaines D\.C\. · at The Anthem · Rock/);
  assert.equal(row.lastChecked, "2026-10-30");
  assert.equal(normalizeTicketmasterEvent({ ...EVENT, _embedded: {} }), null);
  assert.equal(normalizeTicketmasterEvent({ ...EVENT, dates: { start: {} } }), null);
  assert.equal(normalizeTicketmasterEvent({ ...EVENT, dates: { ...EVENT.dates, status: { code: "cancelled" } } }).status, "canceled");
});

test("Ticketmaster: the request carries the centre and radius in km, or the country with none; OFF reads nothing; ON folds rows into /api/places and live=0 leaves them out", async () => {
  const { discoveryUrl, liveEvents, _resetTicketmasterCache } = await import("../lib/places/ticketmaster.js");
  const { GET } = await loadRoute("app/api/places/route.js");
  await withEnv({}, async () => {
    const near = new URL(discoveryUrl({ near: { lat: 38.9, lng: -77.03, km: 80 }, apikey: "k" }));
    assert.equal(near.searchParams.get("latlong"), "38.9000,-77.0300");
    assert.deepEqual([near.searchParams.get("radius"), near.searchParams.get("unit"), near.searchParams.get("classificationName")], ["80", "km", "music"]);
    const country = new URL(discoveryUrl({ apikey: "k" }));
    assert.equal(country.searchParams.get("countryCode"), "US");
    assert.equal(country.searchParams.get("latlong"), null);
    const off = await liveEvents({});
    assert.deepEqual([off.enabled, off.rows], [false, []]);
    assert.match(off.reason, /TICKETMASTER_API_KEY/);
    const res = await GET(new Request("http://localhost/api/places?kind=concert"));
    const body = await res.json();
    assert.equal(body.live.enabled, false);
    assert.ok(body.places.every((p) => !p.live));
  });
  _resetTicketmasterCache();
  await withEnv({ TICKETMASTER_API_KEY: "k" }, () =>
    withFetch(async () => json({ _embedded: { events: [EVENT, EVENT, { ...EVENT, id: "gone", dates: { start: { localDate: "2020-01-01" }, status: { code: "onsale" } } }] } }), async (calls) => {
      const r = await liveEvents({ near: { lat: 38.9, lng: -77.03, km: 80 } });
      assert.equal(r.enabled, true);
      assert.equal(r.rows.length, 2, "de-duplicated by id; the past one is still a row here — the route's date filter drops it");
      const again = await liveEvents({ near: { lat: 38.9, lng: -77.03, km: 80 } });
      assert.equal(again.cached, true);
      assert.equal(calls.length, 1, "ten-minute cache");
      const res = await GET(new Request("http://localhost/api/places?lat=38.9&lng=-77.03&km=80&kind=concert"));
      const body = await res.json();
      assert.equal(body.live.enabled, true);
      assert.equal(body.live.source, "Ticketmaster Discovery API");
      const live = body.places.filter((p) => p.live);
      assert.equal(live.length, 1, "the 2027 show, within 80 km of the centre; the 2020 one is gone");
      assert.equal(live[0].id, "tm-Z7r9jZ1A");
      assert.ok(Number.isFinite(live[0].distanceKm));
      const bare = await (await GET(new Request("http://localhost/api/places?lat=38.9&lng=-77.03&km=80&kind=concert&live=0"))).json();
      assert.ok(bare.places.every((p) => !p.live), "live=0 is the register alone");
      assert.equal(bare.live.reason, "not asked for");
      const far = await (await GET(new Request("http://localhost/api/places?lat=51.5&lng=-0.12&km=30&kind=concert"))).json();
      assert.ok(far.places.every((p) => !p.live), "a Washington show is not within 30 km of London");
    }));
  _resetTicketmasterCache();
});

// ---- Pexels licensed motions ---------------------------------------------------

const VIDEO = {
  id: 3015510, width: 1080, height: 1920, duration: 12, url: "https://www.pexels.com/video/a-woman-walking-3015510/",
  image: "https://images.pexels.com/videos/3015510/free-video-3015510.jpg",
  user: { id: 1, name: "Cottonbro", url: "https://www.pexels.com/@cottonbro" },
  video_files: [
    { id: 1, quality: "uhd", file_type: "video/mp4", width: 2160, height: 3840, link: "https://videos.pexels.com/uhd.mp4" },
    { id: 2, quality: "hd", file_type: "video/mp4", width: 720, height: 1280, link: "https://videos.pexels.com/hd.mp4" },
    { id: 3, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "https://videos.pexels.com/fhd.mp4" },
    { id: 4, quality: "sd", file_type: "video/webm", width: 360, height: 640, link: "https://videos.pexels.com/sd.webm" },
  ],
};

test("Pexels: a video becomes a licensed MOTION in the model's shape — credited, portrait MP4 no wider than 1080, no CORS asked — and the Feed's law reads it as a MOTION", async () => {
  const { normalizePexelsVideo, pickFile } = await import("../lib/media/pexels.js");
  const { postType } = await import("../lib/feed/types.js");
  const { motionRail } = await import("../lib/feed/tetris.js");
  assert.equal(pickFile(VIDEO.video_files).link, "https://videos.pexels.com/fhd.mp4");
  const p = normalizePexelsVideo(VIDEO, { tags: ["STREETWEAR", "STATEMENT"] });
  assert.equal(p.id, "pexels-3015510");
  assert.equal(p.sample, true, "not a passenger's post");
  assert.deepEqual(p.licensed, { source: "Pexels", license: "Pexels License", by: "Cottonbro", byUrl: "https://www.pexels.com/@cottonbro", url: VIDEO.url });
  assert.equal(p.name, "Cottonbro");
  assert.match(p.text, /video by Cottonbro · Pexels license/);
  assert.deepEqual([p.video.width, p.video.height, p.video.durationMs, p.video.cors, p.video.container], [1080, 1920, 12000, false, "mp4"]);
  assert.equal(p.video.poster, VIDEO.image);
  assert.equal(postType(p), "MOTION");
  const { rail, rest } = motionRail([p, { ...p, id: "pexels-2", video: { ...p.video, id: "pexels-2" } }]);
  assert.ok(rail, "the row takes it");
  assert.equal(rest.length, 0, "and the stream keeps none for a second drawing");
  assert.equal(normalizePexelsVideo({ ...VIDEO, user: null }), null, "no one to credit, no post");
  assert.equal(normalizePexelsVideo({ ...VIDEO, video_files: [VIDEO.video_files[3]] }), null, "no MP4, no post");
});

test("Pexels: OFF answers no posts and the reason; ON reads every lane once, de-duplicates and caches; the popup can find a licensed row by id", async () => {
  const { licensedMotions, pexelsLanes, PEXELS_LANES, _resetPexelsCache } = await import("../lib/media/pexels.js");
  const { GET } = await loadRoute("app/api/motion/route.js");
  const { rememberLicensed, licensedById } = await import("../lib/model/licensed.js");
  await withEnv({}, async () => {
    const off = await licensedMotions();
    assert.deepEqual([off.enabled, off.posts], [false, []]);
    const res = await callRoute(GET, { path: "/api/motion" });
    assert.equal(res.status, 200);
    const body = res.body;
    assert.deepEqual([body.enabled, body.count, body.posts], [false, 0, []]);
    assert.match(body.reason, /PEXELS_API_KEY/);
    assert.equal(pexelsLanes(), PEXELS_LANES);
  });
  _resetPexelsCache();
  await withEnv({ PEXELS_API_KEY: "k", PEXELS_QUERIES: "runway, vintage shop" }, () =>
    withFetch(async (url, init) => {
      assert.equal(init.headers.Authorization, "k");
      const u = new URL(url);
      assert.equal(u.searchParams.get("orientation"), "portrait");
      return json({ videos: [VIDEO, { ...VIDEO, id: 77 }] });
    }, async (calls) => {
      assert.deepEqual(pexelsLanes().map((l) => l.query), ["runway", "vintage shop"]);
      const r = await licensedMotions({ perLane: 3 });
      assert.equal(calls.length, 2, "one call per lane");
      assert.equal(r.posts.length, 2, "the same two videos in both lanes, once each");
      await licensedMotions();
      assert.equal(calls.length, 2, "cached for the hour");
      rememberLicensed(r.posts);
      assert.equal(licensedById("pexels-77").licensed.by, "Cottonbro");
      assert.equal(licensedById("sample-w1"), null);
      const { body } = await callRoute(GET, { path: "/api/motion" });
      assert.deepEqual([body.enabled, body.count, body.license], [true, 2, "Pexels License"]);
    }));
  _resetPexelsCache();
});
