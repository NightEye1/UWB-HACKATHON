import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Clock,
  Download
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import {
  agents,
  applicant,
  checklist,
  conflict,
  forms,
  citations,
} from "@/data/scenario";
import { agentIcons } from "@/components/agent-icons";
import { StatusBadge } from "@/components/status-badge";
import { CitationPanel, ReasoningText, CitationPill } from "@/components/citation";

export const Route = createFileRoute("/review")({
  component: Review,
});

const reasoningPhrases = [
  "Cross-referencing §7.32 with §15.04…",
  "Resolving variance under §9.14.225…",
  "Sequencing inspections by dependency graph…",
  "Verifying commissary status under §8.20.030…",
];

function Review() {
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string>(forms[0].id);
  const [reasoningPhrase, setReasoningPhrase] = useState(0);

  // --- API STATE ---
  const [apiResult, setApiResult] = useState<any>(null);
  const [intakeData, setIntakeData] = useState<any>(null); // NEW

  useEffect(() => {
    // Grab Gemini's hard work
    const savedData = localStorage.getItem("permitResult");
    if (savedData) {
      try {
        setApiResult(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to parse permit results", e);
      }
    }

    // NEW: Grab the user's typed answers
    const savedIntake = localStorage.getItem("permitIntake");
    if (savedIntake) {
      try {
        setIntakeData(JSON.parse(savedIntake));
      } catch (e) {
        console.error("Failed to parse intake data", e);
      }
    }

    const t = setInterval(() => {
      setReasoningPhrase((p) => (p + 1) % reasoningPhrases.length);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  // Map API data if it exists, otherwise fall back to the polished mock data
  const dynamicAgents = apiResult?.agent_details || agents;
  const dynamicChecklist = apiResult?.unified_checklist || [];
  const hasConflict = apiResult?.conflict_detected ?? true;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-[1200px] px-6 py-10">
        {/* Applicant summary */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-text-secondary">
                Application
              </div>
              <h1 className="mt-1 text-3xl">
                {applicant.business}{" "}
                <span className="text-text-secondary"> · {applicant.permit}</span>
              </h1>
              <p className="mt-1 text-text-secondary">{applicant.summary}</p>
            </div>
          </div>
        </div>

        {/* Conflict banner */}
        {hasConflict && (
          <div className="mt-8 rounded-xl border border-conflict/40 bg-conflict/5 p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-conflict/15 text-conflict">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-conflict">
                  Action Required: Setback Conflict
                </div>
                <h2 className="mt-1 text-2xl">Park Boundary Violation detected</h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-foreground/90">
                  The Zoning Authority has flagged that your proposed operating location is 45 feet from a public park. Under <span className="citation">SMC 15.17.005</span>, food trucks must maintain a strict 50-foot boundary.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => setChosen("opt1")}
                className={`text-left rounded-lg border p-4 transition-all ${
                  chosen === "opt1" ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="font-mono">Option 1</span>
                  <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Recommended</span>
                </div>
                <div className="mt-2 text-sm font-medium">Relocate the truck 5 feet</div>
                <div className="mt-2 text-[13px] text-text-secondary">Update your site plan to shift the designated operating zone by 5 feet to clear the setback.</div>
              </button>
            </div>
          </div>
        )}

        {/* Agent Council Grid */}
        <div className="mt-12">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="text-2xl">Agent Council</h2>
              <p className="text-sm text-text-secondary">Live API evaluations based on your intake data.</p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-text-secondary">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="reasoning-cursor">{reasoningPhrases[reasoningPhrase]}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dynamicAgents.map((a: any, index: number) => {
              const name = a.agency || a.name;
              const status = a.status || "approved";
              const notes = a.notes || a.summary;
              const isZoningConflict = status === "conflict" && name.toLowerCase().includes("zoning");

              // Bulletproof Icon Fallback Logic
              let Icon = Sparkles; 
              if (agentIcons) {
                if (a.iconKey && agentIcons[a.iconKey as keyof typeof agentIcons]) {
                  Icon = agentIcons[a.iconKey as keyof typeof agentIcons];
                } else if (name.toLowerCase().includes("health") && agentIcons["health" as keyof typeof agentIcons]) {
                  Icon = agentIcons["health" as keyof typeof agentIcons];
                } else if (agentIcons["zoning" as keyof typeof agentIcons]) {
                  Icon = agentIcons["zoning" as keyof typeof agentIcons];
                }
              }

              return (
                <motion.div
                  key={index}
                  layout
                  className={`rounded-xl border p-5 ${
                    isZoningConflict ? "border-red-500 bg-red-50/50 dark:bg-red-950/20" : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className={`grid h-9 w-9 place-items-center rounded-md ${isZoningConflict ? "bg-red-500/10 text-red-500" : "bg-primary/8 text-primary"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="font-medium">{name} Agent</div>
                      </div>
                    </div>
                    <StatusBadge status={status} />
                  </div>

                  <p className="mt-4 text-[14px] leading-relaxed text-foreground/90">
                    {notes}
                  </p>

                  {a.citations && a.citations.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <div className="text-xs text-text-secondary mb-2">Cited Code:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {a.citations.map((cite: string, i: number) => (
                           <span key={i} className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-text-secondary hover:border-primary/30 hover:bg-primary/5 hover:text-foreground">
                             {cite}
                           </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Unified Checklist */}
        <div className="mt-12 mb-20">
           <h2 className="text-2xl">Unified checklist</h2>
           <p className="text-sm text-text-secondary">Dependency-ordered forms generated by the Orchestrator.</p>
           
           <div className="mt-5 space-y-3">
              {dynamicChecklist.length > 0 ? (
                dynamicChecklist.map((form: any, index: number) => (
                  <div key={index} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-4 hover:border-primary/50 transition-colors">
                    <div>
                      <div className="text-sm font-medium">{form.form_name}</div>
                      <a href={form.url} target="_blank" className="text-xs text-primary hover:underline">{form.url}</a>
                    </div>
                    <button className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                      <Download className="h-3.5 w-3.5" /> Download PDF
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
                  No required forms were generated by the agents for this specific path.
                </div>
              )}
           </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}