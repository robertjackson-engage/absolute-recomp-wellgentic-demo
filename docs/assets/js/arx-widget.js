/* Absolute Recomp × Wellgentic — AI concierge widget
   Same design + flow as the NAC widget: orb → teaser → two-screen pre-chat
   (route → contact) → Wellgentic-powered chat. Powered by Wellgentic.

   Transports (first available wins):
   1. Local proxy  — POST /api/wellgentic (serve.py holds WELLGENTIC_API_KEY in .env)
   2. Direct       — visit any page once with #wk=<wellgentic-key> to store it
                     in this browser (key never lives in the repo)
   3. Demo mode    — scripted answers, so the demo never dead-ends offline. */
(function () {
  "use strict";

  var IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var WG_DIRECT = "https://app.wellgentic.ai/api/widget/chat";
  var WORKFLOW_ID = 78;

  /* #wk= activation (mirrors the #ck= pattern used across our demo sites) */
  try {
    var m = location.hash.match(/[#&]wk=([^&]+)/);
    if (m) {
      localStorage.setItem("arx_wg_key", decodeURIComponent(m[1]));
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
  function wgKey() { try { return localStorage.getItem("arx_wg_key") || ""; } catch (e) { return ""; } }

  /* Wellgentic pre-chat form field IDs for workflow 78 */
  var FIELD = {
    first: "field_zjbrnqet_1778791574889",
    last:  "field_4w41tmjy_1778791625366",
    phone: "field_jyykkcpm_1778791645945",
    email: "field_bx4qbg6r_1778791676117"
  };

  var CFG = window.ARX_CHAT || {};
  var PHONE = CFG.phone || "(972) 645-3057";
  var TEL = PHONE.replace(/\D/g, "");
  var ROUTES = [
    { id: "member", label: "I'm a Member", desc: "Programs, check-ins, billing & account help." },
    { id: "non_member", label: "I'm not a Member", desc: "Memberships, day passes, coaching & pricing." }
  ];

  var MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 L52 20 v24 L32 56 L12 44 V20 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><text x="32" y="35.5" text-anchor="middle" dominant-baseline="middle" font-family="Oswald, Arial Narrow, sans-serif" font-size="15" font-weight="700" fill="currentColor">AR</text></svg>';
  var CHIPS = CFG.chips || [
    "What does a membership cost?",
    "How do day passes work?",
    "Tell me about the coaching",
    "What are your hours?",
    "Where are you located?"
  ];

  /* demo-mode scripted answers (safety net when no proxy/key is reachable) */
  var DEMO = CFG.demo || {};
  function demoReply(text) {
    var t = text.toLowerCase(), keys = Object.keys(DEMO);
    for (var i = 0; i < keys.length; i++) {
      var kws = keys[i].split("|");
      for (var k = 0; k < kws.length; k++) if (t.indexOf(kws[k]) > -1) return DEMO[keys[i]];
    }
    return (CFG.demoFallback || "Great question — one of our coaches can give you the full picture. Call us at " + PHONE + " or stop by the front desk, and we'll take care of you.");
  }

  var root = document.createElement("div");
  root.id = "arx-root";
  document.body.appendChild(root);

  root.innerHTML =
    '<button class="arx-orb" aria-label="Chat with the Absolute Recomp AI concierge">' + MARK + "</button>" +
    '<div class="arx-hint" role="button" tabindex="0"><span class="arx-hint-avatar">' + MARK + "</span>" +
    '<span class="arx-hint-text"><em>Hi, I’m Atlas</em> — ask me anything about Absolute Recomp.</span>' +
    '<button class="arx-hint-x" aria-label="Dismiss">✕</button></div>' +
    '<div class="arx-panel" role="dialog" aria-label="Atlas — Absolute Recomp AI concierge">' +
    '<div class="arx-head"><div class="arx-head-icon">' + MARK + "</div>" +
    '<div><div class="arx-head-name">Atlas</div><div class="arx-head-sub">Absolute Recomp AI Concierge · Powered by Wellgentic</div></div>' +
    '<button class="arx-close" aria-label="Close chat">✕</button></div>' +
    '<div class="arx-msgs"></div>' +
    '<div class="arx-input is-locked"><textarea rows="1" placeholder="Ask about memberships, coaching, day passes…" aria-label="Message"></textarea>' +
    '<button class="arx-send" aria-label="Send">→</button></div>' +
    '<div class="arx-note">Atlas is Absolute Recomp’s AI assistant — for account questions call ' + PHONE + ".</div></div>";

  var orb = root.querySelector(".arx-orb"), hint = root.querySelector(".arx-hint"),
      msgs = root.querySelector(".arx-msgs"), inputWrap = root.querySelector(".arx-input"),
      input = root.querySelector("textarea"), sendBtn = root.querySelector(".arx-send");

  var STARTED = false, SELPATH = "", SELLABEL = "", LEAD = {}, HISTORY = [], DEMO_MODE = false;

  function uuid() { try { return crypto.randomUUID(); } catch (e) { return "arx-" + Date.now() + "-" + Math.random().toString(16).slice(2); } }
  var sessionId = ""; try { sessionId = localStorage.getItem("arx_session") || ""; } catch (e) {}
  if (!sessionId) { sessionId = uuid(); try { localStorage.setItem("arx_session", sessionId); } catch (e) {} }

  function md(t) {
    t = String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return t.split(/\n{2,}/).map(function (b) {
      var lines = b.split("\n"), items = lines.filter(function (l) { return /^\s*[-•]\s+/.test(l); });
      if (items.length && items.length === lines.length)
        return "<ul>" + items.map(function (l) { return "<li>" + l.replace(/^\s*[-•]\s+/, "") + "</li>"; }).join("") + "</ul>";
      return "<p>" + b.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function addMsg(role, html, raw) {
    var d = document.createElement("div");
    d.className = "arx-msg " + (role === "user" ? "u" : "a");
    d.innerHTML = role === "user" ? String(html).replace(/</g, "&lt;") : html;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    if (typeof raw === "string") HISTORY.push({ role: role === "user" ? "user" : "assistant", content: raw });
    return d;
  }
  function lockInput(locked) { inputWrap.classList.toggle("is-locked", !!locked); }
  function typing() {
    var t = document.createElement("div"); t.className = "arx-typing"; t.innerHTML = "<i></i><i></i><i></i>";
    msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight; return t;
  }

  /* ---------- transport ---------- */
  function wgCall(body) {
    if (IS_LOCAL) {
      return fetch("/api/wellgentic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "proxy"); return j; }); });
    }
    var key = wgKey();
    if (key) {
      var url = WG_DIRECT + (body.action === "init" ? "/init" : "");
      var payload = Object.assign({}, body); delete payload.action; payload.workflowId = WORKFLOW_ID;
      return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.error) throw new Error(j.error || "direct"); return j; }); });
    }
    return Promise.reject(new Error("no-transport"));
  }

  /* ---------- pre-chat screen 1: routing ---------- */
  function renderRoutes() {
    msgs.innerHTML = "";
    var f = document.createElement("div"); f.className = "arx-prechat";
    var routeHtml = ROUTES.map(function (r) {
      return '<button type="button" class="arx-route" data-id="' + r.id + '" data-label="' + r.label.replace(/"/g, "&quot;") + '">' +
             "<b>" + r.label + "</b>" + (r.desc ? "<span>" + r.desc + "</span>" : "") + "</button>";
    }).join("");
    f.innerHTML =
      "<h3>Hi, I’m Atlas 👋</h3>" +
      '<p class="arx-pc-intro">I’m Absolute Recomp’s AI concierge — memberships, coaching, day passes, hours, anything. So I can point you the right way, which are you?</p>' +
      '<div class="arx-routes">' + routeHtml + "</div>";
    msgs.appendChild(f);
    f.querySelectorAll(".arx-route").forEach(function (b) {
      b.addEventListener("click", function () { renderContactForm(b.getAttribute("data-id"), b.getAttribute("data-label")); });
    });
    lockInput(true);
  }

  /* ---------- pre-chat screen 2: contact ---------- */
  function renderContactForm(pathId, pathLabel) {
    SELPATH = pathId; SELLABEL = pathLabel;
    msgs.innerHTML = "";
    var f = document.createElement("div"); f.className = "arx-prechat";
    f.innerHTML =
      '<button type="button" class="arx-back">← Back</button>' +
      "<h3>How can we reach you?</h3>" +
      '<p class="arx-pc-intro">Add your details and we’ll get started.</p>' +
      '<div class="arx-field"><label>First name</label><input type="text" id="arx-pc-first" autocomplete="given-name"></div>' +
      '<div class="arx-field"><label>Last name</label><input type="text" id="arx-pc-last" autocomplete="family-name"></div>' +
      '<div class="arx-field"><label>Phone</label><input type="tel" id="arx-pc-phone" autocomplete="tel"></div>' +
      '<div class="arx-field"><label>Email (optional)</label><input type="email" id="arx-pc-email" autocomplete="email"></div>' +
      '<p class="arx-pc-error" style="display:none"></p>' +
      '<button type="button" class="arx-pc-submit">Start chat →</button>' +
      '<p class="arx-pc-consent">By continuing you agree to be contacted about your request. For account questions call ' + PHONE + ".</p>";
    msgs.appendChild(f);
    var err = f.querySelector(".arx-pc-error");
    f.querySelector(".arx-back").addEventListener("click", renderRoutes);
    f.querySelector(".arx-pc-submit").addEventListener("click", function () { submitPreChat(err); });
    f.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitPreChat(err); } });
    });
    lockInput(true);
    setTimeout(function () { var fn = document.getElementById("arx-pc-first"); if (fn) fn.focus(); }, 60);
  }

  function submitPreChat(err) {
    var first = ((document.getElementById("arx-pc-first") || {}).value || "").trim();
    var last = ((document.getElementById("arx-pc-last") || {}).value || "").trim();
    var phone = ((document.getElementById("arx-pc-phone") || {}).value || "").trim();
    var email = ((document.getElementById("arx-pc-email") || {}).value || "").trim();
    var bad = [];
    if (!first) bad.push("first");
    if (!last) bad.push("last");
    if (!phone) bad.push("phone");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad.push("email");
    ["first", "last", "phone", "email"].forEach(function (id) {
      var el = document.getElementById("arx-pc-" + id); if (el) el.classList.toggle("arx-invalid", bad.indexOf(id) >= 0);
    });
    if (bad.length) { if (err) { err.textContent = "Please enter your first name, last name and phone."; err.style.display = "block"; } return; }
    if (err) err.style.display = "none";

    LEAD = {};
    LEAD[FIELD.first] = first; LEAD[FIELD.last] = last; LEAD[FIELD.phone] = phone;
    if (email) LEAD[FIELD.email] = email;

    msgs.innerHTML = "";
    var t = typing();
    wgCall({ action: "init", session_id: sessionId, selected_path: SELPATH, selected_path_label: SELLABEL, lead: LEAD })
      .then(function (j) {
        if (t.parentNode) t.remove();
        STARTED = true;
        if (j.session_id) { sessionId = j.session_id; try { localStorage.setItem("arx_session", sessionId); } catch (e) {} }
        if (j.resumed && Array.isArray(j.history) && j.history.length) {
          j.history.forEach(function (mm) {
            if (mm && (mm.role === "user" || mm.role === "assistant"))
              addMsg(mm.role === "user" ? "user" : "ai", mm.role === "user" ? mm.content : md(mm.content), mm.content);
          });
        } else if (j.reply) addMsg("ai", md(j.reply), j.reply);
        chips(); lockInput(false); setTimeout(function () { input.focus(); }, 100);
      })
      .catch(function () {
        if (t.parentNode) t.remove();
        DEMO_MODE = true; STARTED = true;
        addMsg("ai", md("Thanks, " + first + "! You're all set — ask me anything about Absolute Recomp: memberships, coaching, day passes, hours, you name it."));
        chips(); lockInput(false); setTimeout(function () { input.focus(); }, 100);
      });
  }

  function chips() {
    var w = document.createElement("div"); w.className = "arx-welcome";
    w.innerHTML = '<div class="arx-chips">' + CHIPS.map(function (c) { return "<button>" + c + "</button>"; }).join("") + "</div>";
    msgs.appendChild(w); msgs.scrollTop = msgs.scrollHeight;
    w.querySelectorAll("button").forEach(function (b) { b.addEventListener("click", function () { input.value = b.textContent; send(); }); });
  }

  function send() {
    if (!STARTED) return;
    var text = input.value.trim(); if (!text) return;
    input.value = ""; input.style.height = "auto";
    var w = msgs.querySelector(".arx-welcome"); if (w) w.remove();
    addMsg("user", text, text); sendBtn.disabled = true;
    var t = typing();

    if (DEMO_MODE) {
      setTimeout(function () {
        if (t.parentNode) t.remove();
        var r = demoReply(text);
        addMsg("ai", md(r), r);
        sendBtn.disabled = false; input.focus();
      }, 700 + Math.min(text.length * 12, 900));
      return;
    }
    wgCall({ action: "message", session_id: sessionId, message: text, history: HISTORY.slice(0, -1), selected_path: SELPATH, selected_path_label: SELLABEL, lead: LEAD })
      .then(function (j) {
        if (t.parentNode) t.remove();
        addMsg("ai", md(j.reply || ""), j.reply || "");
      })
      .catch(function () {
        if (t.parentNode) t.remove();
        DEMO_MODE = true;
        var r = demoReply(text);
        addMsg("ai", md(r), r);
      })
      .finally(function () { sendBtn.disabled = false; input.focus(); });
  }

  function open() {
    root.classList.add("is-open"); hint.classList.remove("is-on");
    try { localStorage.setItem("arx_hint_off", "1"); } catch (e) {}
    if (!STARTED && !msgs.querySelector(".arx-prechat")) renderRoutes();
    setTimeout(function () { (STARTED ? input : document.getElementById("arx-pc-first") || input).focus(); }, 400);
  }
  orb.addEventListener("click", open);
  hint.addEventListener("click", function (e) { if (e.target.closest(".arx-hint-x")) return; open(); });
  hint.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  hint.querySelector(".arx-hint-x").addEventListener("click", function (e) { e.stopPropagation(); hint.classList.remove("is-on"); try { localStorage.setItem("arx_hint_off", "1"); } catch (er) {} });
  root.querySelector(".arx-close").addEventListener("click", function () { root.classList.remove("is-open"); });
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; });

  try {
    if (!localStorage.getItem("arx_hint_off")) {
      setTimeout(function () { if (!root.classList.contains("is-open")) hint.classList.add("is-on"); }, 3000);
      setTimeout(function () { hint.classList.remove("is-on"); }, 18000);
    }
  } catch (e) {}
})();
