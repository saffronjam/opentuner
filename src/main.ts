import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { AudioEngine } from "./audio";
import { ReferencePlayer } from "./reference";
import { PRESETS, Tracker, note, loadSettings, saveSettings, type Tuning } from "./tuning";
import headstock from "./headstock.webp";
declare const __APP_VERSION__: string;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const settings = loadSettings();
let tuning = [...PRESETS, ...settings.custom].find((t) => t.id === settings.selected) ?? PRESETS[0];
let manual: number | null = null,
  running = false,
  starting = false,
  lastReading = 0,
  session = 0;
const tracker = new Tracker(),
  engine = new AudioEngine();
const reference = new ReferencePlayer();
const gear =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 3-.6 2.1-1.7 1L4.5 6l-2 3.5L4 11v2l-1.5 1.5 2 3.5 2.2-.1 1.7 1L9 21h4l.6-2.1 1.7-1 2.2.1 2-3.5L18 13v-2l1.5-1.5-2-3.5-2.2.1-1.7-1L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>';
$("app").innerHTML =
  `<div class="tuner"><header><a class="brand" href="/" aria-label="OpenTuner home"><img src="/icon.svg" width="30" height="30" alt="">OpenTuner</a><div class="header-actions"><label class="auto">AUTO <input id="auto" type="checkbox" role="switch" checked aria-label="Automatic string detection"><span class="switch"></span></label><button id="settings" class="icon-button" aria-label="Settings">${gear}</button></div></header><section class="meter" aria-label="Pitch meter"><svg class="pitch-history" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path id="trace" fill="none" vector-effect="non-scaling-stroke"/></svg><div class="scale"><span>♭</span><span>♯</span></div><div class="zero"></div><div class="needle" id="needle"><span id="cents">—</span></div><div class="reading"><strong id="note">—</strong><div><p id="status" role="status">Ready to tune</p><span id="detail">Pluck one string at a time</span></div></div></section><section class="guitar" aria-label="Guitar strings"><div class="headstock-layout"><img class="headstock" src="${headstock}" alt="Acoustic guitar headstock" draggable="false"><div id="strings"></div></div></section></div><dialog id="sheet"><div class="sheet-heading"><h1 id="sheet-title"></h1><button id="close" class="icon-button" aria-label="Close"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div id="sheet-body"></div></dialog><div id="notification" popover="manual" role="alert"><div><strong id="notification-level"></strong><p id="notification-message"></p></div><button id="enable-mic" hidden>Enable microphone</button><button id="dismiss-notification" aria-label="Dismiss notification">×</button></div>`;
