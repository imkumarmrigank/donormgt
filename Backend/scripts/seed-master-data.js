#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  FreePathshala – Seed Master Data (RST + SKS Items)
 * ─────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/seed-master-data.js
 *
 * Seeds RST and SKS item types into Firestore collections.
 * Uses merge-writes so it is safe to run multiple times.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const { db } = require("../src/config/firebase");
const { COLLECTIONS } = require("../src/config/collections");
const masterData = require("../src/config/masterData");

function slugify(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const RST_RATES = {
  "Glass Bottle": 2,
  "Glass Other": 1.5,
  "Plastic Bottle / Box": 8,
  "Other Plastic": 5,
  "Paper": 12,
  "Cardboard Box": 8,
  "Iron": 28,
  "E-Waste": 15,
  "Wood": 3,
  "Others": 0
};

async function main() {
  console.log("\n  FreePathshala – Master Data Seeder\n");
  console.log("  ────────────────────────────────────\n");

  const batch = db.batch();
  const actor = { uid: "system:seed" };
  const now = new Date().toISOString();

  // Seed RST Items
  console.log("  ♻️  RST Items:");
  masterData.RST_ITEMS.forEach((name, i) => {
    const id = slugify(name);
    const ref = db.collection(COLLECTIONS.RST_ITEMS).doc(id);
    batch.set(ref, {
      id,
      name,
      rate: RST_RATES[name] || 0,
      unit: "kg",
      order: i,
      active: true,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
    console.log(`     ${i + 1}. ${name} — ₹${RST_RATES[name] || 0}/kg`);
  });

  // Seed SKS Items
  console.log("\n  🎁 SKS Items:");
  masterData.SKS_ITEMS.forEach((name, i) => {
    const id = slugify(name);
    const ref = db.collection(COLLECTIONS.SKS_ITEMS).doc(id);
    batch.set(ref, {
      id,
      name,
      order: i,
      active: true,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
    console.log(`     ${i + 1}. ${name}`);
  });

  await batch.commit();

  console.log(`\n  ✔ Seeded ${masterData.RST_ITEMS.length} RST items + ${masterData.SKS_ITEMS.length} SKS items\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n  ✖ Seeding failed:\n", err);
  process.exit(1);
});
