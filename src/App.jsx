import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient.js";
import {
  Sparkles, ArrowRight, Calendar, Wallet, MapPin, Heart, Archive,
  Check, Plus, X, ShoppingBag, Gem, Shirt, FileText, Dumbbell,
  Droplet, Scissors, ChevronRight, ChevronLeft, LayoutGrid, Trash2,
  Loader2, CircleDot, Images, Pin,
} from "lucide-react";

/* ---------------------------------------------------------------- */
/* Design tokens                                                     */
/* ---------------------------------------------------------------- */
const T = {
  paper: "#FBF9F5",
  paperDim: "#F3EFE7",
  ink: "#17161B",
  inkSoft: "#5B5964",
  wine: "#7C2A3A",
  wineDeep: "#5E1F2C",
  butter: "#E7B646",
  moss: "#42513C",
  line: "#E4DFD3",
};

const serif = { fontFamily: "'Iowan Old Style','Palatino Linotype',Georgia,serif" };
const sans = { fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" };

/* ---------------------------------------------------------------- */
/* Helpers                                                            */
/* ---------------------------------------------------------------- */
const INR = (n) =>
  "₹" + Math.round(n || 0).toLocaleString("en-IN");

const daysBetween = (a, b) => Math.ceil((a - b) / 86400000);

const fmtDate = (d) =>
  d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------------------------------------------------------------- */
/* Timeline task template — monthsBefore is approx months before     */
/* the wedding date this task should happen                          */
/* ---------------------------------------------------------------- */
const TASK_TEMPLATE = [
  { m: 11, cat: "Budget", title: "Set your total bridal budget" },
  { m: 11, cat: "Wellness", title: "Baseline bloodwork / health check-in" },
  { m: 10, cat: "Fitness", title: "Start a fitness routine you'll actually keep" },
  { m: 10, cat: "Jewellery", title: "Begin jewellery research" },
  { m: 9, cat: "Outfits", title: "Begin bridal outfit research" },
  { m: 9, cat: "Beauty", title: "Set beauty goals for the big day" },
  { m: 8, cat: "Shopping", title: "Create your shopping list" },
  { m: 6, cat: "Beauty", title: "Book major beauty vendors" },
  { m: 6, cat: "Outfits", title: "Finalise major outfits" },
  { m: 6, cat: "Jewellery", title: "Make key jewellery purchases" },
  { m: 5, cat: "Outfits", title: "Start alterations" },
  { m: 5, cat: "Beauty", title: "Settle into a skincare + hair routine" },
  { m: 3, cat: "Beauty", title: "Beauty trials" },
  { m: 3, cat: "Outfits", title: "Outfit trials" },
  { m: 3, cat: "Jewellery", title: "Do a full jewellery inventory" },
  { m: 3, cat: "Shopping", title: "Final shopping sweep" },
  { m: 2, cat: "Wellness", title: "Start travel / honeymoon planning" },
  { m: 1, cat: "Outfits", title: "Final fittings" },
  { m: 1, cat: "Beauty", title: "Final beauty appointments" },
  { m: 1, cat: "Beauty", title: "Plan nails + hair for each event" },
  { m: 1, cat: "Shopping", title: "Pack event-specific items" },
  { m: 0.75, cat: "Admin", title: "Confirm all vendors" },
  { m: 0.75, cat: "Admin", title: "Organise documents" },
  { m: 0.25, cat: "Beauty", title: "No experimental skincare from here" },
  { m: 0.2, cat: "Beauty", title: "Final beauty appointments" },
  { m: 0.15, cat: "Admin", title: "Pack + run through checklists" },
  { m: 0.1, cat: "Wellness", title: "Pack an emergency kit" },
  { m: 0.08, cat: "Wellness", title: "Protect rest + recovery time" },
  { m: 0.05, cat: "Admin", title: "Final vendor confirmations" },
];

function stageForMonths(m) {
  if (m >= 9) return { key: "9-12", label: "9–12 months before" };
  if (m >= 6) return { key: "6", label: "6 months before" };
  if (m >= 3) return { key: "3", label: "3 months before" };
  if (m >= 1) return { key: "1", label: "1 month before" };
  return { key: "final", label: "Final week" };
}

function buildTasks(weddingDateStr) {
  const wedding = new Date(weddingDateStr);
  return TASK_TEMPLATE.map((t) => {
    const due = new Date(wedding);
    due.setDate(due.getDate() - Math.round(t.m * 30));
    return {
      id: uid(),
      title: t.title,
      category: t.cat,
      monthsBefore: t.m,
      due: due.toISOString(),
      stage: stageForMonths(t.m).key,
      done: false,
    };
  });
}

const DEFAULT_CATEGORIES = [
  "Outfits", "Art Jewellery", "Real Jewellery", "Beauty", "Skincare",
  "Haircare", "Fitness", "Health", "Nutrition", "Accessories",
  "Shopping", "Honeymoon", "Misc",
];

function emptyData(profile) {
  return {
    profile,
    tasks: buildTasks(profile.weddingDate),
    expenses: [],
    places: [],
    photos: { actual: [], inspo: [] },
    budgetByCategory: {},
    beautyTasks: [
      { id: uid(), group: "Skin", title: "Book a starter facial", done: false },
      { id: uid(), group: "Hair", title: "Trial haircut + colour consult", done: false },
      { id: uid(), group: "Nails", title: "Pick a nail look reference", done: false },
      { id: uid(), group: "Makeup", title: "Shortlist 3 makeup artists", done: false },
    ],
    habits: [
      { id: uid(), title: "Workout", target: 3, unit: "sessions/week", log: [] },
      { id: uid(), title: "Walk 8,000 steps", target: 7, unit: "days/week", log: [] },
      { id: uid(), title: "Amla", target: 2, unit: "times/week", log: [] },
    ],
  };
}

/* ---------------------------------------------------------------- */
/* Storage (Supabase, keyed by the logged-in user's id)               */
/* ---------------------------------------------------------------- */
async function loadData(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("bride_a_do_data")
      .select("data")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.data;
  } catch {
    return null;
  }
}

async function saveData(userId, data) {
  if (!supabase || !userId) return;
  try {
    await supabase
      .from("bride_a_do_data")
      .upsert({ id: userId, data, updated_at: new Date().toISOString() });
  } catch {
    /* ignore — local state still works, it just won't persist */
  }
}

/* ---------------------------------------------------------------- */
/* Small UI atoms                                                    */
/* ---------------------------------------------------------------- */
function Progress({ value, color = T.wine }) {
  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: T.line }}>
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}

const PIE_COLORS = [T.wine, T.butter, T.moss, "#B4453D", "#8C6A4E", "#6B7A5E", "#9B4F63", "#5B7B8C", "#C98A3E", "#4A4458", "#7A8B4F", "#5B5964", "#A9744F"];

