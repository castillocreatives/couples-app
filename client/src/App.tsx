import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileToBase64, SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type Profile = ApiResponse<typeof api, "getHome">["profiles"][number];
type Screen = "today" | "notes" | "dig" | "week" | "rhythm";
type VoiceDraft = { dataBase64: string; mimeType: "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/mpeg" | "audio/wav"; durationSeconds: number; previewUrl: string };

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const weekKey = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const capacityCopy = (score: number) => {
  if (score <= 2) return { label: "Running on empty", cue: "Handle with care" };
  if (score <= 4) return { label: "Low bandwidth", cue: "Keep it gentle" };
  if (score <= 6) return { label: "Steady, not spacious", cue: "Ask before adding" };
  if (score <= 8) return { label: "Good capacity", cue: "Open to connect" };
  return { label: "Plenty to give", cue: "I can carry more" };
};

function Icon({ children }: { children: ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function VoiceRecorder({ value, onChange }: { value: VoiceDraft | null; onChange: (value: VoiceDraft | null) => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed(Math.min(600, Math.floor((Date.now() - startedAtRef.current) / 1000))), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
  }, [value?.previewUrl]);

  const stop = () => recorderRef.current?.stop();
  const start = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Voice recording isn’t available in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = async () => {
        const recordedSeconds = Math.max(1, Math.min(600, Math.round((Date.now() - startedAtRef.current) / 1000)));
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const rawType = blob.type.toLowerCase();
        const mimeType: VoiceDraft["mimeType"] = rawType.includes("mp4") ? "audio/mp4" : rawType.includes("ogg") ? "audio/ogg" : rawType.includes("mpeg") ? "audio/mpeg" : rawType.includes("wav") ? "audio/wav" : "audio/webm";
        const encoded = await fileToBase64(blob);
        if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
        onChange({ dataBase64: encoded.dataBase64, mimeType, durationSeconds: recordedSeconds, previewUrl: URL.createObjectURL(blob) });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setElapsed(0);
      };
      recorder.onerror = () => { setError("The recording stopped unexpectedly. Try again."); setRecording(false); };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      recorder.start();
    } catch {
      setError("Microphone access is needed to record a voice note.");
    }
  };

  return <div className="voice-recorder">
    <div className="voice-heading"><div><strong>Voice note</strong><span>Say it before you polish it.</span></div>{recording ? <span className="recording-time"><i />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span> : null}</div>
    {value ? <div className="voice-preview"><audio controls src={value.previewUrl} aria-label="Voice note preview" /><button type="button" onClick={() => { URL.revokeObjectURL(value.previewUrl); onChange(null); }}>Remove</button></div> : <button className={recording ? "record-button recording" : "record-button"} type="button" onClick={recording ? stop : start}><span aria-hidden="true" />{recording ? "Stop recording" : "Record a voice note"}</button>}
    {error ? <p className="error">{error}</p> : null}
  </div>;
}

function Setup({ onDone }: { onDone: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const setup = useMutation({
    mutationFn: () => api.setup({ firstName, secondName }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries();
      const first = data.profiles[0];
      if (first) onDone(first.id);
    },
  });
  return (
    <main className="setup-shell">
      <div className="setup-mark"><span /><span /></div>
      <p className="eyebrow">A shared place to meet</p>
      <h1>Start with two names.</h1>
      <p className="setup-copy">Each of you gets a separate voice. Notes stay private unless their author chooses to share them.</p>
      <form className="setup-form" onSubmit={(e) => { e.preventDefault(); setup.mutate(); }}>
        <label>Your name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} required autoFocus /></label>
        <label>Your partner’s name<input value={secondName} onChange={(e) => setSecondName(e.target.value)} maxLength={30} required /></label>
        <button className="primary wide" type="submit" disabled={setup.isPending}>{setup.isPending ? "Creating your space…" : "Begin together"}</button>
        {setup.error ? <p className="error">Couldn’t create the space. Please try again.</p> : null}
      </form>
    </main>
  );
}

