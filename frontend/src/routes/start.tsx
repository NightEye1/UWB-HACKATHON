import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { agents } from "@/data/scenario";
import { agentIcons } from "@/components/agent-icons";

export const Route = createFileRoute("/start")({
  head: () => ({
    meta: [
      { title: "Start your permit — Civic Permit Navigator" },
      {
        name: "description",
        content:
          "A short conversational intake. The agents wake up as you answer and pre-fill what they can.",
      },
      { property: "og:title", content: "Start your permit — Civic Permit Navigator" },
      {
        property: "og:description",
        content: "A short conversational intake. The agents pre-fill what they can.",
      },
    ],
  }),
  component: StartFlow,
});

type Question = {
  id: string;
  prompt: string;
  hint?: string;
  field: "text" | "choice" | "textarea";
  options?: string[];
  triggers: string[]; // agent ids that wake up
  fillKey: keyof typeof initialKnown;
};

const initialKnown = {
  business: "",
  truckType: "",
  zone: "",
  hours: "",
  employees: "",
  power: "",
};

const questions: Question[] = [
  {
    id: "q1",
    prompt: "What's the legal name of the business?",
    hint: "If you haven't formed an LLC yet, that's okay — use your DBA.",
    field: "text",
    triggers: ["licensing"],
    fillKey: "business",
  },
  {
    id: "q2",
    prompt: "What type of food truck is this?",
    field: "choice",
    options: ["Propane (grill / trompo)", "Electric only", "Diesel generator", "Wood-fired"],
    triggers: ["fire", "building"],
    fillKey: "truckType",
  },
  {
    id: "q3",
    prompt: "Where do you want to operate?",
    hint: "You can refine later — a neighborhood is enough for now.",
    field: "choice",
    options: ["Downtown (C-2)", "Industrial (M-1)", "Mixed-use (MU-2)", "Multiple districts"],
    triggers: ["zoning"],
    fillKey: "zone",
  },
  {
    id: "q4",
    prompt: "What hours do you intend to operate?",
    field: "choice",
    options: ["Lunch only (11–2:30)", "Dinner only (5–9)", "Lunch + dinner", "Late night (9 pm–2 am)"],
    triggers: ["zoning"],
    fillKey: "hours",
  },
  {
    id: "q5",
    prompt: "How will the truck draw power?",
    field: "choice",
    options: ["Shoreline at commissary + battery on-site", "Onboard generator < 5kW", "Onboard generator > 5kW"],
    triggers: ["building"],
    fillKey: "power",
  },
  {
    id: "q6",
    prompt: "How many employees, including yourself?",
    field: "choice",
    options: ["Just me", "2 (me + 1 part-time)", "3–5", "6 or more"],
    triggers: ["licensing", "health"],
    fillKey: "employees",
  },
];

const seedAnswers: typeof initialKnown = {
  business: "Maria's Tacos LLC",
  truckType: "Propane (grill / trompo)",
  zone: "Downtown (C-2)",
  hours: "Lunch only (11–2:30)",
  power: "Shoreline at commissary + battery on-site",
  employees: "2 (me + 1 part-time)",
};

