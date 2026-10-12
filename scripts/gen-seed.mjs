// Generates supabase/seed.sql from data/seed.json so the SQL and the
// preview data never drift apart. Run: node scripts/gen-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const q = (v) =>
  v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const out = [
  "-- Generated from data/seed.json. Do not edit by hand.",
  "-- " + seed._note,
  "begin;",
];
for (const p of seed.projects) {
  out.push(
    `insert into public.projects (id, name, city, kind, scope, size, deadline, est_value, value_confirmed, value_note, created_at) values (${[
      p.id, p.name, p.city, p.kind, p.scope, p.size, p.deadline, p.est_value, p.value_confirmed, p.value_note, p.created_at,
    ].map(q).join(", ")}) on conflict (id) do nothing;`
  );
  for (const r of p.routes) {
    out.push(
      `insert into public.routes (id, project_id, contractor, trade_scope, source_url, original_ad_url, date_posted, date_checked, how_to_reply, contact_name, phone, email, verification_note, bid_status) values (${[
        r.id, p.id, r.contractor, r.trade_scope, r.source_url, r.original_ad_url, r.date_posted, r.date_checked,
        r.how_to_reply, r.contact_name, r.phone, r.email, r.verification_note, r.bid_status,
      ].map(q).join(", ")}) on conflict (id) do nothing;`
    );
  }
}
out.push("commit;", "");
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), out.join("\n"));
console.log(`Wrote ${seed.projects.length} projects, ${seed.projects.reduce((n, p) => n + p.routes.length, 0)} routes.`);