function IdentitySwitch({ profiles, activeId, onChange }: { profiles: Profile[]; activeId: number; onChange: (id: number) => void }) {
  return (
    <div className="identity" aria-label="Choose who is using the app">
      <span>I’m checking in as</span>
      <div className="identity-options">
        {profiles.map((profile) => <button key={profile.id} className={profile.id === activeId ? "active" : ""} onClick={() => onChange(profile.id)}>{profile.name}</button>)}
      </div>
    </div>
  );
}

function Today({ profiles, active, today, recent }: {
  profiles: Profile[]; active: Profile; today: ApiResponse<typeof api, "getHome">["today"]; recent: ApiResponse<typeof api, "getHome">["recent"];
}) {
  const queryClient = useQueryClient();
  const ownToday = today.find((entry) => entry.profileId === active.id);
  const [score, setScore] = useState(ownToday?.score ?? 5);
  const [cue, setCue] = useState(ownToday?.careCue ?? capacityCopy(ownToday?.score ?? 5).cue);
  const [note, setNote] = useState(ownToday?.note ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setScore(ownToday?.score ?? 5);
    setCue(ownToday?.careCue ?? capacityCopy(ownToday?.score ?? 5).cue);
    setNote(ownToday?.note ?? "");
    setSaved(false);
  }, [active.id, ownToday?.id]);
  const save = useMutation({
    mutationFn: () => api.saveCapacity({ profileId: active.id, score, careCue: cue, note, localDate: localDate() }),
    onSuccess: async () => { setSaved(true); await queryClient.invalidateQueries({ queryKey: ["home"] }); },
  });
  const copy = capacityCopy(score);
  const partner = profiles.find((p) => p.id !== active.id);
  const partnerToday = partner ? today.find((entry) => entry.profileId === partner.id) : undefined;
  const past = recent.filter((entry) => entry.profileId === active.id).slice(0, 7).reverse();
  return (
    <section className="screen today-screen">
      <p className="eyebrow">Today’s capacity</p>
      <h1>How much do you have to give?</h1>
      <div className="dial-wrap">
        <div className="dial" style={{ "--score": score } as CSSProperties}>
          <strong>{score}</strong><span>of 10</span>
        </div>
        <div className="capacity-meaning"><b>{copy.label}</b><span>{cue}</span></div>
      </div>
      <label className="sr-only" htmlFor="capacity">Capacity from 1 to 10</label>
      <input id="capacity" className="capacity-range" type="range" min="1" max="10" value={score} onChange={(e) => { const next = Number(e.target.value); setScore(next); setCue(capacityCopy(next).cue); setSaved(false); }} />
      <div className="range-labels"><span>empty</span><span>full</span></div>
      <div className="cue-field">
        <p>What should {partner?.name ?? "your partner"} know?</p>
        <div className="chips">
          {["Handle with care", "Keep it gentle", "Ask before solving", "Open to connect", "I can carry more"].map((item) => <button key={item} className={cue === item ? "selected" : ""} onClick={() => setCue(item)}>{item}</button>)}
        </div>
        <label className="note-label">One useful detail <span>optional</span><textarea aria-label="Optional capacity note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="What would make today easier?" /></label>
      </div>
      <button className="primary wide" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : saved ? "Saved for today" : ownToday ? "Update today’s check-in" : "Share today’s capacity"}</button>
      <div className="today-status">
        <div className="section-heading"><h2>Where you both are</h2><span>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
        {profiles.map((profile) => {
          const entry = today.find((item) => item.profileId === profile.id);
          return <div className="person-status" key={profile.id}>
            <div className="avatar">{profile.name.charAt(0).toUpperCase()}</div>
            <div><strong>{profile.name}</strong><p>{entry ? entry.careCue : "No check-in yet"}</p></div>
            <div className={`score-badge ${entry && entry.score <= 3 ? "low" : ""}`}>{entry ? `${entry.score}/10` : "—"}</div>
          </div>;
        })}
      </div>
      {past.length > 1 ? <div className="pulse"><div className="section-heading"><h2>Your recent pulse</h2><span>last 7</span></div><div className="pulse-line">{past.map((entry) => <div key={entry.id} className="pulse-day"><i style={{ height: `${Math.max(12, entry.score * 8)}%` }} /><span>{entry.score}</span></div>)}</div></div> : null}
    </section>
  );
}

