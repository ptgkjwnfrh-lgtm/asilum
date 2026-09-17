// The saved bag must keep a listing's source and recover from broken device
// storage without taking down the shared header. Exercise the public helpers
// and the real source/provenance readers, not the snapshot's implementation.
import test from "node:test";
import assert from "node:assert/strict";
import { bagAdd, bagList, bagRemove, thumbFor } from "../lib/client.js";
import { sourceFor } from "../lib/social.js";
import { originEvidence } from "../lib/provenance.js";

function browser(t, initial) {
  const values = new Map(initial === undefined ? [] : [["asilum-bag", initial]]);
  const target = new EventTarget();
  target.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: target });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  });
  return { target, values };
}

const piece = (id = "merchant-piece-1") => ({
  id, title: "Archive jacket", brand: "Test house", price: 120,
  currency: "USD", img: "https://merchant.example/jacket.jpg", tags: { ARCHIVAL: 0.8 },
});

test("a saved live listing keeps its merchant and server-stamped origin disclosure", (t) => {
  browser(t);
  for (const source_name of ["shopify", "ebay", "independent-merchant", "seed"]) {
    const item = {
      ...piece(source_name + "-piece-1"), source_name,
      source: source_name === "shopify" ? "Test merchant" : source_name,
      source_product_url: "https://merchant.example/products/jacket",
    };
    item.originEvidence = originEvidence(item);
    bagAdd(item);
    const saved = bagList().find((row) => row.id === item.id);
    assert.equal(sourceFor(saved), sourceFor(item));
    assert.deepEqual(originEvidence(saved), item.originEvidence);
    assert.deepEqual(saved.originEvidence, item.originEvidence,
      "OriginLine reads the server's disclosure; storing the source alone is insufficient");
  }
});

test("legacy valid bag rows survive, duplicate adds stay singular, and removal announces the change", (t) => {
  const original = piece();
  const { target } = browser(t, JSON.stringify([original]));
  let events = 0;
  target.addEventListener("asilum:bag", () => events++);
  assert.deepEqual(bagList(), [original]);
  bagAdd(original);
  assert.equal(bagList().length, 1);
  assert.equal(events, 0);
  bagAdd(piece("merchant-piece-2"));
  bagRemove(original.id);
  assert.deepEqual(bagList().map((row) => row.id), ["merchant-piece-2"]);
  assert.equal(events, 2);
});

test("non-array JSON and malformed JSON recover to an empty usable bag", (t) => {
  const { values } = browser(t);
  for (const raw of ["{}", '"old-format"', "true", "42", "null", "[broken"]) {
    values.set("asilum-bag", raw);
    assert.deepEqual(bagList(), [], raw);
    assert.doesNotThrow(() => bagAdd(piece()));
    assert.equal(bagList().length, 1);
    assert.doesNotThrow(() => bagRemove(piece().id));
    assert.deepEqual(bagList(), []);
  }
});

test("broken rows do not discard valid saved pieces or break add/remove", (t) => {
  browser(t, JSON.stringify([null, false, 9, [], {}, { id: 7 }, { id: "" }, piece()]));
  assert.deepEqual(bagList(), [piece()]);
  assert.doesNotThrow(() => bagAdd(piece("second")));
  bagRemove(piece().id);
  assert.deepEqual(bagList().map((row) => row.id), ["second"]);
});

test("malformed display fields cannot crash the bag's label, placeholder or subtotal", (t) => {
  browser(t, JSON.stringify([{
    id: "broken-display", title: {}, brand: [], price: {}, currency: {}, img: {},
    source: {}, source_name: {}, src: {}, tags: { ARCHIVAL: {} },
    originEvidence: { status: "unverified", sourceLabel: {}, note: [] },
  }, { ...piece("numeric-price"), price: "45.5" }]));
  const saved = bagList();
  assert.doesNotThrow(() => saved.map(sourceFor));
  assert.doesNotThrow(() => saved.map(thumbFor));
  for (const row of saved) {
    for (const field of ["title", "brand", "currency", "img", "source", "source_name", "src"]) {
      assert.ok(row[field] == null || typeof row[field] === "string", field);
    }
    if (row.originEvidence) {
      assert.ok(row.originEvidence.sourceLabel == null || typeof row.originEvidence.sourceLabel === "string");
      assert.ok(row.originEvidence.note == null || typeof row.originEvidence.note === "string");
    }
  }
  assert.equal(saved.reduce((sum, row) => sum + (row.price || 0), 0), 45.5);
});

test("invalid add inputs are ignored and unrelated payload fields are not persisted", (t) => {
  const { values } = browser(t);
  for (const input of [null, undefined, [], "piece", {}, { id: {} }]) {
    assert.doesNotThrow(() => bagAdd(input));
  }
  assert.deepEqual(bagList(), []);
  bagAdd({ ...piece(), internalNotes: "not a display field", unrelatedPayload: { large: true } });
  const stored = JSON.parse(values.get("asilum-bag"));
  assert.equal(stored[0].internalNotes, undefined);
  assert.equal(stored[0].unrelatedPayload, undefined);
});

test("blocked browser storage does not throw from bag reads or writes", (t) => {
  const { target } = browser(t);
  Object.defineProperty(target, "localStorage", { get() { throw new Error("storage blocked"); } });
  assert.deepEqual(bagList(), []);
  assert.doesNotThrow(() => bagAdd(piece()));
  assert.doesNotThrow(() => bagRemove(piece().id));
});
