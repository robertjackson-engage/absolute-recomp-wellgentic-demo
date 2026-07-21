/* Absolute Recomp — Day Pass purchase flow (demo)
   select package → contact → SMS verification (Twilio, simulated) →
   digital waiver signature → confirmation + check-in QR.

   PRODUCTION WIRING (marked stubs):
   - ABC Fitness (Ignite): prospect is created the moment contact info is
     captured (POST /prospects with first/last/email/phone + package intent).
   - Twilio Verify: POST /v2/Services/{sid}/Verifications (sms) then
     /VerificationCheck with the entered code.
   - Waiver: signature image + timestamp + pass holder stored against the
     Ignite prospect record. */
(function () {
  "use strict";

  var app = document.getElementById("daypassApp");
  if (!app) return;

  var PACKS = (window.ARX_DAYPASS && window.ARX_DAYPASS.packs) || [];
  var S = { pack: null, contact: {}, signed: false };

  function dl(evt, extra) {
    var p = { event: evt }; if (extra) for (var k in extra) p[k] = extra[k];
    try { (window.dataLayer = window.dataLayer || []).push(p); } catch (e) {}
  }
  function ignite(stage, payload) {
    /* ABC Fitness (Ignite) integration stub — in production this POSTs to the
       Ignite prospects API so the front desk sees the lead instantly. */
    try { console.info("[ABC Ignite · " + stage + "]", payload); } catch (e) {}
  }
  function twilio(stage, payload) {
    /* Twilio Verify stub — production sends a real SMS challenge. */
    try { console.info("[Twilio Verify · " + stage + "]", payload); } catch (e) {}
  }
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  var STEPS = ["Package", "Contact", "Verify", "Waiver", "Done"];
  function shell(stepIdx, inner) {
    var bars = STEPS.map(function (s, i) {
      return '<div class="dp-step' + (i < stepIdx ? " is-done" : i === stepIdx ? " is-now" : "") + '"><i></i><span>' + s + "</span></div>";
    }).join("");
    app.innerHTML = '<div class="dp-steps">' + bars + '</div><div class="dp-card">' + inner + "</div>";
    app.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- 1 · package ---------- */
  function stepPackage() {
    var cards = PACKS.map(function (p, i) {
      return '<button class="dp-pack' + (p.featured ? " is-feat" : "") + '" data-i="' + i + '">' +
        (p.featured ? '<span class="dp-flag">Best value</span>' : "") +
        "<b>" + esc(p.name) + "</b><em>" + esc(p.price) + "</em><span>" + esc(p.desc) + "</span></button>";
    }).join("");
    shell(0, "<h3>Pick your pass</h3><p class='dp-sub'>Every pass is full access — the whole floor, every visit.</p>" +
      '<div class="dp-packs">' + cards + "</div>" +
      "<p class='dp-note'>Visit packs never expire. Pricing per the current day-pass menu — confirmed at checkout.</p>");
    app.querySelectorAll(".dp-pack").forEach(function (b) {
      b.addEventListener("click", function () {
        S.pack = PACKS[+b.getAttribute("data-i")];
        dl("daypass_package_selected", { pack: S.pack.name });
        stepContact();
      });
    });
  }

  /* ---------- 2 · contact (creates the Ignite prospect) ---------- */
  function stepContact() {
    shell(1, "<h3>Who's coming in?</h3><p class='dp-sub'>" + esc(S.pack.name) + " · " + esc(S.pack.price) + " — <button class='dp-link' data-back>change</button></p>" +
      '<div class="dp-grid">' +
      '<div class="dp-field"><label for="dpFirst">First name</label><input id="dpFirst" autocomplete="given-name" value="' + esc(S.contact.first) + '"></div>' +
      '<div class="dp-field"><label for="dpLast">Last name</label><input id="dpLast" autocomplete="family-name" value="' + esc(S.contact.last) + '"></div>' +
      '<div class="dp-field dp-full"><label for="dpEmail">Email</label><input id="dpEmail" type="email" autocomplete="email" value="' + esc(S.contact.email) + '"></div>' +
      '<div class="dp-field dp-full"><label for="dpPhone">Mobile phone</label><input id="dpPhone" type="tel" autocomplete="tel" value="' + esc(S.contact.phone) + '"></div>' +
      "</div>" +
      '<p class="dp-err" style="display:none"></p>' +
      '<button class="dp-btn" data-next>Text me a verification code →</button>' +
      "<p class='dp-note'>We'll text a 6-digit code to verify your number. Msg &amp; data rates may apply. Reply STOP to opt out.</p>");
    app.querySelector("[data-back]").addEventListener("click", stepPackage);
    app.querySelector("[data-next]").addEventListener("click", function () {
      var c = {
        first: document.getElementById("dpFirst").value.trim(),
        last: document.getElementById("dpLast").value.trim(),
        email: document.getElementById("dpEmail").value.trim(),
        phone: document.getElementById("dpPhone").value.trim()
      };
      var err = app.querySelector(".dp-err");
      if (!c.first || !c.last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email) || c.phone.replace(/\D/g, "").length < 10) {
        err.textContent = "Please fill in your name, a valid email and a mobile number.";
        err.style.display = "block"; return;
      }
      S.contact = c;
      /* prospect exists from this moment — even if they abandon at verify */
      ignite("prospect.create", { first: c.first, last: c.last, email: c.email, phone: c.phone, intent: S.pack.name });
      dl("daypass_contact_captured", { pack: S.pack.name });
      twilio("verification.send", { to: c.phone, channel: "sms" });
      stepVerify();
    });
  }

  /* ---------- 3 · SMS verification (simulated Twilio) ---------- */
  function stepVerify() {
    shell(2, "<h3>Check your phone</h3><p class='dp-sub'>We texted a 6-digit code to <strong>" + esc(S.contact.phone) + "</strong>.</p>" +
      '<div class="dp-otp">' + '<input maxlength="1" inputmode="numeric">'.repeat(6) + "</div>" +
      '<p class="dp-demo-hint">Demo: any 6 digits work — production uses Twilio Verify.</p>' +
      '<button class="dp-btn" data-verify disabled style="opacity:.45">Verify →</button>' +
      "<p class='dp-note'><button class='dp-link' data-resend>Resend code</button> · <button class='dp-link' data-back>Change number</button></p>");
    var inputs = [].slice.call(app.querySelectorAll(".dp-otp input"));
    var btn = app.querySelector("[data-verify]");
    inputs.forEach(function (inp, i) {
      inp.addEventListener("input", function () {
        if (inp.value && i < 5) inputs[i + 1].focus();
        var full = inputs.every(function (x) { return x.value.length === 1; });
        btn.disabled = !full; btn.style.opacity = full ? "1" : ".45";
      });
      inp.addEventListener("keydown", function (e) { if (e.key === "Backspace" && !inp.value && i > 0) inputs[i - 1].focus(); });
    });
    inputs[0].focus();
    app.querySelector("[data-back]").addEventListener("click", stepContact);
    app.querySelector("[data-resend]").addEventListener("click", function (e) {
      e.target.textContent = "Code re-sent ✓";
      twilio("verification.resend", { to: S.contact.phone });
    });
    btn.addEventListener("click", function () {
      twilio("verification.check", { to: S.contact.phone, status: "approved (simulated)" });
      dl("daypass_phone_verified", {});
      stepWaiver();
    });
  }

  /* ---------- 4 · waiver + signature ---------- */
  function stepWaiver() {
    shell(3, "<h3>One signature and you're in</h3><p class='dp-sub'>Liability waiver &amp; release — " + esc(S.contact.first) + " " + esc(S.contact.last) + "</p>" +
      '<div class="dp-waiver">' +
      "<p><strong>Assumption of Risk.</strong> I understand that exercise and use of fitness facilities carry inherent risks, and I voluntarily accept those risks.</p>" +
      "<p><strong>Release.</strong> I release Absolute Recomp, its owners, coaches and staff from liability for injuries arising from ordinary negligence, to the fullest extent permitted by law.</p>" +
      "<p><strong>Medical Readiness.</strong> I confirm I am physically able to participate, and I will follow staff instruction and posted rules while in the facility.</p>" +
      "<p><strong>Media &amp; Contact.</strong> I agree to be contacted about my visit. This is a demonstration waiver — the production version carries the club's full legal text.</p>" +
      "</div>" +
      "<label class='dp-sig-label'>Sign below</label>" +
      '<div class="dp-sig-wrap"><canvas id="dpSig" width="640" height="180"></canvas>' +
      '<button class="dp-link dp-sig-clear">Clear</button></div>' +
      '<p class="dp-err" style="display:none"></p>' +
      '<button class="dp-btn" data-agree>I agree &amp; sign →</button>' +
      "<p class='dp-note'>Signed " + new Date().toLocaleDateString() + " · stored with your guest record.</p>");

    var canvas = document.getElementById("dpSig"), ctx = canvas.getContext("2d");
    var drawing = false, drew = false;
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.strokeStyle = "#16181d";
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
    }
    function start(e) { drawing = true; drew = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", end);
    app.querySelector(".dp-sig-clear").addEventListener("click", function () { ctx.clearRect(0, 0, canvas.width, canvas.height); drew = false; });

    app.querySelector("[data-agree]").addEventListener("click", function () {
      var err = app.querySelector(".dp-err");
      if (!drew) { err.textContent = "Please sign in the box above."; err.style.display = "block"; return; }
      S.signed = true;
      ignite("waiver.attach", { prospect: S.contact.email, signature: "(png, " + canvas.toDataURL().length + " bytes)", signedAt: new Date().toISOString() });
      dl("daypass_waiver_signed", {});
      twilio("sms.send", { to: S.contact.phone, body: "Your Absolute Recomp day pass is ready — download the app to check in: (app link)" });
      stepDone();
    });
  }

  /* ---------- 5 · confirmation ---------- */
  function stepDone() {
    shell(4, '<div class="dp-done"><div class="dp-check">✓</div>' +
      "<h3>You're in, " + esc(S.contact.first) + "!</h3>" +
      "<p class='dp-sub'>A text is on its way to <strong>" + esc(S.contact.phone) + "</strong>. Download the <strong>Absolute Recomp app</strong> to check in today.</p>" +
      '<div class="dp-summary">' +
      "<div><span>Pass</span><b>" + esc(S.pack.name) + "</b></div>" +
      "<div><span>Amount</span><b>" + esc(S.pack.price) + "</b></div>" +
      "<div><span>Guest</span><b>" + esc(S.contact.first) + " " + esc(S.contact.last) + "</b></div>" +
      "<div><span>Waiver</span><b>Signed ✓</b></div>" +
      "</div>" +
      '<p class="dp-qr-label">Use the QR code below to check in when you arrive</p>' +
      '<img class="dp-qr" src="assets/img/daypass-qr.png" alt="Day pass check-in QR code" width="180" height="180">' +
      '<div class="dp-apps"><span class="dp-badge">&#63743; App Store</span><span class="dp-badge">▶ Google Play</span></div>' +
      "<p class='dp-note'>See you on the floor. Questions? Ask Atlas — the chat in the corner.</p></div>");
    dl("daypass_completed", { pack: S.pack.name });
  }

  stepPackage();
})();
