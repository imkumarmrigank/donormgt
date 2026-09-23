#!/usr/bin/env node
/**
 * Checks the Postgres document store against the Firestore behaviours the services
 * rely on. Writes only under the "zz_test_*" collections and deletes them afterwards.
 *
 * Usage: node scripts/test-docstore.js   (needs DATABASE_URL, migrations applied)
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("assert/strict");
const { pool } = require("../src/config/database");
const { db, FieldValue, FieldPath } = require("../src/db/docstore");
const { fetchCursorPage } = require("../src/utils/query");

const PREFIX = "zz_test_";
const col = (name) => db.collection(`${PREFIX}${name}`);

async function cleanup() {
  await pool.query("DELETE FROM documents WHERE collection_path LIKE $1", [`${PREFIX}%`]);
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("set / get / exists / data()", async () => {
  const ref = col("a").doc("one");
  assert.equal((await ref.get()).exists, false);
  await ref.set({ name: "One", nested: { x: 1, y: 2 }, when: new Date("2026-01-02T03:04:05Z"), skip: undefined });
  const snap = await ref.get();
  assert.equal(snap.exists, true);
  assert.deepEqual(snap.data(), { name: "One", nested: { x: 1, y: 2 }, when: "2026-01-02T03:04:05.000Z" });
  assert.equal(snap.get("nested.y"), 2);
  assert.equal(ref.path, `${PREFIX}a/one`);
});

test("set without merge replaces; merge deep-merges maps", async () => {
  const ref = col("a").doc("merge");
  await ref.set({ a: 1, m: { p: 1, q: 1 }, arr: [1, 2] });
  await ref.set({ m: { q: 2, r: 3 }, arr: [9] }, { merge: true });
  assert.deepEqual((await ref.get()).data(), { a: 1, m: { p: 1, q: 2, r: 3 }, arr: [9] });
  await ref.set({ b: 2 });
  assert.deepEqual((await ref.get()).data(), { b: 2 });
});

test("update(): dotted paths, whole-field replace, missing doc fails", async () => {
  const ref = col("a").doc("upd");
  await ref.set({ m: { p: 1, q: 1 }, keep: true });
  await ref.update({ "m.q": 5, extra: { z: 1 } });
  assert.deepEqual((await ref.get()).data(), { m: { p: 1, q: 5 }, keep: true, extra: { z: 1 } });
  await ref.update({ m: { only: 1 } });
  assert.deepEqual((await ref.get()).data().m, { only: 1 });
  await assert.rejects(col("a").doc("nope").update({ a: 1 }), /NOT_FOUND/);
});

test("FieldValue increment / arrayUnion / arrayRemove / delete", async () => {
  const ref = col("a").doc("fv");
  await ref.set({ n: FieldValue.increment(5), tags: FieldValue.arrayUnion("a") }, { merge: true });
  await ref.set({ n: FieldValue.increment(-2), tags: FieldValue.arrayUnion("a", "b"), gone: 1 }, { merge: true });
  await ref.update({ tags: FieldValue.arrayRemove("a"), gone: FieldValue.delete() });
  assert.deepEqual((await ref.get()).data(), { n: 3, tags: ["b"] });
});

test("queries: ==, in, range, orderBy, limit, missing orderBy field excluded", async () => {
  const c = col("q");
  await Promise.all([
    c.doc("p1").set({ status: "Completed", date: "2026-01-05", amount: 10, partnerId: "K-1" }),
    c.doc("p2").set({ status: "Pending", date: "2026-01-03", amount: 20, partnerId: "K-1" }),
    c.doc("p3").set({ status: "Completed", date: "2026-01-09", amount: 5, partnerId: "K-2" }),
    c.doc("p4").set({ status: "Scheduled", amount: 7, partnerId: "K-1" })
  ]);
  const ids = (snap) => snap.docs.map((d) => d.id);

  assert.deepEqual(ids(await c.where("partnerId", "==", "K-1").orderBy("date", "asc").get()), ["p2", "p1"]);
  assert.deepEqual(ids(await c.where("status", "in", ["Pending", "Scheduled"]).get()).sort(), ["p2", "p4"]);
  assert.deepEqual(ids(await c.where("date", ">=", "2026-01-04").where("date", "<=", "2026-01-09").orderBy("date", "desc").get()), ["p3", "p1"]);
  assert.deepEqual(ids(await c.where("amount", ">", 6).get()).sort(), ["p1", "p2", "p4"]);
  assert.deepEqual(ids(await c.where("amount", ">", "6").get()), [], "range filters ignore other types");
  const top = await c.orderBy("amount", "desc").limit(1).get();
  assert.equal(top.size, 1);
  assert.equal(top.docs[0].id, "p2");
  assert.equal((await c.where("status", "==", "Nope").get()).empty, true);
  assert.equal((await c.count().get()).data().count, 4);
});

test("documentId() filters and ordering", async () => {
  const c = col("agg");
  await Promise.all(["2026-01-01", "2026-01-02", "2026-01-03"].map((id) => c.doc(id).set({ v: 1 })));
  const snap = await c.orderBy(FieldPath.documentId(), "asc")
    .where(FieldPath.documentId(), ">=", "2026-01-02").get();
  assert.deepEqual(snap.docs.map((d) => d.id), ["2026-01-02", "2026-01-03"]);
  const byIds = await c.where(FieldPath.documentId(), "in", ["2026-01-01", "2026-01-03"]).get();
  assert.equal(byIds.size, 2);
});

test("cursor pagination through fetchCursorPage", async () => {
  const c = col("page");
  await Promise.all(Array.from({ length: 7 }, (_, i) => c.doc(`d${i}`).set({ createdAt: `2026-02-0${i + 1}T00:00:00.000Z`, i })));
  const seen = [];
  let cursor;
  do {
    const page = await fetchCursorPage(c, { limit: 3, cursor });
    seen.push(...page.records.map((r) => r.i));
    cursor = page.pageInfo.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, [6, 5, 4, 3, 2, 1, 0]);
});

test("sub-collections and collectionGroup", async () => {
  const pickup = col("pickups").doc("P-1");
  await pickup.set({ x: 1 });
  const link = pickup.collection("links").doc("L1");
  await link.set({ amount: 5 });
  assert.equal(link.path, `${PREFIX}pickups/P-1/links/L1`);
  assert.equal((await pickup.collection("links").get()).size, 1);
  const group = await db.collectionGroup("links").where("amount", "==", 5).get();
  assert.ok(group.docs.some((d) => d.ref.path === link.path));
});

test("transactions: counter ids are unique under concurrency", async () => {
  const counter = col("counters").doc("donors");
  const nextId = () => db.runTransaction(async (tx) => {
    const snap = await tx.get(counter);
    const next = (snap.exists ? snap.data().value : 0) + 1;
    tx.set(counter, { value: next }, { merge: true });
    return next;
  });
  const results = await Promise.all(Array.from({ length: 8 }, nextId));
  assert.deepEqual([...results].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("transactions roll back on error; tx.get(query) works", async () => {
  const ref = col("tx").doc("t");
  await ref.set({ v: 1 });
  await assert.rejects(db.runTransaction(async (tx) => {
    const q = await tx.get(col("tx").where("v", "==", 1));
    assert.equal(q.size, 1);
    tx.set(ref, { v: 2 });
    throw new Error("boom");
  }), /boom/);
  assert.equal((await ref.get()).data().v, 1);

  // two increments of the same doc inside one transaction both apply
  await db.runTransaction(async (tx) => {
    tx.set(ref, { v: FieldValue.increment(1) }, { merge: true });
    tx.set(ref, { v: FieldValue.increment(1) }, { merge: true });
  });
  assert.equal((await ref.get()).data().v, 3);
});

test("batch commits atomically", async () => {
  const batch = db.batch();
  batch.set(col("b").doc("1"), { a: 1 });
  batch.update(col("b").doc("missing"), { a: 1 });
  await assert.rejects(batch.commit(), /NOT_FOUND/);
  assert.equal((await col("b").doc("1").get()).exists, false);
});

async function main() {
  await cleanup();
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (error) {
      failed++;
      console.log(`  FAIL ${name}\n       ${error.message}`);
    }
  }
  await cleanup();
  console.log(failed ? `\n${failed} failed` : `\nAll ${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
}

main().finally(() => pool.end());
