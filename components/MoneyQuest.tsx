"use client";

import { useMemo, useState } from "react";
import type { MikeLead } from "../lib/mike-leads";
import { safeSourceUrl, stageLabel, verificationLabel } from "../lib/mike-leads";
import { earnedXP, levelForXP, mapLeadToQuest, QUEST_STEPS, type QuestProgress, type QuestStep } from "../lib/money-quest";

const ICONS = { audio: "♫", web: "⌘", tech: "◈", education: "✦", wild: "?" } as const;
export default function MoneyQuest({ leads, isDemo = false }: { leads: MikeLead[]; isDemo?: boolean }) {
  const [progress, setProgress] = useState<QuestProgress>({});
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const xp = earnedXP(progress, leads.map((x) => x.id));
  const quests = useMemo(() => leads.map(mapLeadToQuest).filter((q) =>
    (filter === "all" || filter === q.kind) &&
    [q.title, q.codename, q.sourcePlatform].join(" ").toLowerCase().includes(query.toLowerCase())
  ), [leads, filter, query]);

  const toggle = (id: string, step: QuestStep) => {
    setProgress((old) => {
      const current = old[id] || [];
      const next = current.includes(step) ? current.filter((x) => x !== step) : [...current, step];
      return { ...old, [id]: next };
    });
  };
  return (
    <section className="dq" aria-label="Dirty Dragon Money Quest">
      <div className="dq-hero">
        <span className="dq-eyebrow">DIRTY DRAGON PRESENTS</span>
        <h2>THE MONEY QUEST <span aria-hidden="true">✦</span></h2>
        <p>Hunt genuine gigs. Defeat scope creep. Unlock time for music.</p>
        <div className="dq-scoreboard">
          <div><span>ADVENTURER LEVEL</span><strong>{levelForXP(xp)}</strong></div>
          <div><span>PRACTICE XP</span><strong>{xp}</strong></div>
          <div><span>BOUNTIES FOUND</span><strong>{leads.length}</strong></div>
        </div>
        <div className="dq-meter" role="progressbar" aria-label="Progress to next practice level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xp % 100}><span style={{ width: `${xp % 100}%` }}/></div>
        <p className="dq-disclaimer">{isDemo ? "Fictional practice bounties. No real customer data." : "Real saved leads; some may be stale or unverified."} XP is local to this page, resets on refresh, and never represents cash or work completed.</p>
      </div>
      <div className="dq-toolbar">
        <label htmlFor="dq-search">Find your next bounty</label>
        <input id="dq-search" type="search" placeholder="Audio, site rescue, teaching…" value={query} onChange={(e) => setQuery(e.target.value)}/>
        <div className="dq-filters" role="group" aria-label="Bounty category">
          {([{ id:"all", label:"All" },{id:"audio",label:"♫ Audio"},{id:"web",label:"⌘ Web"},{id:"education",label:"✦ Teaching"},{id:"tech",label:"◈ Tech"},{id:"wild",label:"? Wild"}] as const).map((f)=>
            <button key={f.id} type="button" aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</button>
          )}
        </div>
      </div>
      <div className="dq-list">
        {quests.length === 0 && <p className="dq-empty">No bounties match. Change your filters.</p>}
        {quests.map((quest) => {
          const done = progress[quest.id] || [];
          const open = selected === quest.id;
          const url = safeSourceUrl(quest.source);
          return <article className={`dq-card dq-${quest.kind}`} key={quest.id}>
            <div className="dq-card-top">
              <span className="dq-glyph" aria-hidden="true">{ICONS[quest.kind]}</span>
              <div className="dq-card-heading">
                <span className="dq-eyebrow">{quest.codename}</span>
                <h3>{quest.title}</h3>
                <span className="dq-small">{quest.sourcePlatform} · {stageLabel(quest.stage)}</span>
              </div>
            </div>
            <div className="dq-tags"><span>{verificationLabel(quest.verification)}</span><span>Research bounty</span></div>
            <div className="dq-prices">
              <div><span>BUYER-STATED BUDGET</span><strong>{quest.buyerBudget || "Not stated"}</strong></div>
              <div><span>PROPOSED QUOTE</span><strong>{quest.proposedPrice || "Not set"}</strong></div>
            </div>
            <p className="dq-warning">Neither amount is money earned. Confirm the buyer is active and payment terms before proceeding.</p>
            <div className="dq-card-actions">
              <button type="button" className="dq-btn" aria-expanded={open} onClick={()=>setSelected(open?null:quest.id)}>{open ? "Close mission" : "Open mission"} <span aria-hidden="true">→</span></button>
              {url && <a className="dq-outline" target="_blank" rel="noopener noreferrer" href={url}>Source ↗</a>}
            </div>
            {open && <div className="dq-mission">
              <h4>Quest objectives <span className="dq-small">Practice only — no database writes</span></h4>
              {QUEST_STEPS.map((step)=><label key={step.id} className="dq-objective"><input type="checkbox" checked={done.includes(step.id)} onChange={()=>toggle(quest.id,step.id)}/><span>{step.title}</span><strong>+{step.xp} XP</strong></label>)}
              <p><strong>Contact route:</strong> {quest.contactRoute || "Not verified"}</p>
              {quest.notes && <details><summary>Evidence, caveats & next move</summary><p className="dq-notes">{quest.notes}</p></details>}
              <p className="dq-warning">Only a verified, owner-approved action can send a pitch or update a real lead. Tapping objectives here doesn't contact anyone.</p>
            </div>}
          </article>;
        })}
      </div>
      <footer className="dq-footer">DRAGON'S CODE: no fake wins · no secret outreach · no mixing client data · real money stays real. BACK TO THE FUN.</footer>
    </section>
  );
}
