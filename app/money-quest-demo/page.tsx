"use client";
import Link from "next/link";
import MoneyQuest from "../../components/MoneyQuest";
import type { MikeLead } from "../../lib/mike-leads";

// Fictional samples ONLY. Never expose real buyer URLs, identities or contact data.
const date = "2026-10-15T00:00:00.000Z";
const samples: MikeLead[] = [
  {id:"demo-audio",owner_id:"demo",title:"Tame a noisy streaming microphone",category:"audio production",source_platform:"Fictional training scenario",source_url:"",posted_budget:"Fictional $50–$150",proposed_price:"Practice $125",lead_status:"research",verification_status:"needs_review",verified_on:null,contact_route:null,research_notes:"Practice isolating each audio chain stage. No real buyer exists.",created_at:date,updated_at:date},
  {id:"demo-web",owner_id:"demo",title:"Rescue a broken booking website",category:"website repair",source_platform:"Fictional training scenario",source_url:"",posted_budget:"Not stated",proposed_price:"Practice $250",lead_status:"research",verification_status:"needs_review",verified_on:null,contact_route:null,research_notes:"Practice setting a one-page scope and acceptance criteria.",created_at:date,updated_at:date},
  {id:"demo-tech",owner_id:"demo",title:"Set up four home cameras",category:"camera installation",source_platform:"Fictional training scenario",source_url:"",posted_budget:"Not stated",proposed_price:"Practice $180",lead_status:"research",verification_status:"needs_review",verified_on:null,contact_route:null,research_notes:"Practice clarifying equipment, ladders, wiring and payment before work.",created_at:date,updated_at:date},
  {id:"demo-edu",owner_id:"demo",title:"Teach a small AI workflow workshop",category:"AI training",source_platform:"Fictional training scenario",source_url:"",posted_budget:"Not stated",proposed_price:null,lead_status:"research",verification_status:"needs_review",verified_on:null,contact_route:null,research_notes:"Practice choosing one measurable workflow improvement.",created_at:date,updated_at:date}
];
export default function MoneyQuestDemo() {
  return <main className="dq-demo">
    <div className="dq-demo-label"><strong>NO-LOGIN PRACTICE MODE</strong> · Invented gigs only. No client or database access.</div>
    <MoneyQuest leads={samples} isDemo />
    <p className="dq-demo-link"><Link href="/login">Sign into Presser to see your real private bounties →</Link></p>
  </main>;
}