function CategoryPie({ expenses }) {
  const data = DEFAULT_CATEGORIES
    .map((c) => ({
      name: c,
      value: expenses.filter((e) => e.category === c && e.status === "purchased").reduce((s, e) => s + (Number(e.actual) || 0), 0),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, c) => s + c.value, 0);

  if (data.length === 0) {
    return <p className="text-sm" style={{ color: T.inkSoft }}>Log a purchase in Money and your spend breakdown will show up here.</p>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div style={{ width: 160, height: 160 }} className="flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
              {data.map((c, i) => <Cell key={c.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <RTooltip
              formatter={(value) => INR(value)}
              contentStyle={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 w-full flex flex-col gap-1.5">
        {data.map((c, i) => (
          <div key={c.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="truncate" style={{ color: T.ink }}>{c.name}</span>
            </div>
            <span style={{ color: T.inkSoft }} className="flex-shrink-0 ml-2">{INR(c.value)} · {Math.round((c.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function spentBreakdown(expenses) {
  const purchased = expenses.filter((e) => e.status === "purchased");
  const paid = purchased.reduce((s, e) => s + Math.max(0, (Number(e.actual) || 0) - (Number(e.balanceAmount) || 0)), 0);
  const pending = purchased.reduce((s, e) => s + (Number(e.balanceAmount) || 0), 0);
  return { paid, pending, total: paid + pending };
}

function SpentBar({ paid, pending, budgetTotal }) {
  const [active, setActive] = useState(false);
  const denom = Math.max(1, budgetTotal || paid + pending);
  const paidPct = Math.min(100, (paid / denom) * 100);
  const pendingPct = Math.min(100 - paidPct, (pending / denom) * 100);
  return (
    <div className="relative">
      <div
        className="w-full h-1.5 rounded-full flex overflow-hidden cursor-pointer"
        style={{ background: T.line }}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onClick={() => setActive((a) => !a)}
      >
        {paidPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${paidPct}%`, background: T.wine }} />}
        {pendingPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${pendingPct}%`, background: T.butter }} />}
      </div>
      {active && (pending > 0 || paid > 0) && (
        <div
          className="absolute left-0 top-full mt-2 z-10 rounded-lg border px-3 py-2 shadow-sm whitespace-nowrap"
          style={{ background: T.paper, borderColor: T.line }}
        >
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: T.wine }} />
            <span style={{ color: T.ink }}>Paid</span>
            <span style={{ color: T.inkSoft }}>{INR(paid)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: T.butter }} />
            <span style={{ color: T.ink }}>Pending</span>
            <span style={{ color: T.inkSoft }}>{INR(pending)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ icon: Icon, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="p-2 rounded-full hover:bg-black/5 transition-colors"
    >
      <Icon size={16} style={{ color: T.inkSoft }} />
    </button>
  );
}

const MAX_ATTACHMENT_BYTES = 1_500_000; // ~1.5MB — this is a browser prototype, attachments are stored inline

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function AttachmentUploader({ attachments = [], onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  const handleFiles = async (fileList) => {
    setError("");
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" is too large for this prototype (max ~1.5MB) — try a smaller photo or a compressed scan.`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        onAdd({ id: uid(), name: file.name, type: file.type, dataUrl });
      } catch {
        setError(`Couldn't read "${file.name}".`);
      }
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <div key={a.id} className="relative w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: T.line }}>
            {a.type?.startsWith("image") ? (
              <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1" style={{ background: T.paperDim }}>
                <FileText size={14} style={{ color: T.inkSoft }} />
                <span className="text-[8px] leading-none text-center truncate w-full" style={{ color: T.inkSoft }}>{a.name}</span>
              </div>
            )}
            <button
              onClick={() => onRemove(a.id)}
              aria-label="Remove attachment"
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: "rgba(23,22,27,0.6)" }}
            >
              <X size={9} color="white" />
            </button>
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-14 h-14 rounded-lg border border-dashed flex items-center justify-center flex-shrink-0"
          style={{ borderColor: T.inkSoft }}
          aria-label="Add photo or invoice"
        >
          <Plus size={16} style={{ color: T.inkSoft }} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = null; }}
        />
      </div>
      {error && <p className="text-[10px] mt-1.5" style={{ color: "#B4453D" }}>{error}</p>}
    </div>
  );
}

function PhotoGallery({ photos = [], onAdd, onRemove, placeholder }) {
  const inputRef = useRef(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");

  const handleFiles = async (fileList) => {
    setError("");
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" is too large for this prototype (max ~1.5MB).`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        setError(`"${file.name}" isn't an image.`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        onAdd({ id: uid(), name: caption.trim() || file.name, type: file.type, dataUrl });
      } catch {
        setError(`Couldn't read "${file.name}".`);
      }
    }
    setCaption("");
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Label (optional) — e.g. Bridal nails idea"
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: T.line }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg text-white flex-shrink-0"
          style={{ background: T.wine }}
        >
          <Plus size={14} /> Add
        </button>
        <input
          ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = null; }}
        />
      </div>
      {error && <p className="text-[10px] mb-2" style={{ color: "#B4453D" }}>{error}</p>}
      {photos.length === 0 ? (
        <p className="text-sm" style={{ color: T.inkSoft }}>{placeholder}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border group" style={{ borderColor: T.line }}>
              <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover" />
              {p.name && (
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] truncate" style={{ background: "rgba(23,22,27,0.55)", color: "white" }}>
                  {p.name}
                </div>
              )}
              <button
                onClick={() => onRemove(p.id)}
                aria-label="Remove photo"
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(23,22,27,0.6)" }}
              >
                <X size={10} color="white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Landing                                                            */
/* ---------------------------------------------------------------- */
function Landing({ onStart, onSignIn }) {
  return (
    <div style={{ background: T.paper, minHeight: "100%", ...sans }} className="w-full">
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <div className="flex items-center justify-between mb-20">
          <span style={{ ...serif, color: T.ink }} className="text-lg tracking-tight">Bride-a-do</span>
          <button
            onClick={onSignIn}
            className="text-sm px-4 py-2 rounded-full border transition-colors"
            style={{ borderColor: T.ink, color: T.ink }}
          >
            Sign in
          </button>
        </div>

        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-6" style={{ color: T.wine }}>
            <Sparkles size={16} />
            <span className="text-sm">For the bride, not just the wedding</span>
          </div>
          <h1
            style={{ ...serif, color: T.ink, lineHeight: 1.05 }}
            className="text-5xl sm:text-6xl mb-6"
          >
            The operating system for your bridal era.
          </h1>
          <p style={{ color: T.inkSoft }} className="text-lg leading-relaxed mb-10 max-w-lg">
            A wedding is one day. Being a bride is a months-long project. Bride-a-do
            brings your timeline, budget, shopping, outfits, jewellery and prep
            into one place — instead of ten apps and a spreadsheet.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-6 py-3 rounded-full text-white transition-transform hover:-translate-y-0.5"
              style={{ background: T.wine }}
            >
              Build my Bride-a-do <ArrowRight size={16} />
            </button>
            <button className="text-sm underline underline-offset-4" style={{ color: T.ink }}>
              See how it works
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-px mt-24 rounded-2xl overflow-hidden" style={{ background: T.line }}>
          {[
            { icon: Calendar, title: "Your timeline", body: "A prep plan built from your wedding date — what to do, when." },
            { icon: Wallet, title: "Your money", body: "One place to track what you've spent, and what's left." },
            { icon: MapPin, title: "Your shopping", body: "Every store, appointment and receipt, saved and searchable." },
          ].map((f, i) => (
            <div key={i} className="p-8" style={{ background: T.paper }}>
              <f.icon size={20} style={{ color: T.wine }} className="mb-4" />
              <div style={{ ...serif, color: T.ink }} className="text-lg mb-2">{f.title}</div>
              <div style={{ color: T.inkSoft }} className="text-sm leading-relaxed">{f.body}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm mt-16" style={{ color: T.inkSoft }}>
          Because apparently getting married requires project management.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Onboarding                                                         */
/* ---------------------------------------------------------------- */
const INTEREST_OPTIONS = ["Shopping", "Beauty", "Fitness", "Wellness", "Budget", "Outfits", "Jewellery", "Wedding admin"];

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", weddingDate: "", city: "", interests: [],
  });
  const steps = ["Your name", "Wedding date", "City", "Focus"];

  const toggleInterest = (i) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(i)
        ? f.interests.filter((x) => x !== i)
        : [...f.interests, i],
    }));

  const canNext = [
    form.name.trim().length > 0,
    !!form.weddingDate,
    form.city.trim().length > 0,
    form.interests.length > 0,
  ][step];

  return (
    <div style={{ background: T.paper, minHeight: "100%", ...sans }} className="w-full flex flex-col">
      <div className="max-w-md mx-auto w-full px-6 pt-12 pb-24 flex-1 flex flex-col">
        <div className="flex gap-1.5 mb-12">
          {steps.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? T.wine : T.line }} />
          ))}
        </div>

        <div className="flex-1">
          {step === 0 && (
            <div>
              <h2 style={{ ...serif, color: T.ink }} className="text-2xl mb-2">What should we call you?</h2>
              <p style={{ color: T.inkSoft }} className="text-sm mb-8">First name is enough.</p>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Purva"
                className="w-full text-lg px-4 py-3 rounded-xl border outline-none focus:ring-2"
                style={{ borderColor: T.line, background: "white" }}
              />
            </div>
          )}
          {step === 1 && (
            <div>
              <h2 style={{ ...serif, color: T.ink }} className="text-2xl mb-2">When's the big day?</h2>
              <p style={{ color: T.inkSoft }} className="text-sm mb-8">We'll build your timeline from this.</p>
              <input
                type="date"
                autoFocus
                value={form.weddingDate}
                onChange={(e) => setForm({ ...form, weddingDate: e.target.value })}
                className="w-full text-lg px-4 py-3 rounded-xl border outline-none focus:ring-2"
                style={{ borderColor: T.line, background: "white" }}
              />
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 style={{ ...serif, color: T.ink }} className="text-2xl mb-2">Which city?</h2>
              <p style={{ color: T.inkSoft }} className="text-sm mb-8">So we can tailor shopping suggestions later.</p>
              <input
                autoFocus
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Bengaluru"
                className="w-full text-lg px-4 py-3 rounded-xl border outline-none focus:ring-2"
                style={{ borderColor: T.line, background: "white" }}
              />
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 style={{ ...serif, color: T.ink }} className="text-2xl mb-2">What do you want help with?</h2>
              <p style={{ color: T.inkSoft }} className="text-sm mb-8">Pick as many as you like.</p>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const active = form.interests.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleInterest(opt)}
                      className="px-4 py-2 rounded-full text-sm border transition-colors"
                      style={{
                        borderColor: active ? T.wine : T.line,
                        background: active ? T.wine : "white",
                        color: active ? "white" : T.ink,
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-10">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`flex items-center gap-1 text-sm ${step === 0 ? "invisible" : ""}`}
            style={{ color: T.inkSoft }}
          >
            <ChevronLeft size={16} /> Back
          </button>
          <button
            disabled={!canNext}
            onClick={() => {
              if (step < steps.length - 1) setStep((s) => s + 1);
              else onComplete(form);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm disabled:opacity-30 transition-opacity"
            style={{ background: T.wine }}
          >
            {step < steps.length - 1 ? "Continue" : "Build my Bride-a-do"} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Shell (nav)                                                        */
/* ---------------------------------------------------------------- */
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "timeline", label: "Timeline", icon: Calendar },
  { key: "money", label: "Money", icon: Wallet },
  { key: "shopping", label: "Shopping", icon: MapPin },
  { key: "mybride", label: "My Bride", icon: Heart },
  { key: "vault", label: "Vault", icon: Archive },
];

function Shell({ view, setView, children, name, daysToGo, onSignOut }) {
  return (
    <div style={{ background: T.paperDim, minHeight: "100%", ...sans }} className="w-full flex flex-col sm:flex-row">
      {/* Desktop rail */}
      <div
        className="hidden sm:flex sm:flex-col w-56 flex-shrink-0 border-r px-4 py-6"
        style={{ borderColor: T.line, background: T.paper }}
      >
        <div className="flex items-center gap-2 px-2 mb-8">
          <span style={{ ...serif, color: T.ink }} className="text-lg">Bride-a-do</span>
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left"
              style={{
                background: view === n.key ? T.wine : "transparent",
                color: view === n.key ? "white" : T.inkSoft,
              }}
            >
              <n.icon size={16} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 rounded-lg" style={{ background: T.paperDim }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: T.inkSoft }}>{name}</span>
            <button onClick={onSignOut} className="text-[10px] underline underline-offset-2" style={{ color: T.inkSoft }}>
              Sign out
            </button>
          </div>
          <div style={{ ...serif, color: T.ink }} className="text-xl">{daysToGo}<span className="text-xs ml-1" style={{...sans, color: T.inkSoft}}>days to go</span></div>
        </div>
      </div>

      {/* Mobile top bar */}
      <div
        className="sm:hidden flex items-center justify-between px-5 py-4 border-b"
        style={{ background: T.paper, borderColor: T.line }}
      >
        <span style={{ ...serif, color: T.ink }} className="text-lg">Bride-a-do</span>
        <button onClick={onSignOut} className="text-xs underline underline-offset-2" style={{ color: T.inkSoft }}>
          Sign out
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-20 sm:pb-0">{children}</div>

      {/* Mobile bottom tabs */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 flex justify-around border-t py-2 z-20"
        style={{ background: T.paper, borderColor: T.line }}
      >
        {NAV.map((n) => (
          <button key={n.key} onClick={() => setView(n.key)} className="flex flex-col items-center gap-1 px-2 py-1">
            <n.icon size={18} style={{ color: view === n.key ? T.wine : T.inkSoft }} />
            <span className="text-[10px]" style={{ color: view === n.key ? T.wine : T.inkSoft }}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PageHeader({ title, sub }) {
  return (
    <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6">
      <h1 style={{ ...serif, color: T.ink }} className="text-3xl mb-1">{title}</h1>
      {sub && <p style={{ color: T.inkSoft }} className="text-sm">{sub}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                          */
/* ---------------------------------------------------------------- */
function Dashboard({ data, setData, daysToGo }) {
  const { profile, tasks, expenses, beautyTasks, habits } = data;

  const upcoming = useMemo(() => {
    const today = new Date();
    return tasks
      .filter((t) => !t.done && new Date(t.due) >= new Date(today.getTime() - 6 * 86400000))
      .sort((a, b) => new Date(a.due) - new Date(b.due))
      .slice(0, 5);
  }, [tasks]);

  const spent = expenses.filter((e) => e.status === "purchased").reduce((s, e) => s + (Number(e.actual) || 0), 0);
  const { paid: paidAmt, pending: pendingAmt } = spentBreakdown(expenses);
  const outfitEntries = expenses.filter((e) => e.category === "Outfits");
  const outfitsDone = outfitEntries.filter((o) => o.status === "purchased").length;
  const beautyDone = beautyTasks.filter((b) => b.done).length;
  const workoutHabit = habits.find((h) => h.title === "Workout");
  const workoutCount = workoutHabit ? workoutHabit.log.length : 0;

  const toggleTask = (id) =>
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));

  return (
    <div>
      <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-2">
        <p className="text-sm" style={{ color: T.inkSoft }}>Good morning, {profile.name} 👋</p>
        <h1 style={{ ...serif, color: T.ink }} className="text-5xl mt-2 mb-1">{daysToGo} days to go</h1>
        <p className="text-sm" style={{ color: T.wine }}>You're officially in your bridal era.</p>
      </div>

      <div className="px-6 sm:px-10 grid sm:grid-cols-2 gap-6 mt-8">
        {/* This week */}
        <div className="rounded-2xl p-6 border" style={{ background: T.paper, borderColor: T.line }}>
          <div className="text-xs tracking-wide mb-4" style={{ color: T.inkSoft }}>This week</div>
          {upcoming.length === 0 && <p className="text-sm" style={{ color: T.inkSoft }}>Nothing urgent — see your full timeline.</p>}
          <div className="flex flex-col gap-3">
            {upcoming.map((t) => (
              <button key={t.id} onClick={() => toggleTask(t.id)} className="flex items-center gap-3 text-left group">
                <span
                  className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: t.done ? T.moss : T.inkSoft, background: t.done ? T.moss : "transparent" }}
                >
                  {t.done && <Check size={10} color="white" />}
                </span>
                <span className="text-sm" style={{ color: t.done ? T.inkSoft : T.ink, textDecoration: t.done ? "line-through" : "none" }}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Your Bride-a-do stats */}
        <div className="rounded-2xl p-6 border flex flex-col gap-5" style={{ background: T.paper, borderColor: T.line }}>
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Your Bride-a-do</div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span style={{ color: T.ink }}>{INR(spent)}</span>
              <span style={{ color: T.inkSoft }}>{pendingAmt > 0 ? `${INR(pendingAmt)} pending` : "spent"}</span>
            </div>
            <SpentBar paid={paidAmt} pending={pendingAmt} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span style={{ color: T.ink }}>{outfitsDone} / {outfitEntries.length || 0}</span>
              <span style={{ color: T.inkSoft }}>outfits sorted</span>
            </div>
            <Progress value={(outfitsDone / Math.max(1, outfitEntries.length)) * 100} color={T.butter} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span style={{ color: T.ink }}>{beautyDone} / {beautyTasks.length}</span>
              <span style={{ color: T.inkSoft }}>beauty tasks done</span>
            </div>
            <Progress value={(beautyDone / Math.max(1, beautyTasks.length)) * 100} color={T.moss} />
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: T.ink }}>Workouts</span>
            <span style={{ color: T.inkSoft }}>{workoutCount} / {workoutHabit?.target || 3} this week</span>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-10 mt-6">
        <div className="rounded-2xl p-6 border" style={{ background: T.paper, borderColor: T.line }}>
          <div className="text-xs tracking-wide mb-4" style={{ color: T.inkSoft }}>Spend by category</div>
          <CategoryPie expenses={expenses} />
        </div>
      </div>

      <div className="px-6 sm:px-10 mt-8 pb-10">
        <div className="text-xs tracking-wide mb-3" style={{ color: T.inkSoft }}>Coming up</div>
        <div className="rounded-2xl border divide-y" style={{ borderColor: T.line, background: T.paper }}>
          {tasks
            .filter((t) => !t.done)
            .sort((a, b) => new Date(a.due) - new Date(b.due))
            .slice(0, 4)
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3.5" style={{ borderColor: T.line }}>
                <span className="text-sm" style={{ color: T.ink }}>{t.title}</span>
                <span className="text-xs" style={{ color: T.inkSoft }}>{fmtDate(new Date(t.due))}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Timeline                                                           */
/* ---------------------------------------------------------------- */
const STAGE_ORDER = ["9-12", "6", "3", "1", "final"];
const STAGE_LABEL = { "9-12": "9–12 months before", "6": "6 months before", "3": "3 months before", "1": "1 month before", final: "Final week" };

function Timeline({ data, setData }) {
  const toggleTask = (id) =>
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));

  return (
    <div>
      <PageHeader title="Your timeline" sub="Built from your wedding date. Check things off as you go." />
      <div className="px-6 sm:px-10 pb-16 flex flex-col gap-8">
        {STAGE_ORDER.map((stageKey) => {
          const items = data.tasks.filter((t) => t.stage === stageKey).sort((a, b) => new Date(b.due) - new Date(a.due));
          if (items.length === 0) return null;
          const done = items.filter((t) => t.done).length;
          return (
            <div key={stageKey}>
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ ...serif, color: T.ink }} className="text-lg">{STAGE_LABEL[stageKey]}</h3>
                <span className="text-xs" style={{ color: T.inkSoft }}>{done}/{items.length}</span>
              </div>
              <div className="rounded-2xl border divide-y" style={{ borderColor: T.line, background: T.paper }}>
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTask(t.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                  >
                    <span
                      className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                      style={{ borderColor: t.done ? T.moss : T.inkSoft, background: t.done ? T.moss : "transparent" }}
                    >
                      {t.done && <Check size={10} color="white" />}
                    </span>
                    <span
                      className="text-sm flex-1"
                      style={{ color: t.done ? T.inkSoft : T.ink, textDecoration: t.done ? "line-through" : "none" }}
                    >
                      {t.title}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: T.paperDim, color: T.inkSoft }}
                    >
                      {t.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Money                                                              */
/* ---------------------------------------------------------------- */
function PurchaseFields({ form, setForm, category }) {
  const bill = Number(form.billAmount) || 0;
  const paidInFull = form.paidInFull !== false;
  const advance = paidInFull ? bill : (Number(form.advancePaid) || 0);
  const balance = paidInFull ? 0 : Math.max(0, bill - advance);
  const isOutfit = category === "Outfits";
  return (
    <>
      <input
        placeholder="Bill amount" type="number" value={form.billAmount}
        onChange={(e) => setForm({ ...form, billAmount: e.target.value })}
        className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}
      />
      <div className="flex gap-2">
        <button
          type="button" onClick={() => setForm({ ...form, paidInFull: true })}
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          style={{
            borderColor: paidInFull ? T.wine : T.line,
            background: paidInFull ? T.wine : "white",
            color: paidInFull ? "white" : T.ink,
          }}
        >
          Paid in full
        </button>
        <button
          type="button" onClick={() => setForm({ ...form, paidInFull: false })}
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          style={{
            borderColor: !paidInFull ? T.wine : T.line,
            background: !paidInFull ? T.wine : "white",
            color: !paidInFull ? "white" : T.ink,
          }}
        >
          Partly paid
        </button>
      </div>
      {!paidInFull && (
        <>
          <input
            placeholder="Advance paid" type="number" value={form.advancePaid}
            onChange={(e) => setForm({ ...form, advancePaid: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}
          />
          <div className="px-3 py-2 rounded-lg border text-sm flex items-center justify-between" style={{ borderColor: T.line, background: T.paperDim }}>
            <span style={{ color: T.inkSoft }}>Balance</span>
            <span style={{ color: T.ink }}>{INR(balance)}</span>
          </div>
        </>
      )}
      <div>
        <label className="text-xs block mb-1" style={{ color: T.inkSoft }}>Date of collection</label>
        <input
          type="date" value={form.collectionDate}
          onChange={(e) => setForm({ ...form, collectionDate: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}
        />
      </div>
      {isOutfit && (
        <div className="sm:col-span-2 grid sm:grid-cols-2 gap-3">
          <input
            placeholder="Event (e.g. Reception)" value={form.event || ""}
            onChange={(e) => setForm({ ...form, event: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm sm:col-span-2" style={{ borderColor: T.line }}
          />
          <div className="sm:col-span-2">
            <label className="text-xs block mb-1" style={{ color: T.inkSoft }}>Given for alteration?</label>
            <div className="flex gap-2">
              <button
                type="button" onClick={() => setForm({ ...form, givenForAlteration: true })}
                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                style={{
                  borderColor: form.givenForAlteration ? T.wine : T.line,
                  background: form.givenForAlteration ? T.wine : "white",
                  color: form.givenForAlteration ? "white" : T.ink,
                }}
              >
                Yes
              </button>
              <button
                type="button" onClick={() => setForm({ ...form, givenForAlteration: false })}
                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                style={{
                  borderColor: !form.givenForAlteration ? T.wine : T.line,
                  background: !form.givenForAlteration ? T.wine : "white",
                  color: !form.givenForAlteration ? "white" : T.ink,
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Money({ data, setData }) {
  const [formMode, setFormMode] = useState(null); // null | "plan" | "log"
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [planForm, setPlanForm] = useState({ item: "", category: DEFAULT_CATEGORIES[0], store: "", expected: "" });
  const [logForm, setLogForm] = useState({
    item: "", category: DEFAULT_CATEGORIES[0], store: "", event: "",
    billAmount: "", advancePaid: "", paidInFull: true, collectionDate: "", givenForAlteration: false,
  });
  const [convertingId, setConvertingId] = useState(null);
  const [convertForm, setConvertForm] = useState({ billAmount: "", advancePaid: "", paidInFull: true, collectionDate: "", givenForAlteration: false, event: "" });

  const spent = data.expenses.filter((e) => e.status === "purchased").reduce((s, e) => s + (Number(e.actual) || 0), 0);
  const { paid: paidAmt, pending: pendingAmt } = spentBreakdown(data.expenses);
  const plannedTotal = data.expenses.filter((e) => e.status === "planned").reduce((s, e) => s + (Number(e.expected) || 0), 0);
  const byCategory = DEFAULT_CATEGORIES.map((c) => ({
    name: c,
    allocated: data.budgetByCategory?.[c] || 0,
    spent: data.expenses.filter((e) => e.category === c && e.status === "purchased").reduce((s, e) => s + (Number(e.actual) || 0), 0),
  })).filter((c) => c.spent > 0 || c.allocated > 0);

  const setCategoryBudget = (cat, val) => setData((d) => ({
    ...d,
    budgetByCategory: { ...d.budgetByCategory, [cat]: Number(val) || 0 },
  }));

  const addPlanned = () => {
    if (!planForm.item.trim()) return;
    setData((d) => ({
      ...d,
      expenses: [...d.expenses, { id: uid(), ...planForm, expected: Number(planForm.expected) || 0, actual: 0, status: "planned", date: new Date().toISOString(), attachments: [] }],
    }));
    setPlanForm({ item: "", category: DEFAULT_CATEGORIES[0], store: "", expected: "" });
    setFormMode(null);
  };

  const addLogged = () => {
    if (!logForm.item.trim()) return;
    const bill = Number(logForm.billAmount) || 0;
    const advance = logForm.paidInFull ? bill : (Number(logForm.advancePaid) || 0);
    const balance = logForm.paidInFull ? 0 : Math.max(0, bill - advance);
    const isOutfit = logForm.category === "Outfits";
    setData((d) => ({
      ...d,
      expenses: [...d.expenses, {
        id: uid(), item: logForm.item, category: logForm.category, store: logForm.store,
        actual: bill, advancePaid: advance, balanceAmount: balance,
        collectionDate: logForm.collectionDate,
        event: isOutfit ? logForm.event : "",
        givenForAlteration: isOutfit ? logForm.givenForAlteration : false,
        expected: 0, status: "purchased", date: new Date().toISOString(), attachments: [],
      }],
    }));
    setLogForm({ item: "", category: DEFAULT_CATEGORIES[0], store: "", event: "", billAmount: "", advancePaid: "", paidInFull: true, collectionDate: "", givenForAlteration: false });
    setFormMode(null);
  };

  const confirmPurchase = (id, category) => {
    const bill = Number(convertForm.billAmount) || 0;
    const advance = convertForm.paidInFull ? bill : (Number(convertForm.advancePaid) || 0);
    const balance = convertForm.paidInFull ? 0 : Math.max(0, bill - advance);
    const isOutfit = category === "Outfits";
    setData((d) => ({
      ...d,
      expenses: d.expenses.map((e) => e.id === id ? {
        ...e, status: "purchased", actual: bill, advancePaid: advance,
        balanceAmount: balance, collectionDate: convertForm.collectionDate,
        event: isOutfit ? convertForm.event : "",
        givenForAlteration: isOutfit ? convertForm.givenForAlteration : false,
      } : e),
    }));
    setConvertingId(null);
    setConvertForm({ billAmount: "", advancePaid: "", paidInFull: true, collectionDate: "", givenForAlteration: false, event: "" });
  };

  const removeExpense = (id) => setData((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));

  const planned = data.expenses.filter((e) => e.status === "planned");
  const purchased = data.expenses.filter((e) => e.status === "purchased");

  return (
    <div>
      <PageHeader title="Money" sub="Everything you're spending on your bridal era, in one place." />
      <div className="px-6 sm:px-10">
        <div className="rounded-2xl p-6 border mb-8" style={{ background: T.paper, borderColor: T.line }}>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ ...serif, color: T.ink }} className="text-xl">{INR(spent)}</span>
            <span style={{ color: T.inkSoft }}>total spent</span>
          </div>
          <SpentBar paid={paidAmt} pending={pendingAmt} />
          <div className="flex justify-between text-xs mt-2">
            {pendingAmt > 0 && <span style={{ color: "#B4453D" }}>{INR(pendingAmt)} balance pending</span>}
            {plannedTotal > 0 && <span style={{ color: T.butter }}>{INR(plannedTotal)} planned, not yet spent</span>}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>By category</div>
          <button onClick={() => setShowBudgetForm((s) => !s)} className="text-xs underline underline-offset-4" style={{ color: T.inkSoft }}>
            {showBudgetForm ? "Done" : "Set category budgets"}
          </button>
        </div>

        {showBudgetForm && (
          <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: T.line, background: T.paper }}>
            <p className="text-xs mb-3" style={{ color: T.inkSoft }}>Optional — set a target for any category you want to track against. Leave the rest blank.</p>
            <div className="grid sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {DEFAULT_CATEGORIES.map((cat) => (
                <div key={cat} className="flex items-center justify-between gap-3">
                  <label className="text-sm flex-shrink-0" style={{ color: T.ink }}>{cat}</label>
                  <div className="relative w-28">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.inkSoft }}>₹</span>
                    <input
                      type="number"
                      value={data.budgetByCategory?.[cat] || ""}
                      onChange={(e) => setCategoryBudget(cat, e.target.value)}
                      placeholder="0"
                      className="w-full text-sm pl-6 pr-2 py-1.5 rounded-lg border outline-none text-right"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {byCategory.length > 0 && (
          <div className="mb-8 grid sm:grid-cols-2 gap-3">
            {byCategory.map((c) => {
              const over = c.allocated > 0 && c.spent > c.allocated;
              return (
                <div key={c.name} className="rounded-xl border p-3.5" style={{ borderColor: T.line, background: T.paper }}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: T.ink }}>{c.name}</span>
                    <span style={{ color: over ? "#B4453D" : T.inkSoft }}>
                      {INR(c.spent)}{c.allocated > 0 ? ` / ${INR(c.allocated)}` : ""}
                    </span>
                  </div>
                  {c.allocated > 0 && (
                    <Progress value={(c.spent / c.allocated) * 100} color={over ? "#B4453D" : T.wine} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Expenses</div>
          <div className="flex gap-2">
            <button
              onClick={() => setFormMode(formMode === "plan" ? null : "plan")}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border"
              style={{ borderColor: T.wine, color: T.wine }}
            >
              <Plus size={14} /> Plan a purchase
            </button>
            <button
              onClick={() => setFormMode(formMode === "log" ? null : "log")}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full text-white"
              style={{ background: T.wine }}
            >
              <Plus size={14} /> Log a purchase
            </button>
          </div>
        </div>

        {formMode === "plan" && (
          <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: T.line, background: T.paper }}>
            <p className="text-xs mb-3" style={{ color: T.inkSoft }}>Something you're planning to buy — a quote, an estimate. Not paid for yet.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input placeholder="Item (e.g. Reception lehenga)" value={planForm.item} onChange={(e) => setPlanForm({ ...planForm, item: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
              <select value={planForm.category} onChange={(e) => setPlanForm({ ...planForm, category: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}>
                {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Store / vendor" value={planForm.store} onChange={(e) => setPlanForm({ ...planForm, store: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
              <input placeholder="Expected / quoted price" type="number" value={planForm.expected} onChange={(e) => setPlanForm({ ...planForm, expected: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
              <button onClick={addPlanned} className="px-3 py-2 rounded-lg text-sm text-white sm:col-span-2" style={{ background: T.wine }}>Save plan</button>
            </div>
          </div>
        )}

        {formMode === "log" && (
          <div className="rounded-2xl border p-4 mb-4" style={{ borderColor: T.line, background: T.paper }}>
            <p className="text-xs mb-3" style={{ color: T.inkSoft }}>Something you've already bought.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input placeholder="Item (e.g. Reception lehenga)" value={logForm.item} onChange={(e) => setLogForm({ ...logForm, item: e.target.value })} className="px-3 py-2 rounded-lg border text-sm sm:col-span-2" style={{ borderColor: T.line }} />
              <select value={logForm.category} onChange={(e) => setLogForm({ ...logForm, category: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}>
                {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Store / vendor" value={logForm.store} onChange={(e) => setLogForm({ ...logForm, store: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
              <PurchaseFields form={logForm} setForm={setLogForm} category={logForm.category} />
              <button onClick={addLogged} className="px-3 py-2 rounded-lg text-sm text-white sm:col-span-2" style={{ background: T.wine }}>Save purchase</button>
            </div>
          </div>
        )}

        {planned.length > 0 && (
          <>
            <div className="text-xs mb-2" style={{ color: T.inkSoft }}>Planned</div>
            <div className="rounded-2xl border divide-y mb-6" style={{ borderColor: T.line, background: T.paper }}>
              {planned.slice().reverse().map((e) => (
                <div key={e.id} className="px-5 py-3.5">
                  {convertingId === e.id ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: T.ink }}>{e.item}</span>
                        <IconBtn icon={X} onClick={() => setConvertingId(null)} label="Cancel" />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <PurchaseFields form={convertForm} setForm={setConvertForm} category={e.category} />
                      </div>
                      <button
                        onClick={() => confirmPurchase(e.id, e.category)}
                        className="self-start text-xs px-4 py-2 rounded-full text-white"
                        style={{ background: T.moss }}
                      >
                        Confirm purchase
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm truncate" style={{ color: T.ink }}>{e.item}</div>
                        <div className="text-xs" style={{ color: T.inkSoft }}>{e.category}{e.store ? ` · ${e.store}` : ""} · quoted {INR(e.expected)}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setConvertingId(e.id); setConvertForm({ billAmount: String(e.expected || ""), advancePaid: "", paidInFull: true, collectionDate: "", givenForAlteration: false, event: "" }); }}
                          className="text-xs px-3 py-1.5 rounded-full border"
                          style={{ borderColor: T.line, color: T.ink }}
                        >
                          Mark as purchased
                        </button>
                        <IconBtn icon={Trash2} onClick={() => removeExpense(e.id)} label="Remove plan" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-xs mb-2" style={{ color: T.inkSoft }}>Purchased</div>
        <div className="rounded-2xl border divide-y mb-16" style={{ borderColor: T.line, background: T.paper }}>
          {purchased.length === 0 && <div className="px-5 py-6 text-sm" style={{ color: T.inkSoft }}>No purchases logged yet.</div>}
          {purchased.slice().reverse().map((e) => (
            <div key={e.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: T.ink }}>{e.item}</div>
                  <div className="text-xs" style={{ color: T.inkSoft }}>{e.category}{e.store ? ` · ${e.store}` : ""}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm" style={{ color: T.ink }}>{INR(e.actual)}</span>
                  <IconBtn icon={Trash2} onClick={() => removeExpense(e.id)} label="Remove expense" />
                </div>
              </div>
              {(e.advancePaid > 0 || e.balanceAmount > 0 || e.collectionDate || e.givenForAlteration) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                  {e.advancePaid > 0 && <span style={{ color: T.inkSoft }}>Advance {INR(e.advancePaid)}</span>}
                  {e.balanceAmount > 0 && <span style={{ color: "#B4453D" }}>Balance {INR(e.balanceAmount)}</span>}
                  {e.collectionDate && <span style={{ color: T.inkSoft }}>Pickup {fmtDate(new Date(e.collectionDate))}</span>}
                  {e.category === "Outfits" && e.givenForAlteration && <span style={{ color: T.wine }}>Given for alteration</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Shopping                                                           */
/* ---------------------------------------------------------------- */
const PLACE_CATEGORIES = ["Bridalwear", "Jewellery", "Shoes", "Beauty", "Tailor", "Accessories", "Other"];

function Shopping({ data, setData }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: PLACE_CATEGORIES[0], area: "", budget: "", notes: "" });

  const addPlace = () => {
    if (!form.name.trim()) return;
    setData((d) => ({ ...d, places: [...d.places, { id: uid(), ...form, visited: false, purchased: false }] }));
    setForm({ name: "", category: PLACE_CATEGORIES[0], area: "", budget: "", notes: "" });
    setShowForm(false);
  };
  const toggle = (id, field) => setData((d) => ({ ...d, places: d.places.map((p) => p.id === id ? { ...p, [field]: !p[field] } : p) }));
  const remove = (id) => setData((d) => ({ ...d, places: d.places.filter((p) => p.id !== id) }));

  return (
    <div>
      <PageHeader title="Shopping" sub="Every store on your list — save it, note a budget, mark it done." />
      <div className="px-6 sm:px-10">
        {/* Bride Map teaser */}
        <div className="rounded-2xl border mb-8 overflow-hidden" style={{ borderColor: T.line }}>
          <div className="h-32 relative" style={{ background: `linear-gradient(135deg, ${T.paperDim}, ${T.line})` }}>
            {data.places.slice(0, 6).map((p, i) => (
              <div
                key={p.id}
                className="absolute w-2.5 h-2.5 rounded-full"
                style={{ background: T.wine, left: `${12 + (i * 37) % 80}%`, top: `${20 + (i * 53) % 60}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs px-3 py-1 rounded-full" style={{ background: T.paper, color: T.inkSoft }}>Bride Map · saved places near {data.profile.city}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Saved places</div>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full text-white" style={{ background: T.wine }}>
            <Plus size={14} /> Save a place
          </button>
        </div>

        {showForm && (
          <div className="rounded-2xl border p-4 mb-4 grid sm:grid-cols-2 gap-3" style={{ borderColor: T.line, background: T.paper }}>
            <input placeholder="Store name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }}>
              {PLACE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Area (e.g. Commercial Street)" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
            <input placeholder="Expected budget" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: T.line }} />
            <input placeholder="What you're looking for" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="px-3 py-2 rounded-lg border text-sm sm:col-span-2" style={{ borderColor: T.line }} />
            <button onClick={addPlace} className="px-3 py-2 rounded-lg text-sm text-white sm:col-span-2" style={{ background: T.wine }}>Save place</button>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 pb-16">
          {data.places.length === 0 && <p className="text-sm" style={{ color: T.inkSoft }}>Nothing saved yet. Add the first store on your list.</p>}
          {data.places.map((p) => (
            <div key={p.id} className="rounded-2xl border p-4" style={{ borderColor: T.line, background: T.paper }}>
              <div className="flex items-start justify-between mb-1">
                <div style={{ color: T.ink }} className="text-sm font-medium">{p.name}</div>
                <IconBtn icon={Trash2} onClick={() => remove(p.id)} label="Remove place" />
              </div>
              <div className="text-xs mb-3" style={{ color: T.inkSoft }}>{p.category}{p.area ? ` · ${p.area}` : ""}{p.budget ? ` · ${INR(p.budget)}` : ""}</div>
              {p.notes && <p className="text-xs mb-3" style={{ color: T.inkSoft }}>{p.notes}</p>}
              <div className="flex gap-2">
                <button onClick={() => toggle(p.id, "visited")} className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: p.visited ? T.moss : T.line, color: p.visited ? T.moss : T.inkSoft }}>
                  {p.visited ? "Visited ✓" : "Mark visited"}
                </button>
                <button onClick={() => toggle(p.id, "purchased")} className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: p.purchased ? T.moss : T.line, color: p.purchased ? T.moss : T.inkSoft }}>
                  {p.purchased ? "Purchased ✓" : "Mark purchased"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* My Bride (beauty / fitness / wellness / habits)                   */
/* ---------------------------------------------------------------- */
const BEAUTY_GROUPS = ["Skin", "Hair", "Nails", "Makeup"];
const GROUP_ICON = { Skin: Droplet, Hair: Scissors, Nails: Sparkles, Makeup: Heart };

function MyBride({ data, setData }) {
  const toggleBeauty = (id) => setData((d) => ({ ...d, beautyTasks: d.beautyTasks.map((b) => b.id === id ? { ...b, done: !b.done } : b) }));
  const logHabit = (id) => setData((d) => ({
    ...d,
    habits: d.habits.map((h) => h.id === id ? { ...h, log: [...h.log, new Date().toISOString()] } : h),
  }));
  const resetHabit = (id) => setData((d) => ({ ...d, habits: d.habits.map((h) => h.id === id ? { ...h, log: [] } : h) }));
  const addPhoto = (bucket, photo) => setData((d) => ({
    ...d,
    photos: { actual: d.photos?.actual || [], inspo: d.photos?.inspo || [], [bucket]: [...(d.photos?.[bucket] || []), photo] },
  }));
  const removePhoto = (bucket, id) => setData((d) => ({
    ...d,
    photos: { actual: d.photos?.actual || [], inspo: d.photos?.inspo || [], [bucket]: (d.photos?.[bucket] || []).filter((p) => p.id !== id) },
  }));

  return (
    <div>
      <PageHeader title="My Bride" sub="Beauty, fitness and wellness — organisational, not medical." />
      <div className="px-6 sm:px-10 pb-16">
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {BEAUTY_GROUPS.map((g) => {
            const Icon = GROUP_ICON[g];
            const items = data.beautyTasks.filter((b) => b.group === g);
            return (
              <div key={g} className="rounded-2xl border p-5" style={{ borderColor: T.line, background: T.paper }}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={15} style={{ color: T.wine }} />
                  <span style={{ ...serif, color: T.ink }} className="text-base">{g}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((b) => (
                    <button key={b.id} onClick={() => toggleBeauty(b.id)} className="flex items-center gap-2 text-left">
                      <span className="w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center" style={{ borderColor: b.done ? T.moss : T.inkSoft, background: b.done ? T.moss : "transparent" }}>
                        {b.done && <Check size={9} color="white" />}
                      </span>
                      <span className="text-sm" style={{ color: b.done ? T.inkSoft : T.ink, textDecoration: b.done ? "line-through" : "none" }}>{b.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Dumbbell size={15} style={{ color: T.wine }} />
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Fitness & wellness habits</div>
        </div>
        <p className="text-xs mb-4" style={{ color: T.inkSoft }}>Feel strong and energetic for the day — not about weight loss.</p>
        <div className="flex flex-col gap-3">
          {data.habits.map((h) => (
            <div key={h.id} className="rounded-2xl border p-4 flex items-center justify-between" style={{ borderColor: T.line, background: T.paper }}>
              <div>
                <div className="text-sm" style={{ color: T.ink }}>{h.title}</div>
                <div className="text-xs" style={{ color: T.inkSoft }}>{h.log.length} / {h.target} {h.unit}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => resetHabit(h.id)} className="text-xs px-2 py-1 rounded-full" style={{ color: T.inkSoft }}>Reset</button>
                <button onClick={() => logHabit(h.id)} className="text-xs px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ background: T.wine }}>
                  <Plus size={12} /> Log today
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 mt-10">
          <Images size={15} style={{ color: T.wine }} />
          <div className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Pictures</div>
        </div>

        <div className="flex items-center gap-2 mb-2 mt-5">
          <Pin size={13} style={{ color: T.inkSoft }} />
          <span className="text-sm" style={{ ...serif, color: T.ink }}>Inspo</span>
        </div>
        <p className="text-xs mb-3" style={{ color: T.inkSoft }}>Anything you're drawing from — outfits, nails, hairstyles, anything at all.</p>
        <PhotoGallery
          photos={data.photos?.inspo || []}
          onAdd={(p) => addPhoto("inspo", p)}
          onRemove={(id) => removePhoto("inspo", id)}
          placeholder="No inspo saved yet — screenshot something you love and add it here."
        />

        <div className="flex items-center gap-2 mb-2 mt-8">
          <Images size={13} style={{ color: T.inkSoft }} />
          <span className="text-sm" style={{ ...serif, color: T.ink }}>Actual</span>
        </div>
        <p className="text-xs mb-3" style={{ color: T.inkSoft }}>Trial photos and real results — how it actually turned out.</p>
        <PhotoGallery
          photos={data.photos?.actual || []}
          onAdd={(p) => addPhoto("actual", p)}
          onRemove={(id) => removePhoto("actual", id)}
          placeholder="No trial or result photos yet."
        />
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------- */
function Vault({ data, setData }) {
  const addAttachment = (expenseId, attachment) => setData((d) => ({
    ...d,
    expenses: d.expenses.map((e) => e.id === expenseId ? { ...e, attachments: [...(e.attachments || []), attachment] } : e),
  }));
  const removeAttachment = (expenseId, attachmentId) => setData((d) => ({
    ...d,
    expenses: d.expenses.map((e) => e.id === expenseId ? { ...e, attachments: (e.attachments || []).filter((a) => a.id !== attachmentId) } : e),
  }));

  const purchased = data.expenses.filter((e) => e.status === "purchased").slice().reverse();
  const outfits = purchased.filter((e) => e.category === "Outfits");
  const otherReceipts = purchased.filter((e) => e.category !== "Outfits");

  return (
    <div>
      <PageHeader title="Vault" sub="Every purchase you log in Money lands here — attach photos, invoices, whatever you need to keep." />
      <div className="px-6 sm:px-10 pb-16">
        <div className="flex items-center gap-2 mb-3">
          <Shirt size={15} style={{ color: T.wine }} />
          <span className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Outfits</span>
        </div>
        <div className="flex flex-col gap-3 mb-10">
          {outfits.length === 0 && (
            <p className="text-sm" style={{ color: T.inkSoft }}>Nothing yet — log an outfit purchase in Money and it'll show up here.</p>
          )}
          {outfits.map((e) => (
            <div key={e.id} className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-start gap-4" style={{ borderColor: T.line, background: T.paper }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: T.ink }}>{e.item}</div>
                <div className="text-xs mb-2" style={{ color: T.inkSoft }}>{e.event ? `${e.event} · ` : ""}{e.store ? `${e.store} · ` : ""}{INR(e.actual)}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {e.balanceAmount > 0 && <span style={{ color: "#B4453D" }}>Balance {INR(e.balanceAmount)}</span>}
                  {e.collectionDate && <span style={{ color: T.inkSoft }}>Pickup {fmtDate(new Date(e.collectionDate))}</span>}
                  {e.givenForAlteration && <span style={{ color: T.wine }}>Given for alteration</span>}
                </div>
              </div>
              <AttachmentUploader
                attachments={e.attachments || []}
                onAdd={(a) => addAttachment(e.id, a)}
                onRemove={(id) => removeAttachment(e.id, id)}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <FileText size={15} style={{ color: T.wine }} />
          <span className="text-xs tracking-wide" style={{ color: T.inkSoft }}>Receipts</span>
        </div>
        <p className="text-xs mb-4" style={{ color: T.inkSoft }}>Jewellery, beauty, everything else you've logged in Money.</p>
        <div className="flex flex-col gap-3 mb-10">
          {otherReceipts.length === 0 && (
            <p className="text-sm" style={{ color: T.inkSoft }}>Nothing logged yet — purchases you record in Money will appear here.</p>
          )}
          {otherReceipts.map((e) => (
            <div key={e.id} className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4" style={{ borderColor: T.line, background: T.paper }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: T.ink }}>{e.item}</div>
                <div className="text-xs" style={{ color: T.inkSoft }}>{e.category}{e.store ? ` · ${e.store}` : ""} · {INR(e.actual)}</div>
              </div>
              <AttachmentUploader
                attachments={e.attachments || []}
                onAdd={(a) => addAttachment(e.id, a)}
                onRemove={(id) => removeAttachment(e.id, id)}
              />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border p-8 flex flex-col items-center text-center" style={{ borderColor: T.line, background: T.paper }}>
          <Gem size={20} style={{ color: T.wine }} className="mb-3" />
          <div style={{ ...serif, color: T.ink }} className="text-base mb-1">Full jewellery vault</div>
          <p className="text-xs max-w-xs" style={{ color: T.inkSoft }}>Coming next — track weight, making charges and which event each piece belongs to, beyond what Money already captures.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Auth                                                               */
/* ---------------------------------------------------------------- */
function AuthScreen({ initialMode = "signup", onAuthed, onBack }) {
  const [mode, setMode] = useState(initialMode); // "signup" | "login"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async () => {
    if (!supabase) {
      setError("Storage isn't configured yet — check back once that's set up.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Enter your email and a password of at least 6 characters.");
      return;
    }
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (data.session) {
          onAuthed(data.session);
        } else {
          setNotice("Check your email to confirm your account, then come back and sign in.");
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        onAuthed(data.session);
      }
    } catch (e) {
      setError(e.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: T.paper, minHeight: "100%", ...sans }} className="w-full flex flex-col">
      <div className="max-w-md mx-auto w-full px-6 pt-12 pb-24 flex-1 flex flex-col">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-10 self-start" style={{ color: T.inkSoft }}>
          <ChevronLeft size={16} /> Back
        </button>

        <h2 style={{ ...serif, color: T.ink }} className="text-2xl mb-1">
          {mode === "signup" ? "Create your Bride-a-do account" : "Welcome back"}
        </h2>
        <p style={{ color: T.inkSoft }} className="text-sm mb-8">
          {mode === "signup" ? "So your plan follows you across your phone and laptop." : "Sign in to pick up where you left off."}
        </p>

        <div className="flex flex-col gap-3 mb-2">
          <input
            type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full text-base px-4 py-3 rounded-xl border outline-none focus:ring-2"
            style={{ borderColor: T.line, background: "white" }}
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Password"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full text-base px-4 py-3 rounded-xl border outline-none focus:ring-2"
            style={{ borderColor: T.line, background: "white" }}
          />
        </div>

        {error && <p className="text-xs mt-2" style={{ color: "#B4453D" }}>{error}</p>}
        {notice && <p className="text-xs mt-2" style={{ color: T.moss }}>{notice}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="mt-6 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-white text-sm disabled:opacity-50"
          style={{ background: T.wine }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : (mode === "signup" ? "Create account" : "Sign in")}
        </button>

        <button
          onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); setNotice(""); }}
          className="text-xs underline underline-offset-4 mt-6 self-center"
          style={{ color: T.inkSoft }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* App                                                                */
/* ---------------------------------------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState("landing"); // landing | auth | onboarding | app
  const [authMode, setAuthMode] = useState("signup");
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard");
  const [data, setDataRaw] = useState(null);

  useEffect(() => {
    (async () => {
      if (!supabase) { setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await hydrateFromSession(sessionData.session);
      }
      setLoading(false);
    })();

    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const hydrateFromSession = async (sess) => {
    setSession(sess);
    const saved = await loadData(sess.user.id);
    if (saved && saved.profile) {
      setDataRaw(saved);
      setPhase("app");
    } else {
      setPhase("onboarding");
    }
  };

  const setData = useCallback((updater) => {
    setDataRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (session) saveData(session.user.id, next);
      return next;
    });
  }, [session]);

  const handleOnboardingComplete = (form) => {
    const profile = {
      name: form.name.trim(),
      weddingDate: form.weddingDate,
      city: form.city.trim(),
      interests: form.interests,
    };
    const fresh = emptyData(profile);
    setDataRaw(fresh);
    if (session) saveData(session.user.id, fresh);
    setPhase("app");
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setDataRaw(null);
    setPhase("landing");
  };

  const daysToGo = data ? Math.max(0, daysBetween(new Date(data.profile.weddingDate), new Date())) : 0;

  if (loading) {
    return (
      <div style={{ background: T.paper }} className="w-full h-full min-h-[400px] flex items-center justify-center">
        <Loader2 className="animate-spin" size={20} style={{ color: T.wine }} />
      </div>
    );
  }

  if (phase === "landing") {
    return (
      <Landing
        onStart={() => { setAuthMode("signup"); setPhase("auth"); }}
        onSignIn={() => { setAuthMode("login"); setPhase("auth"); }}
      />
    );
  }
  if (phase === "auth") {
    return (
      <AuthScreen
        initialMode={authMode}
        onBack={() => setPhase("landing")}
        onAuthed={(sess) => hydrateFromSession(sess)}
      />
    );
  }
  if (phase === "onboarding") return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <Shell view={view} setView={setView} name={data.profile.name} daysToGo={daysToGo} onSignOut={handleSignOut}>
      {view === "dashboard" && <Dashboard data={data} setData={setData} daysToGo={daysToGo} />}
      {view === "timeline" && <Timeline data={data} setData={setData} />}
      {view === "money" && <Money data={data} setData={setData} />}
      {view === "shopping" && <Shopping data={data} setData={setData} />}
      {view === "mybride" && <MyBride data={data} setData={setData} />}
      {view === "vault" && <Vault data={data} setData={setData} />}
    </Shell>
  );
}