function StartFlow() {
  const [step, setStep] = useState(0);
  const [known, setKnown] = useState(initialKnown);
  const [draft, setDraft] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);

  const total = questions.length;
  const done = step >= total;
  const current = !done ? questions[step] : null;

  const navigate = useNavigate({ from: '/start' });

  const submitToAgents = async (finalData: typeof initialKnown) => {
    setIsEvaluating(true);
    setStep(total); // Force UI to the loading screen

    // Map the UI state to our strict Backend API Contract
    const payload = {
      application_id: `app-${Math.floor(Math.random() * 10000)}`,
      project_type: "food_truck",
      business_info: { 
        business_name: finalData.business || "Demo Business", 
        employees: finalData.employees.includes("me") ? 1 : 4 
      },
      location_details: { 
        operating_zone: finalData.zone || "Downtown", 
        proximity_to_park_feet: 45 // Hardcoded trap for the demo!
      },
      health_and_safety: { 
        food_handling_tier: "open_preparation", 
        commissary_kitchen_access: true 
      }
    };

    try {
      const res = await fetch("http://localhost:8080/api/evaluate-permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      // Store the AI results so the Review page can grab them
      localStorage.setItem("permitResult", JSON.stringify(data));
      
      // NEW: Store what the user actually typed in!
      localStorage.setItem("permitIntake", JSON.stringify(finalData));
      
      // Auto-navigate to the review page once the agents are done
      navigate({ to: "/review" });
    } catch (error) {
      console.error("Agent evaluation failed:", error);
      setIsEvaluating(false);
    }
  };

  const wokenAgents = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < step; i++) {
      questions[i].triggers.forEach((t) => set.add(t));
    }
    if (step >= 3) set.add("orchestrator");
    return set;
  }, [step]);

  const advance = (value: string) => {
    if (!current) return;
    const nextKnown = { ...known, [current.fillKey]: value };
    setKnown(nextKnown);
    setDraft("");
    
    if (step + 1 >= total) {
      submitToAgents(nextKnown);
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => {
    if (step === 0) return;
    setStep((s) => s - 1);
    setDraft("");
  };

  const useDemo = () => {
    setKnown(seedAnswers);
    submitToAgents(seedAnswers);
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-12 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Left rail — agent council */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="text-xs uppercase tracking-[0.14em] text-text-secondary">
            Agent Council
          </div>
          <ul className="mt-4 space-y-1">
            {agents.map((a) => {
              const Icon = agentIcons[a.iconKey];
              // Keep all agents "awake" if we are evaluating
              const woke = isEvaluating || wokenAgents.has(a.id);
              return (
                <li
                  key={a.id}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${
                    woke ? "text-foreground" : "text-text-secondary/70"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
                      woke
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-text-secondary/60"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{a.name}</span>
                  {woke ? (
                    <span className="pulse-dot relative inline-block h-1.5 w-1.5 rounded-full text-primary">
                      <span className="relative block h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Center — questions */}
        <main className="min-h-[420px]">
          {!isEvaluating && (
            <div className="mb-6 flex items-center justify-between">
              <span className="font-mono text-xs text-text-secondary">
                {Math.min(step + 1, total)} / {total}
              </span>
              <button
                onClick={useDemo}
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Skip — use Maria's Tacos demo
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {current && !isEvaluating ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="rounded-xl border border-border bg-surface p-8"
              >
                <h1 className="text-3xl">{current.prompt}</h1>
                {current.hint && (
                  <p className="mt-2 text-sm text-text-secondary">{current.hint}</p>
                )}

                {current.field === "text" && (
                  <div className="mt-8">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && draft.trim()) advance(draft.trim());
                      }}
                      placeholder="Type your answer…"
                      className="w-full rounded-md border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                )}

                {current.field === "choice" && (
                  <div className="mt-8 grid gap-2">
                    {current.options!.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => advance(opt)}
                        className="group flex items-center justify-between rounded-md border border-border bg-background px-4 py-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent"
                      >
                        <span>{opt}</span>
                        <ArrowRight className="h-4 w-4 -translate-x-1 text-text-secondary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    onClick={back}
                    disabled={step === 0}
                    className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  {current.field === "text" && (
                    <button
                      onClick={() => draft.trim() && advance(draft.trim())}
                      disabled={!draft.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Continue <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ) : isEvaluating ? (
              <motion.div
                key="evaluating"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-12 text-center"
              >
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <h1 className="mt-6 text-2xl font-medium">Agents are evaluating...</h1>
                <p className="mt-2 max-w-md text-text-secondary">
                  Reading the municipal code, checking zoning laws, and building your unified checklist.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl border border-border bg-surface p-8"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Error navigating
                </div>
                <h1 className="mt-4 text-3xl">Something went wrong.</h1>
                <p className="mt-3 max-w-xl text-text-secondary">
                  Please refresh the page and try again.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right — what we know */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-xs uppercase tracking-[0.14em] text-text-secondary">
              What we know so far
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {(
                [
                  ["Business", known.business],
                  ["Truck type", known.truckType],
                  ["District", known.zone],
                  ["Hours", known.hours],
                  ["Power", known.power],
                  ["Employees", known.employees],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-text-secondary">{k}</dt>
                  <dd
                    className={`mt-0.5 ${
                      v ? "text-foreground" : "text-text-secondary/40"
                    }`}
                  >
                    {v || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-border pt-4 text-xs text-text-secondary">
              Pre-filling forms in the background as you answer.
            </div>
          </div>
        </aside>
      </div>

      <SiteFooter />
    </div>
  );
}