let notificationTimer: ReturnType<typeof setTimeout>;
function clearNotification() {
  clearTimeout(notificationTimer);
  $("notification").hidePopover();
}
function notify(message: string, level: "Error" | "Warning" = "Error", retry = false) {
  $("enable-mic").hidden = !retry;
  $("notification-level").textContent = level;
  $("notification-message").textContent = message;
  $("notification").showPopover();
  clearTimeout(notificationTimer);
  if (!retry) notificationTimer = setTimeout(clearNotification, 8000);
}
$("dismiss-notification").onclick = clearNotification;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const all = () => [...PRESETS, ...settings.custom];
function persist() {
  settings.selected = tuning.id;
  if (!saveSettings(settings)) notify("Settings could not be saved on this device.", "Warning");
}
function renderStrings() {
  $("strings").replaceChildren(
    ...tuning.notes.map((n, i) => {
      const b = document.createElement("button");
      b.className = `string string-${i}`;
      b.dataset.index = String(i);
      b.innerHTML = `<span>${note(n)}</span><small>${6 - i}</small>`;
      b.setAttribute("aria-label", `String ${6 - i}, ${note(n, true)}`);
      b.setAttribute("aria-pressed", String(manual === i));
      b.onclick = () => {
        manual = i;
        $<HTMLInputElement>("auto").checked = false;
        tracker.reset();
        resetMeter();
        highlight(i);
        void reference
          .play(tuning.notes[i], (ms) => engine.suppressFor(ms))
          .catch(() => notify("Could not play the reference note. Try again."));
      };
      return b;
    }),
  );
}
function highlight(index: number) {
  document.querySelectorAll<HTMLButtonElement>(".string").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.index) === index);
    b.setAttribute("aria-pressed", String(Number(b.dataset.index) === manual));
  });
}
type TracePoint = { time: number; error: number; string: number };
let tracePoints: TracePoint[] = [];
let lastTracePaint = 0;
function paintTrace(now: number) {
  if (now - lastTracePaint > 30 && tracePoints.length) {
    tracePoints = tracePoints.filter((p) => now - p.time < 5000);
    let path = "";
    let previous: TracePoint | undefined;
    for (const p of tracePoints) {
      const x = 50 + Math.max(-1, Math.min(1, p.error / 50)) * 43;
      const y = 80 - ((now - p.time) / 5000) * 80;
      path += `${!previous || previous.string !== p.string || p.time - previous.time > 200 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
      previous = p;
    }
    $("trace").setAttribute("d", path);
    lastTracePaint = now;
  }
  requestAnimationFrame(paintTrace);
}
requestAnimationFrame(paintTrace);
function resetMeter(clearTrace = true) {
  if (clearTrace) {
    tracePoints = [];
    $("trace").setAttribute("d", "");
  }
  $("note").textContent = manual === null ? "—" : note(tuning.notes[manual]);
  $("cents").textContent = "—";
  $("needle").style.setProperty("--offset", "0px");
  $("needle").classList.remove("heard");
  $("app").classList.remove("in-tune");
  $("status").textContent = running ? "Listening…" : "Ready to tune";
  $("detail").textContent = "Pluck one string at a time";
  lastReading = 0;
  highlight(manual ?? -1);
}
$("auto").onchange = () => {
  manual = $<HTMLInputElement>("auto").checked ? null : 0;
  tracker.reset();
  resetMeter();
};
let micBlocked = false;
async function start() {
  if (starting || running || document.hidden) return;
  starting = true;
  const own = ++session;

  clearNotification();
  try {
    await engine.start(
      (r) => {
        if (own !== session || !running) return;
        const result = tracker.update(r, tuning, manual);
        if (!result) return;
        lastReading = performance.now();
        tracePoints.push({ time: lastReading, error: result.cents, string: result.string });
        if (tracePoints.length > 300) tracePoints.shift();
        highlight(result.string);
        $("note").textContent = note(tuning.notes[result.string]);
        $("cents").textContent = `${result.cents > 0 ? "+" : ""}${Math.round(result.cents)}`;
        $("needle").style.setProperty(
          "--offset",
          `${Math.max(-1, Math.min(1, result.cents / 50)) * $("needle").parentElement!.clientWidth * 0.43}px`,
        );
        $("needle").classList.add("heard");
        $("status").textContent = result.inTune
          ? "In tune"
          : Math.abs(result.cents) <= 3
            ? "Hold steady"
            : result.cents < 0
              ? "Tune up"
              : "Tune down";
        $("detail").textContent =
          `String ${6 - result.string} · ${note(tuning.notes[result.string], true)}`;
        $("app").classList.toggle("in-tune", result.inTune);
        if (result.confirmed && settings.sound) engine.chime();
      },
      () => {
        stop();
        micBlocked = true;
        notify("Microphone disconnected. Try again.", "Error", true);
      },
    );
    if (own !== session) return;
    running = true;

    resetMeter();
  } catch (e) {
    if (own !== session) return;
    const name = (e as Error).name;
    micBlocked = true;
    notify(
      name === "InteractionRequiredError"
        ? "Tap to enable the microphone."
        : name === "NotAllowedError"
          ? "Microphone blocked. Allow access in your browser, then retry."
          : name === "NotFoundError"
            ? "No microphone found. Connect one and retry."
            : !window.isSecureContext
              ? "Use HTTPS to enable the microphone."
              : "Could not start the microphone. Try again.",
      "Error",
      true,
    );
  } finally {
    if (own === session) {
      starting = false;
    }
  }
}
function stop() {
  session++;
  engine.stop();
  engine.suppressFor(0);
  reference.stop();
  running = false;
  starting = false;
  tracker.reset();

  resetMeter();
}
$("enable-mic").onclick = () => {
  micBlocked = false;
  void start();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    reference.stop();
    engine.suppressFor(0);
    if (running || starting) stop();
  } else if (!micBlocked) {
    void start();
  }
});
window.addEventListener("pagehide", stop);
setInterval(() => {
  if (running && lastReading && performance.now() - lastReading > 700) {
    tracker.reset();
    resetMeter(false);
  }
}, 150);
const sheet = $<HTMLDialogElement>("sheet");
let sheetEpoch = 0;
function closeSheet() {
  const epoch = ++sheetEpoch;
  sheet.getAnimations().forEach((a) => a.cancel());
  if (reducedMotion.matches) {
    sheet.close();
    return;
  }
  const animation = sheet.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(12px)" },
    ],
    { duration: 140, easing: "ease-in" },
  );
  animation.onfinish = () => {
    if (epoch === sheetEpoch) sheet.close();
  };
}
function openSheet(title: string) {
  sheetEpoch++;
  sheet.getAnimations().forEach((a) => a.cancel());
  const wasOpen = sheet.open;
  $("sheet-title").textContent = title;
  $("sheet-body").replaceChildren();
  if (!sheet.open) sheet.showModal();
  if (!reducedMotion.matches) {
    const target = wasOpen ? $("sheet-body") : sheet;
    target.animate(
      wasOpen
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(20px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" },
    );
  }
}
$("close").onclick = closeSheet;
sheet.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeSheet();
});
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) {
    const b = sheet.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      closeSheet();
  }
});
function button(text: string, action: () => void, cls = "row") {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = cls;
  b.onclick = action;
  return b;
}
function choose() {
  openSheet("Tuning");
  for (const t of all())
    $("sheet-body").append(
      button(`${t.name}${t.id === tuning.id ? " ✓" : ""}`, () => {
        tuning = t;
        manual = null;
        $<HTMLInputElement>("auto").checked = true;
        tracker.reset();
        persist();
        renderStrings();
        resetMeter();
        closeSheet();
      }),
    );
  $("sheet-body").append(button("+ Custom tuning", () => edit()));
}

function edit(existing?: Tuning) {
  openSheet(existing ? "Edit tuning" : "Custom tuning");
  const form = document.createElement("form");
  form.noValidate = true;
  form.innerHTML =
    '<label class="field">Name<input name="name" required maxlength="40" placeholder="My tuning" autocomplete="off"></label><div class="note-fields"></div><button class="start" type="submit">Save tuning</button>';
  (form.elements.namedItem("name") as HTMLInputElement).value = existing?.name ?? "";
  (existing ?? tuning).notes.forEach((n, i) => {
    const label = document.createElement("label");
    label.className = "field";
    label.textContent = `String ${6 - i}`;
    const select = document.createElement("select");
    select.name = `note${i}`;
    for (let m = 28; m <= 76; m++) select.add(new Option(note(m, true), String(m), false, m === n));
    label.append(select);
    form.querySelector(".note-fields")!.append(label);
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    if (!name) {
      notify("Give this tuning a name.", "Warning");
      return;
    }
    const t = {
      id: existing?.id ?? `custom-${crypto.randomUUID()}`,
      name,
      notes: Array.from({ length: 6 }, (_, i) => Number(data.get(`note${i}`))),
    };
    settings.custom = settings.custom.filter((x) => x.id !== t.id);
    settings.custom.push(t);
    tuning = t;
    manual = null;
    $<HTMLInputElement>("auto").checked = true;
    persist();
    tracker.reset();
    renderStrings();
    resetMeter();
    closeSheet();
  };
  $("sheet-body").append(form);
  if (existing)
    $("sheet-body").append(
      button(
        "Delete tuning",
        () => {
          settings.custom = settings.custom.filter((t) => t.id !== existing.id);
          if (tuning.id === existing.id) tuning = PRESETS[0];
          persist();
          tracker.reset();
          renderStrings();
          resetMeter();
          showSettings();
        },
        "row danger",
      ),
    );
}
let updateReady = false;
let updateApp: (reload?: boolean) => Promise<void>;
function showSettings() {
  openSheet("Settings");
  $("sheet-body").append(button(`Tuning · ${tuning.name}`, choose));
  const label = document.createElement("label");
  label.className = "row sound-row";
  label.textContent = "In-tune sound";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = settings.sound;
  input.onchange = () => {
    settings.sound = input.checked;
    persist();
  };
  label.append(input);
  $("sheet-body").append(label);
  for (const t of settings.custom) $("sheet-body").append(button(`Edit ${t.name}`, () => edit(t)));
  $("sheet-body").append(button("+ Custom tuning", () => edit()));
  if (updateReady)
    $("sheet-body").append(
      button("Update app", () => {
        stop();
        void updateApp(true);
      }),
    );
  const version = document.createElement("p");
  version.className = "version";
  version.textContent = `OpenTuner · ${__APP_VERSION__}`;
  $("sheet-body").append(version);
}
$("settings").onclick = showSettings;
updateApp = registerSW({
  onNeedRefresh() {
    updateReady = true;
    $("settings").classList.add("update-ready");
  },
  onRegisteredSW(_url, registration) {
    window.addEventListener("online", () => void registration?.update());
  },
});
renderStrings();

void start();