function Notes({ active, gentleNudgesEnabled }: { active: Profile; gentleNudgesEnabled: boolean }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [need, setNeed] = useState("");
  const [shared, setShared] = useState(false);
  const [voice, setVoice] = useState<VoiceDraft | null>(null);
  const notes = useQuery({ queryKey: ["friction", active.id], queryFn: () => api.listFriction({ profileId: active.id }) });
  const add = useMutation({
    mutationFn: () => api.addFriction({
      profileId: active.id,
      body,
      need,
      visibility: shared ? "shared" : "private",
      audio: voice ? { dataBase64: voice.dataBase64, mimeType: voice.mimeType, durationSeconds: voice.durationSeconds } : null,
    }),
    onSuccess: async () => {
      if (voice?.previewUrl) URL.revokeObjectURL(voice.previewUrl);
      if (gentleNudgesEnabled) localStorage.setItem(`couples-followup-${active.id}`, String(Date.now() + 30 * 60 * 1000));
      setBody(""); setNeed(""); setShared(false); setVoice(null);
      await queryClient.invalidateQueries({ queryKey: ["friction", active.id] });
    },
  });
  const update = useMutation({
    mutationFn: (args: { id: number; visibility?: "private" | "shared"; status?: "open" | "resolved" }) => api.updateFriction({ ...args, profileId: active.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friction", active.id] }),
  });
  return <section className="screen">
    <p className="eyebrow">Catch it while it’s small</p>
    <h1>What’s rubbing?</h1>
    <p className="lead">Write the unpolished version. You can decide what to do with it later.</p>
    <form className="capture" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
      <label>What happened? <span>write, record, or both</span><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="The moment, not the whole relationship…" maxLength={1200} /></label>
      <VoiceRecorder value={voice} onChange={setVoice} />
      <label>What might you need? <span>optional</span><input value={need} onChange={(e) => setNeed(e.target.value)} placeholder="Reassurance, help, space, repair…" maxLength={300} /></label>
      <label className="privacy-row"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /><span><strong>{shared ? "Ready to share" : "Private to me"}</strong><small>{shared ? "Your partner can read and play this note." : "Your partner won’t see or hear this note."}</small></span></label>
      <button className="primary" type="submit" disabled={(!body.trim() && !voice) || add.isPending}>{add.isPending ? "Saving…" : voice && !body.trim() ? "Save voice note" : "Save note"}</button>
      {add.error ? <p className="error">Couldn’t save this note. Please try again.</p> : null}
    </form>
    <div className="notes-list">
      <div className="section-heading"><h2>Captured moments</h2><span>{notes.data?.notes.length ?? 0}</span></div>
      {notes.isPending ? <p className="muted">Gathering your notes…</p> : notes.data?.notes.length === 0 ? <div className="empty"><strong>Nothing captured yet.</strong><span>The next sharp edge can land here instead of in the middle of an argument.</span></div> : notes.data?.notes.map((item) => {
        const mine = item.profileId === active.id;
        return <article className={`friction-note ${item.status === "resolved" ? "resolved" : ""}`} key={item.id}>
          <div className="note-meta"><span>{mine ? "You" : item.authorName}</span><span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
          {item.body ? <p>{item.body}</p> : null}
          {item.audioUrl ? <div className="saved-voice"><span>Voice note · {Math.floor((item.audioDurationSeconds ?? 0) / 60)}:{String((item.audioDurationSeconds ?? 0) % 60).padStart(2, "0")}</span><audio controls src={item.audioUrl} aria-label={`Voice note from ${mine ? "you" : item.authorName}`} /></div> : null}
          {item.need ? <blockquote>What I may need: {item.need}</blockquote> : null}
          <div className="note-actions"><span>{item.visibility === "private" ? "Private" : "Shared"}</span>{mine ? <><button onClick={() => update.mutate({ id: item.id, visibility: item.visibility === "private" ? "shared" : "private" })}>{item.visibility === "private" ? "Share" : "Make private"}</button><button onClick={() => update.mutate({ id: item.id, status: item.status === "open" ? "resolved" : "open" })}>{item.status === "open" ? "Mark settled" : "Reopen"}</button></> : null}</div>
        </article>;
      })}
    </div>
  </section>;
}

const digSteps = [
  { key: "topic", title: "Name the moment", prompt: "What do you want to untangle? Keep it to one moment or pattern.", placeholder: "Morning handoffs keep turning tense" },
  { key: "observation", title: "Separate camera from commentary", prompt: "What would a camera have captured—specific words or actions, without motives?", placeholder: "Yesterday, I asked about lunches and the answer came back sharply…" },
  { key: "story", title: "Catch the story", prompt: "What meaning did your mind attach to that moment? This is a story, not a verdict.", placeholder: "The story I told myself was…" },
  { key: "impact", title: "Name the impact", prompt: "What happened inside you—emotion, body, or behavior?", placeholder: "I felt… and then I…" },
  { key: "need", title: "Find the need", prompt: "Under the frustration, what mattered or felt missing?", placeholder: "I needed respect, teamwork, rest…" },
  { key: "request", title: "Make a workable request", prompt: "Ask for one observable action, small enough to try next time.", placeholder: "Next time, would you be willing to…" },
] as const;

type DigKey = typeof digSteps[number]["key"];

function DigIn({ active }: { active: Profile }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Record<DigKey, string>>({ topic: "", observation: "", story: "", impact: "", need: "", request: "" });
  const [done, setDone] = useState(false);
  const sessions = useQuery({ queryKey: ["digins", active.id], queryFn: () => api.listDigIns({ profileId: active.id }) });
  const save = useMutation({ mutationFn: () => api.saveDigIn({ profileId: active.id, ...draft }), onSuccess: async () => { setDone(true); await queryClient.invalidateQueries({ queryKey: ["digins", active.id] }); } });
  const current = digSteps[step] ?? digSteps[0];
  const reset = () => { setDraft({ topic: "", observation: "", story: "", impact: "", need: "", request: "" }); setStep(0); setDone(false); };
  if (done) return <section className="screen dig-complete"><p className="eyebrow">Ready to bring forward</p><h1>Start with the request.</h1><div className="request-card"><span>Try saying</span><p>“I want to talk about {draft.topic.toLowerCase()}. The request I want to make is: {draft.request}”</p></div><p className="lead">Stay with this one issue. Take turns. The goal is understanding before agreement.</p><button className="primary wide" onClick={reset}>Prepare another conversation</button></section>;
  return <section className="screen dig-screen">
    <p className="eyebrow">Guided dig-in</p><h1>Get underneath the loop.</h1><p className="lead">Do this alone first. It turns a charged story into something you can actually discuss.</p>
    <div className="step-track" aria-label={`Step ${step + 1} of ${digSteps.length}`}>{digSteps.map((_, i) => <i key={i} className={i <= step ? "filled" : ""} />)}</div>
    <div className="prompt-panel"><span>Step {step + 1} of {digSteps.length}</span><h2>{current.title}</h2><p>{current.prompt}</p><label className="sr-only" htmlFor="dig-answer">{current.title}</label><textarea id="dig-answer" value={draft[current.key]} onChange={(e) => setDraft((prev) => ({ ...prev, [current.key]: e.target.value }))} placeholder={current.placeholder} maxLength={700} autoFocus /></div>
    <div className="wizard-actions">{step > 0 ? <button className="secondary" onClick={() => setStep(step - 1)}>Back</button> : <span />}{step < digSteps.length - 1 ? <button className="primary" disabled={!draft[current.key].trim()} onClick={() => setStep(step + 1)}>Continue</button> : <button className="primary" disabled={!draft[current.key].trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save my prep"}</button>}</div>
    {step === 0 && sessions.data && sessions.data.sessions.length > 0 ? <div className="past-dig"><div className="section-heading"><h2>Recent prep</h2><span>{sessions.data.sessions.length}</span></div>{sessions.data.sessions.slice(0, 3).map((item) => <div key={item.id}><strong>{item.topic}</strong><span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>)}</div> : null}
  </section>;
}

function Week({ profiles, active }: { profiles: Profile[]; active: Profile }) {
  const queryClient = useQueryClient();
  const key = weekKey();
  const weekly = useQuery({ queryKey: ["weekly", active.id, key], queryFn: () => api.getWeekly({ profileId: active.id, weekKey: key }) });
  const mine = weekly.data?.reflections.find((item) => item.profileId === active.id);
  const [rating, setRating] = useState(7);
  const [appreciate, setAppreciate] = useState("");
  const [own, setOwn] = useState("");
  const [intention, setIntention] = useState("");
  useEffect(() => {
    if (mine?.submitted) { setRating(mine.rating ?? 7); setAppreciate(mine.appreciate ?? ""); setOwn(mine.own ?? ""); setIntention(mine.intention ?? ""); }
  }, [mine?.submittedAt, active.id]);
  const save = useMutation({ mutationFn: () => api.saveWeekly({ profileId: active.id, weekKey: key, rating, appreciate, own, intention }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly"] }) });
  const complete = Boolean(appreciate.trim() && own.trim() && intention.trim());
  const weekLabel = new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return <section className="screen week-screen">
    <p className="eyebrow">Week of {weekLabel}</p><h1>Calibrate, don’t keep score.</h1><p className="lead">Answer for yourself. Your partner’s reflection unlocks only after both of you submit.</p>
    <form className="weekly-form" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
      <label>How did this week feel?<div className="rating-row"><input aria-label="Rate the week from 1 to 10" type="range" min="1" max="10" value={rating} onChange={(e) => setRating(Number(e.target.value))} /><strong>{rating}<small>/10</small></strong></div></label>
      <label>Something I appreciated<textarea value={appreciate} onChange={(e) => setAppreciate(e.target.value)} placeholder={`A moment when ${profiles.find((p) => p.id !== active.id)?.name ?? "my partner"} showed up…`} maxLength={600} required /></label>
      <label>What I want to own<textarea value={own} onChange={(e) => setOwn(e.target.value)} placeholder="My part, without adding a ‘but’…" maxLength={600} required /></label>
      <label>One thing I’ll do differently<textarea value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="Small, specific, and mine to do…" maxLength={600} required /></label>
      <button className="primary wide" type="submit" disabled={!complete || save.isPending}>{save.isPending ? "Submitting…" : mine?.submitted ? "Update my reflection" : "Submit my reflection"}</button>
    </form>
    <div className="unlock-panel"><div className={`lock-symbol ${weekly.data?.unlocked ? "open" : ""}`} aria-hidden="true"><span /></div><div><strong>{weekly.data?.unlocked ? "Both reflections are open" : "Waiting for both of you"}</strong><p>{weekly.data?.reflections.map((item) => `${item.name}: ${item.submitted ? "submitted" : "not yet"}`).join(" · ")}</p></div></div>
    {weekly.data?.unlocked ? <div className="reflections">{weekly.data.reflections.map((item) => <article key={item.profileId}><div className="reflection-head"><div className="avatar">{item.name.charAt(0)}</div><h2>{item.name}</h2><strong>{item.rating}/10</strong></div><dl><dt>Appreciated</dt><dd>{item.appreciate}</dd><dt>Owns</dt><dd>{item.own}</dd><dt>Next week</dt><dd>{item.intention}</dd></dl></article>)}</div> : null}
  </section>;
}

function sendDeviceNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  new Notification(title, { body });
  return true;
}

function Rhythm({ active }: { active: Profile }) {
  const queryClient = useQueryClient();
  const reminders = useQuery({ queryKey: ["reminders", active.id], queryFn: () => api.getReminders({ profileId: active.id }) });
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [morningTime, setMorningTime] = useState("08:00");
  const [eveningEnabled, setEveningEnabled] = useState(false);
  const [eveningTime, setEveningTime] = useState("20:00");
  const [gentleNudgesEnabled, setGentleNudgesEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!reminders.data) return;
    setMorningEnabled(reminders.data.morningEnabled);
    setMorningTime(reminders.data.morningTime);
    setEveningEnabled(reminders.data.eveningEnabled);
    setEveningTime(reminders.data.eveningTime);
    setGentleNudgesEnabled(reminders.data.gentleNudgesEnabled);
  }, [reminders.data, active.id]);
  const save = useMutation({
    mutationFn: () => api.saveReminders({ profileId: active.id, morningEnabled, morningTime, eveningEnabled, eveningTime, gentleNudgesEnabled }),
    onSuccess: async () => { setSaved(true); await queryClient.invalidateQueries({ queryKey: ["reminders", active.id] }); },
  });
  const askPermission = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") sendDeviceNotification("Reminders are on", `We’ll nudge ${active.name} at the moments you choose.`);
  };
  return <section className="screen rhythm-screen">
    <p className="eyebrow">Your daily rhythm</p><h1>Check in before the day runs you.</h1><p className="lead">Set a tone in the morning, close the loop at night, and make room for a reset after a hard moment.</p>
    <div className="permission-panel">
      <div><strong>Device notifications</strong><p>{permission === "granted" ? "Allowed on this device" : permission === "denied" ? "Blocked in this device’s settings" : permission === "unsupported" ? "Not available in this browser" : "Permission is needed before reminders can appear"}</p></div>
      {permission === "default" ? <button className="secondary" onClick={askPermission}>Enable notifications</button> : permission === "granted" ? <button className="secondary" onClick={() => sendDeviceNotification("A gentle check-in", "Where is your capacity right now?")}>Send a test</button> : null}
    </div>
    <form className="rhythm-form" onSubmit={(e) => { e.preventDefault(); setSaved(false); save.mutate(); }}>
      <div className="reminder-row"><label className="switch-label"><input type="checkbox" checked={morningEnabled} onChange={(e) => { setMorningEnabled(e.target.checked); setSaved(false); }} /><span className="switch" /><span><strong>Morning tone-setter</strong><small>“What do I have to give today?”</small></span></label><label className="time-label">Time<input aria-label="Morning reminder time" type="time" value={morningTime} onChange={(e) => { setMorningTime(e.target.value); setSaved(false); }} disabled={!morningEnabled} /></label></div>
      <div className="reminder-row"><label className="switch-label"><input type="checkbox" checked={eveningEnabled} onChange={(e) => { setEveningEnabled(e.target.checked); setSaved(false); }} /><span className="switch" /><span><strong>Evening close-out</strong><small>“Anything to name before tomorrow?”</small></span></label><label className="time-label">Time<input aria-label="Evening reminder time" type="time" value={eveningTime} onChange={(e) => { setEveningTime(e.target.value); setSaved(false); }} disabled={!eveningEnabled} /></label></div>
      <div className="reminder-row single"><label className="switch-label"><input type="checkbox" checked={gentleNudgesEnabled} onChange={(e) => { setGentleNudgesEnabled(e.target.checked); setSaved(false); }} /><span className="switch" /><span><strong>After a hard moment</strong><small>Follow up 30 minutes after I save a friction note.</small></span></label></div>
      <button className="primary wide" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : saved ? "Rhythm saved" : "Save my rhythm"}</button>
      {save.error ? <p className="error">Couldn’t save these reminders. Please try again.</p> : null}
    </form>
    <p className="prototype-note"><strong>Prototype note:</strong> reminder choices are saved, and notifications fire while this prototype remains open. Reliable push when it’s closed will need phone-level notification support in the next build.</p>
  </section>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("today");
  const [activeId, setActiveId] = useState<number>(() => Number(localStorage.getItem("couples-active-id")) || 0);
  const home = useQuery({ queryKey: ["home", localDate()], queryFn: () => api.getHome({ localDate: localDate() }) });
  const profiles = home.data?.profiles ?? [];
  useEffect(() => { if (!activeId && profiles[0]) setActiveId(profiles[0].id); }, [activeId, profiles]);
  const active = useMemo(() => profiles.find((p) => p.id === activeId) ?? profiles[0], [profiles, activeId]);
  const reminders = useQuery({ queryKey: ["reminders", active?.id], queryFn: () => api.getReminders({ profileId: active?.id ?? 0 }), enabled: Boolean(active?.id) });
  useEffect(() => {
    if (!active || !reminders.data) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const date = localDate();
      const fire = (kind: "morning" | "evening", enabled: boolean, time: string, body: string) => {
        const key = `couples-reminder-${active.id}-${kind}-${date}`;
        if (enabled && hhmm === time && !localStorage.getItem(key) && sendDeviceNotification("Time to check in", body)) localStorage.setItem(key, "sent");
      };
      fire("morning", reminders.data.morningEnabled, reminders.data.morningTime, "Set the tone: how much do you have to give today?");
      fire("evening", reminders.data.eveningEnabled, reminders.data.eveningTime, "Close the loop: is there anything worth naming before tomorrow?");
      const followupKey = `couples-followup-${active.id}`;
      const followupAt = Number(localStorage.getItem(followupKey) ?? 0);
      if (reminders.data.gentleNudgesEnabled && followupAt > 0 && Date.now() >= followupAt && sendDeviceNotification("A gentle follow-up", "You captured a hard moment earlier. Is there anything you want to add—or can you let it rest?")) localStorage.removeItem(followupKey);
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [active, reminders.data]);
  const changeIdentity = (id: number) => { setActiveId(id); localStorage.setItem("couples-active-id", String(id)); };
  if (home.isPending) return <main className="loading"><div className="loading-pulse" /><p>Making space…</p></main>;
  if (home.error) return <main className="loading"><h1>We couldn’t open this space.</h1><p>Try again in a moment.</p></main>;
  if (profiles.length === 0) return <><SafeAreaTopScrim backgroundColor="var(--bg)" /><Setup onDone={changeIdentity} /></>;
  if (!active) return null;
  return <div className="app-shell">
    <SafeAreaTopScrim backgroundColor="var(--bg)" />
    <header><IdentitySwitch profiles={profiles} activeId={active.id} onChange={changeIdentity} /></header>
    <main>
      {screen === "today" ? <Today profiles={profiles} active={active} today={home.data?.today ?? []} recent={home.data?.recent ?? []} /> : null}
      {screen === "notes" ? <Notes active={active} gentleNudgesEnabled={reminders.data?.gentleNudgesEnabled ?? false} /> : null}
      {screen === "dig" ? <DigIn active={active} /> : null}
      {screen === "week" ? <Week profiles={profiles} active={active} /> : null}
      {screen === "rhythm" ? <Rhythm active={active} /> : null}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={screen === "today" ? "active" : ""} onClick={() => setScreen("today")}><Icon>○</Icon><span>Today</span></button>
      <button className={screen === "notes" ? "active" : ""} onClick={() => setScreen("notes")}><Icon>⌁</Icon><span>Notes</span></button>
      <button className={screen === "dig" ? "active" : ""} onClick={() => setScreen("dig")}><Icon>↳</Icon><span>Dig in</span></button>
      <button className={screen === "week" ? "active" : ""} onClick={() => setScreen("week")}><Icon>◇</Icon><span>Week</span></button>
      <button className={screen === "rhythm" ? "active" : ""} onClick={() => setScreen("rhythm")}><Icon>◷</Icon><span>Rhythm</span></button>
    </nav>
  </div>;
}
