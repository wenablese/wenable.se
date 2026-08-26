/* Wenable — admin / auth module (prototype)
   --------------------------------------------------------------------------
   IMPORTANT: these pages are static HTML with no application server, so this
   is a CLIENT-SIDE prototype of the feature, not production auth.

   - The admin password is NEVER stored in plaintext. Only a SHA-256 hash of
     `${SALT}:${username}:${password}` is embedded below, computed with the
     browser's Web Crypto API. The real password cannot be read from the code.
   - Login state and any assignments added through the form are persisted in
     the browser (localStorage). Wiring this to a real backend (server-side
     credential store + database) is a later developer-handoff step.

   Self-contained: injects its own CSS, a nav login/logout control, the login
   modal, and — on the assignments page — the "Add assignment" form and the
   rendering of stored assignments. Just include this script on a page.       */
(function () {
  "use strict";

  /* ============================ CONFIG ============================
     Fyll i dina Supabase-uppgifter nedan. anon-nyckeln är säker att ha
     här i klartext SÅ LÄNGE Row Level Security är påslaget på tabellen
     (se DEPLOY.md). Utan RLS kan vem som helst skriva till databasen. */
  var SUPABASE_URL      = "https://kvhfqedtjtlzrgmajuqq.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_0lwYtUVCBWNceqcUD8P3OQ_BB0gSfrp";
  var TABLE             = "assignments";
  /* =============================================================== */

  var sb = null;                                   // Supabase-klient (sätts av loadSupabase)
  var state = { session: null, assignments: [] };  // session + synkron cache för render

  /* ----------------------------------------------------------------- utils */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function reapplyLang() {
    if (window.WenableLang) window.WenableLang.set(window.WenableLang.get());
  }
  function isSV() { return window.WenableLang && window.WenableLang.get() === "sv"; }

  /* ------------------------------------------------------ supabase client */
  function loadSupabaseLib() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement("script");
      s.src = "assets/vendor/supabase.js";      // self-hostat → tillåtet av script-src 'self'
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("kunde inte ladda assets/vendor/supabase.js")); };
      document.head.appendChild(s);
    });
  }
  async function loadSupabase() {
    if (SUPABASE_URL.indexOf("DITT-PROJEKT") !== -1 ||
        !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf("DIN-ANON") !== -1) {
      console.warn("[wenable] Supabase är inte konfigurerat — fyll i SUPABASE_URL och " +
                   "SUPABASE_ANON_KEY högst upp i assets/admin.js (se DEPLOY.md).");
    }
    await loadSupabaseLib();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /* ---------------------------------------------------------------- auth */
  function isLoggedIn() { return !!state.session; }
  async function tryLogin(email, pass) {
    if (!sb) return false;
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { console.warn("[wenable] login:", res.error.message); return false; }
    state.session = res.data.session;
    return true;
  }
  async function logout() {
    try { if (sb) await sb.auth.signOut(); } catch (e) { /* ignore */ }
    state.session = null;
  }

  /* --------------------------------------------------------------- store */
  /* Uppdragen ligger i en Supabase-tabell (publik läsning, admin-only skrivning
     via Row Level Security). state.assignments är en synkron cache som render-
     koden läser; refresh() hämtar om och ritar om. */
  function loadAssignments() { return state.assignments; }
  async function fetchAssignments() {
    if (!sb) return state.assignments;
    var res = await sb.from(TABLE).select("*").order("created_at", { ascending: false });
    if (res.error) { console.error("[wenable] fetch:", res.error.message); return state.assignments; }
    return res.data || [];
  }
  async function insertAssignment(item) {
    var res = await sb.from(TABLE).insert(item).select().single();
    if (res.error) throw res.error;
    return res.data;
  }
  async function updateAssignment(id, patch) {
    var res = await sb.from(TABLE).update(patch).eq("id", id).select().single();
    if (res.error) throw res.error;
    return res.data;
  }
  async function deleteAssignment(id) {
    var res = await sb.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
  }
  async function refresh() {
    state.assignments = await fetchAssignments();
    renderStoredAssignments();
    renderAddBar();
  }

  /* --------------------------------------------------------------- styles */
  function injectStyles() {
    var css = [
      /* nav login control */
      ".wadm-auth{display:inline-flex;align-items:center;gap:10px;margin-left:6px;}",
      ".wadm-auth .wadm-sep{width:1px;height:16px;background:var(--line-2,rgba(255,255,255,.14));}",
      ".wadm-btn{font:inherit;font-size:11px;letter-spacing:.18em;text-transform:uppercase;",
      "  padding:5px 12px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:999px;",
      "  background:transparent;color:var(--muted,#8aa0bd);cursor:pointer;transition:background .2s,color .2s,border-color .2s;}",
      ".wadm-btn:hover{color:var(--ink,#eaf1fb);border-color:var(--line-2,rgba(255,255,255,.2));}",
      ".wadm-btn.solid{background:var(--orange,#f39019);border-color:var(--orange,#f39019);color:#0a1628;font-weight:600;}",
      ".wadm-btn.solid:hover{filter:brightness(1.06);color:#0a1628;}",
      ".wadm-who{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--orange,#f39019);display:inline-flex;align-items:center;gap:7px;}",
      ".wadm-who .wadm-dot{width:6px;height:6px;border-radius:50%;background:var(--orange,#f39019);box-shadow:0 0 0 4px rgba(243,144,25,.18);}",
      /* overlay + modal */
      ".wadm-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:flex-start;justify-content:center;",
      "  padding:7vh 20px 40px;background:rgba(5,12,24,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow-y:auto;}",
      ".wadm-overlay.open{display:flex;}",
      ".wadm-modal{width:100%;max-width:440px;background:var(--bg-2,#0e1e36);border:1px solid var(--line-2,rgba(255,255,255,.16));",
      "  box-shadow:0 40px 120px rgba(0,0,0,.55);padding:36px 36px 32px;animation:wadmIn .26s ease;}",
      ".wadm-modal.wide{max-width:680px;}",
      "@keyframes wadmIn{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}",
      ".wadm-eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--orange,#f39019);display:flex;align-items:center;gap:10px;}",
      ".wadm-eyebrow .wadm-dot{width:6px;height:6px;border-radius:50%;background:var(--orange,#f39019);}",
      ".wadm-modal h2{font-size:26px;line-height:1.12;margin:14px 0 6px;color:var(--ink,#eaf1fb);}",
      ".wadm-modal .wadm-lede{font-size:14px;line-height:1.5;color:var(--muted-2,#aebcd1);margin:0 0 24px;}",
      ".wadm-close{position:absolute;top:16px;right:18px;background:none;border:0;color:var(--muted,#8aa0bd);font-size:22px;line-height:1;cursor:pointer;padding:4px;}",
      ".wadm-close:hover{color:var(--ink,#eaf1fb);}",
      ".wadm-modal-head{position:relative;}",
      /* form */
      ".wadm-field{margin-bottom:16px;}",
      ".wadm-field.row2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}",
      ".wadm-field label{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#8aa0bd);margin-bottom:7px;}",
      ".wadm-input,.wadm-select,.wadm-textarea{width:100%;font:inherit;font-size:14px;color:var(--ink,#eaf1fb);background:rgba(255,255,255,.03);",
      "  border:1px solid var(--line-2,rgba(255,255,255,.16));padding:11px 13px;border-radius:0;transition:border-color .2s,background .2s;}",
      ".wadm-input:focus,.wadm-select:focus,.wadm-textarea:focus{outline:none;border-color:var(--orange,#f39019);background:rgba(255,255,255,.05);}",
      ".wadm-textarea{resize:vertical;min-height:84px;line-height:1.5;}",
      ".wadm-select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted,#8aa0bd) 50%),linear-gradient(135deg,var(--muted,#8aa0bd) 50%,transparent 50%);background-position:calc(100% - 18px) 17px,calc(100% - 13px) 17px;background-size:5px 5px,5px 5px;background-repeat:no-repeat;}",
      ".wadm-hint{font-size:12px;color:var(--muted,#8aa0bd);margin-top:7px;line-height:1.45;}",
      ".wadm-error{font-size:13px;color:#ff8b8b;margin:2px 0 16px;min-height:1px;}",
      ".wadm-actions{display:flex;align-items:center;gap:14px;margin-top:26px;flex-wrap:wrap;}",
      ".wadm-actions .wadm-spacer{flex:1;}",
      /* big primary/ghost buttons reuse site .btn look */
      ".wadm-cta{font:inherit;font-size:14px;font-weight:600;padding:13px 22px;border:1px solid transparent;cursor:pointer;transition:transform .15s,background .2s,color .2s,border-color .2s;}",
      ".wadm-cta.primary{background:var(--orange,#f39019);color:#0a1628;}",
      ".wadm-cta.primary:hover{transform:translateY(-1px);}",
      ".wadm-cta.ghost{background:transparent;color:var(--ink,#eaf1fb);border-color:var(--line-2,rgba(255,255,255,.2));}",
      ".wadm-cta.ghost:hover{border-color:var(--ink,#eaf1fb);}",
      /* add-assignment trigger in list */
      ".wadm-addbar{margin:0 0 18px;display:flex;flex-direction:column;gap:10px;}",
      ".wadm-addbar .wadm-modeflag{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--orange,#f39019);display:inline-flex;align-items:center;gap:7px;}",
      ".wadm-addbar .wadm-modeflag .wadm-dot{width:6px;height:6px;border-radius:50%;background:var(--orange,#f39019);box-shadow:0 0 0 4px rgba(243,144,25,.18);}",
      ".wadm-add{width:100%;font:inherit;font-size:13px;font-weight:600;letter-spacing:.04em;padding:13px 16px;cursor:pointer;",
      "  background:var(--orange,#f39019);color:#0a1628;border:0;display:flex;align-items:center;justify-content:center;gap:9px;transition:transform .15s,filter .2s;}",
      ".wadm-add:hover{transform:translateY(-1px);filter:brightness(1.05);}",
      /* custom badge + remove on detail */
      ".wadm-custom-badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--orange,#f39019);border:1px solid var(--orange,#f39019);padding:3px 8px;margin-left:8px;}",
      ".wadm-remove{font:inherit;font-size:13px;font-weight:600;padding:13px 18px;cursor:pointer;background:transparent;color:#ff8b8b;border:1px solid rgba(255,139,139,.4);transition:background .2s,border-color .2s;}",
      ".wadm-remove:hover{background:rgba(255,139,139,.08);border-color:#ff8b8b;}",
      ".wadm-editbtn{font:inherit;font-size:13px;font-weight:600;padding:13px 18px;cursor:pointer;background:transparent;color:var(--orange,#f39019);border:1px solid var(--orange,#f39019);transition:background .2s;}",
      ".wadm-editbtn:hover{background:rgba(243,144,25,.08);}",
      /* targeted custom/standard row highlight handled in JS via .active */
      ".assign-row.wadm-active{border-color:var(--orange,#f39019)!important;background:var(--bg-3,#122847)!important;}",
      ".assign-row.wadm-active::before{width:4px!important;}",
      ".auth-gated{display:none!important;}",
      "body.wadm-is-loggedin a.auth-gated{display:inline!important;font-style:italic;}",
      "@media (max-width:520px){.wadm-field.row2{grid-template-columns:1fr;}.wadm-modal{padding:28px 22px;}}"
    ].join("\n");
    document.head.appendChild(el("style", { "data-wadm": "1" }, css));
  }

  /* --------------------------------------------------- login modal markup */
  var loginOverlay;
  function buildLoginModal() {
    loginOverlay = el("div", { "class": "wadm-overlay", "id": "wadm-login" });
    loginOverlay.innerHTML =
      '<div class="wadm-modal" role="dialog" aria-modal="true" aria-labelledby="wadm-login-t">' +
        '<div class="wadm-modal-head">' +
          '<button type="button" class="wadm-close" data-wadm-dismiss aria-label="Close">&times;</button>' +
          '<div class="wadm-eyebrow"><span class="wadm-dot"></span><span data-sv="Administratör">Admin access</span></div>' +
          '<h2 id="wadm-login-t" data-sv="Logga in">Sign in</h2>' +
          '<p class="wadm-lede" data-sv="Logga in för att hantera uppdrag på den här sidan.">Sign in to manage assignments on this site.</p>' +
        '</div>' +
        '<form id="wadm-login-form" autocomplete="off">' +
          '<div class="wadm-field">' +
            '<label for="wadm-u" data-sv="E-post">Email</label>' +
            '<input class="wadm-input" id="wadm-u" name="u" type="email" autocomplete="username" required>' +
          '</div>' +
          '<div class="wadm-field">' +
            '<label for="wadm-p" data-sv="Lösenord">Password</label>' +
            '<input class="wadm-input" id="wadm-p" name="p" type="password" autocomplete="current-password" required>' +
          '</div>' +
          '<div class="wadm-error" id="wadm-login-err" role="alert"></div>' +
          '<div class="wadm-actions">' +
            '<button type="submit" class="wadm-cta primary" data-sv="Logga in">Sign in</button>' +
            '<button type="button" class="wadm-cta ghost" data-wadm-dismiss data-sv="Avbryt">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(loginOverlay);

    loginOverlay.addEventListener("click", function (e) {
      if (e.target === loginOverlay || e.target.hasAttribute("data-wadm-dismiss")) closeLogin();
    });
    $("#wadm-login-form", loginOverlay).addEventListener("submit", async function (e) {
      e.preventDefault();
      var errEl = $("#wadm-login-err", loginOverlay);
      errEl.textContent = "";
      var email = $("#wadm-u", loginOverlay).value.trim();
      var p = $("#wadm-p", loginOverlay).value;
      var ok = false;
      try { ok = await tryLogin(email, p); } catch (err) { ok = false; }
      if (ok) {
        closeLogin();
        $("#wadm-login-form", loginOverlay).reset();
        renderNavAuth();
        onAuthChanged();
      } else {
        errEl.textContent = isSV()
          ? "Fel användarnamn eller lösenord."
          : "Incorrect username or password.";
      }
    });
  }
  function openLogin() {
    loginOverlay.classList.add("open");
    $("#wadm-login-err", loginOverlay).textContent = "";
    setTimeout(function () { $("#wadm-u", loginOverlay).focus(); }, 30);
  }
  function closeLogin() { loginOverlay.classList.remove("open"); }

  function updateAuthGatedVisibility() {
    document.body.classList.toggle("wadm-is-loggedin", isLoggedIn());
  }

  /* ------------------------------------------------------- nav auth control */
  function renderNavAuth() {
    updateAuthGatedVisibility();
    document.querySelectorAll(".nav-meta").forEach(function (meta) {
      var existing = $(".wadm-auth", meta);
      if (existing) existing.remove();
      var wrap = el("div", { "class": "wadm-auth" });
      wrap.appendChild(el("span", { "class": "wadm-sep", "aria-hidden": "true" }));
      if (isLoggedIn()) {
        wrap.appendChild(el("span", { "class": "wadm-who" },
          '<span class="wadm-dot"></span><span data-sv="Admin">Admin</span>'));
        var out = el("button", { "type": "button", "class": "wadm-btn", "data-sv": "Logga ut" }, "Log out");
        out.addEventListener("click", async function () {
          await logout();
          renderNavAuth();
          onAuthChanged();
        });
        wrap.appendChild(out);
      } else {
        var login = el("button", { "type": "button", "class": "wadm-btn", "data-sv": "Logga in" }, "Login");
        login.addEventListener("click", openLogin);
        wrap.appendChild(login);
      }
      meta.appendChild(wrap);
    });
    reapplyLang();
  }

  /* =====================================================================
     ASSIGNMENTS PAGE INTEGRATION
     ===================================================================== */
  var CATS = {
    ai:    { en: "AI",    sv: "AI" },
    cyber: { en: "Cyber", sv: "Cyber" },
    it:    { en: "IT",    sv: "IT" }
  };

  function isAssignmentsPage() { return !!$(".assign-app .assign-list"); }

  function renderStoredAssignments() {
    if (!isAssignmentsPage()) return;
    var list  = $(".assign-list");
    var stage = $(".assign-detail-stage");
    if (!list || !stage) return;

    // clear previously injected
    list.querySelectorAll('[data-custom="1"]').forEach(function (n) { n.remove(); });
    stage.querySelectorAll('.assign-detail[data-custom="1"]').forEach(function (n) { n.remove(); });

    var items = loadAssignments();
    // styr tomtillståndet: "välj ett uppdrag" vs "kommer snart" (CSS gör resten)
    document.body.classList.toggle("wadm-has-assignments", items.length > 0);
    var anchor = $("h4", list); // insert rows right after the count header
    var loggedIn = isLoggedIn();

    items.forEach(function (a) {
      var catEn = (CATS[a.category] || CATS.it).en;
      var catSv = (CATS[a.category] || CATS.it).sv;
      var filled = a.status === "filled";
      var statusEn = filled ? "Filled" : "Open";
      var statusSv = filled ? "Tillsatt" : "Öppet";

      /* list row */
      var row = el("a", { "class": "assign-row", "href": "#" + a.id, "data-custom": "1" });
      row.innerHTML =
        '<div class="row-meta">' + esc(a.location) + '</div>' +
        '<div class="row-title">' + esc(a.title) + '</div>' +
        '<div class="row-foot">' +
          '<span class="row-tag' + (filled ? " closed" : "") + '" data-sv="' + esc(statusSv + " · " + catSv) + '">' +
            esc(statusEn + " · " + catEn) + '</span>' +
        '</div>';
      if (anchor && anchor.nextSibling) list.insertBefore(row, anchor.nextSibling);
      else list.appendChild(row);

      /* detail article */
      var tags = (a.tags || []).map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join("");
      var workHtml = String(a.work || "").split(/\n{2,}|\n/).filter(Boolean)
        .map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");

      var detail = el("article", { "class": "assign-detail", "id": a.id, "data-custom": "1" });
      detail.innerHTML =
        '<div class="d-eyebrow" data-sv="' + esc(statusSv + " · " + catSv + (a.location ? " · " + a.location : "")) + '">' +
          esc(statusEn + " · " + catEn + (a.location ? " · " + a.location : "")) +
          '<span class="wadm-custom-badge"><span data-sv="Tillagt">Added</span></span></div>' +
        '<h2>' + esc(a.title) + '</h2>' +
        (a.lede ? '<p class="d-lede">' + esc(a.lede) + '</p>' : '') +
        '<div class="d-grid">' +
          cell("Plats", "Location", a.location || "—") +
          cell("Kategori", "Category", catEn) +
          cell("Status", "Status", statusEn) +
          (a.start ? cell("Start", "Start", a.start) : "") +
        '</div>' +
        (workHtml || tags ?
          '<div class="d-section">' +
            (workHtml ? '<h3 data-sv="Arbetet">The work</h3>' + workHtml : '') +
            (tags ? '<h3 data-sv="Fokusområden">Areas of focus</h3><div class="d-stack">' + tags + '</div>' : '') +
          '</div>' : '') +
        '<div class="assign-actions">' +
          '<button type="button" class="btn btn-primary" data-sv="Ansök till detta uppdrag <span class=&quot;arr&quot;>→</span>">Apply for this assignment <span class="arr">→</span></button>' +
          (a.ref ? '<span class="meta-side">REF · ' + esc(a.ref) + '</span>' : '') +
          (loggedIn ? '<button type="button" class="wadm-editbtn" data-wadm-edit="' + esc(a.id) + '" data-sv="Redigera">Edit</button>' : '') +
          (loggedIn ? '<button type="button" class="wadm-remove" data-wadm-del="' + esc(a.id) + '" data-sv="Ta bort uppdrag">Remove assignment</button>' : '') +
        '</div>';
      stage.appendChild(detail);
    });

    // bind remove buttons
    stage.querySelectorAll("[data-wadm-del]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-wadm-del");
        var msg = isSV() ? "Ta bort det här uppdraget?" : "Remove this assignment?";
        if (!window.confirm(msg)) return;
        try { await deleteAssignment(id); }
        catch (e) {
          window.alert((isSV() ? "Kunde inte ta bort: " : "Could not remove: ") + (e.message || e));
          return;
        }
        if (location.hash === "#" + id) location.hash = "";
        await refresh();
        syncActiveRow();
      });
    });

    // bind edit buttons
    stage.querySelectorAll("[data-wadm-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-wadm-edit");
        var a = loadAssignments().filter(function (x) { return x.id === id; })[0];
        if (a) openEdit(a);
      });
    });

    reapplyLang();
    syncActiveRow();
  }
  function cell(svLbl, enLbl, val) {
    return '<div class="cell"><div class="lbl" data-sv="' + esc(svLbl) + '">' + esc(enLbl) +
           '</div><div class="val">' + esc(val) + '</div></div>';
  }

  /* generic active-row highlight (works for built-in AND custom rows) */
  function syncActiveRow() {
    var hash = location.hash;
    document.querySelectorAll(".assign-row").forEach(function (r) {
      r.classList.toggle("wadm-active", hash && r.getAttribute("href") === hash);
    });
  }

  /* ---- add/edit-assignment form ---- */
  var addOverlay;
  var editingId = null;   // null = läge "nytt uppdrag"; annars id på det som redigeras
  function buildAddModal() {
    addOverlay = el("div", { "class": "wadm-overlay", "id": "wadm-add-overlay" });
    addOverlay.innerHTML =
      '<div class="wadm-modal wide" role="dialog" aria-modal="true" aria-labelledby="wadm-add-t">' +
        '<div class="wadm-modal-head">' +
          '<button type="button" class="wadm-close" data-wadm-dismiss aria-label="Close">&times;</button>' +
          '<div class="wadm-eyebrow"><span class="wadm-dot"></span><span id="wadm-add-mode" data-sv="Nytt uppdrag">New assignment</span></div>' +
          '<h2 id="wadm-add-t" data-sv="Lägg till ett uppdrag">Add an assignment</h2>' +
          '<p class="wadm-lede" data-sv="Det här uppdraget publiceras i listan. Fält markerade med * krävs.">This assignment will appear in the list. Fields marked * are required.</p>' +
        '</div>' +
        '<form id="wadm-add-form" autocomplete="off">' +
          '<div class="wadm-field">' +
            '<label for="wadm-title" data-sv="Titel *">Title *</label>' +
            '<input class="wadm-input" id="wadm-title" name="title" type="text" required ' +
              'data-sv-attr-placeholder="t.ex. Senior AI-ingenjör – finanssektorn" placeholder="e.g. Senior AI engineer — financial services">' +
          '</div>' +
          '<div class="wadm-field row2">' +
            '<div><label for="wadm-cat" data-sv="Kategori *">Category *</label>' +
              '<select class="wadm-select" id="wadm-cat" name="category">' +
                '<option value="ai">AI</option><option value="cyber" data-sv="Cybersäkerhet">Cyber Security</option><option value="it">IT</option>' +
              '</select></div>' +
            '<div><label for="wadm-status" data-sv="Status">Status</label>' +
              '<select class="wadm-select" id="wadm-status" name="status">' +
                '<option value="open" data-sv="Öppet">Open</option><option value="filled" data-sv="Tillsatt">Filled</option>' +
              '</select></div>' +
          '</div>' +
          '<div class="wadm-field row2">' +
            '<div><label for="wadm-loc" data-sv="Plats *">Location *</label>' +
              '<input class="wadm-input" id="wadm-loc" name="location" type="text" required ' +
                'data-sv-attr-placeholder="t.ex. Göteborg · Hybrid" placeholder="e.g. Göteborg · Hybrid"></div>' +
            '<div><label for="wadm-start" data-sv="Start">Start</label>' +
              '<input class="wadm-input" id="wadm-start" name="start" type="text" placeholder="e.g. Q3 2026"></div>' +
          '</div>' +
          '<div class="wadm-field">' +
            '<label for="wadm-lede" data-sv="Sammanfattning">Summary</label>' +
            '<textarea class="wadm-textarea" id="wadm-lede" name="lede" ' +
              'data-sv-attr-placeholder="En eller två meningar om uppdraget." placeholder="One or two sentences describing the engagement."></textarea>' +
          '</div>' +
          '<div class="wadm-field">' +
            '<label for="wadm-work" data-sv="Arbetet">The work</label>' +
            '<textarea class="wadm-textarea" id="wadm-work" name="work" ' +
              'data-sv-attr-placeholder="Beskriv arbetet. Lämna en tom rad mellan stycken." placeholder="Describe the work. Leave a blank line between paragraphs."></textarea>' +
          '</div>' +
          '<div class="wadm-field row2">' +
            '<div><label for="wadm-tags" data-sv="Fokusområden (kommaseparerade)">Focus areas (comma-separated)</label>' +
              '<input class="wadm-input" id="wadm-tags" name="tags" type="text" placeholder="LLM, Python, Azure"></div>' +
            '<div><label for="wadm-ref" data-sv="Referens">Reference</label>' +
              '<input class="wadm-input" id="wadm-ref" name="ref" type="text" placeholder="WEN-2026-090"></div>' +
          '</div>' +
          '<div class="wadm-error" id="wadm-add-err" role="alert"></div>' +
          '<div class="wadm-actions">' +
            '<button type="submit" id="wadm-add-submit" class="wadm-cta primary" data-sv="Publicera uppdrag">Publish assignment</button>' +
            '<button type="button" class="wadm-cta ghost" data-wadm-dismiss data-sv="Avbryt">Cancel</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(addOverlay);

    addOverlay.addEventListener("click", function (e) {
      if (e.target === addOverlay || e.target.hasAttribute("data-wadm-dismiss")) closeAdd();
    });
    $("#wadm-add-form", addOverlay).addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!isLoggedIn()) { closeAdd(); openLogin(); return; }
      var f = e.target.elements; // use the elements collection — f.title would
                                 // resolve to HTMLElement.title, not the input.
      var title = f.title.value.trim();
      var loc   = f.location.value.trim();
      var errEl = $("#wadm-add-err", addOverlay);
      if (!title || !loc) {
        errEl.textContent = isSV() ? "Titel och plats krävs." : "Title and location are required.";
        return;
      }
      var payload = {
        title: title,
        category: f.category.value,
        status: f.status.value,
        location: loc,
        start: f.start.value.trim(),
        lede: f.lede.value.trim(),
        work: f.work.value.trim(),
        ref: f.ref.value.trim(),
        tags: f.tags.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
      };
      var idBeingEdited = editingId;   // fånga innan closeAdd() nollställer
      var saved;
      try {
        saved = idBeingEdited
          ? await updateAssignment(idBeingEdited, payload)
          : await insertAssignment(payload);
      } catch (err) {
        errEl.textContent = (idBeingEdited
          ? (isSV() ? "Kunde inte spara: " : "Could not save: ")
          : (isSV() ? "Kunde inte publicera: " : "Could not publish: ")) + (err.message || err);
        return;
      }
      e.target.reset();
      errEl.textContent = "";
      closeAdd();
      await refresh();
      if (saved && saved.id) location.hash = "#" + saved.id;
    });
  }
  /* växla modalens rubriker/knapp mellan lägena "nytt" och "redigera" */
  function setAddModalMode(mode) {
    var eb  = $("#wadm-add-mode", addOverlay);
    var h2  = $("#wadm-add-t", addOverlay);
    var sub = $("#wadm-add-submit", addOverlay);
    if (mode === "edit") {
      if (eb)  { eb.textContent  = "Edit assignment";  eb.setAttribute("data-sv", "Redigera uppdrag"); }
      if (h2)  { h2.textContent  = "Edit assignment";  h2.setAttribute("data-sv", "Redigera uppdraget"); }
      if (sub) { sub.textContent = "Save changes";     sub.setAttribute("data-sv", "Spara ändringar"); }
    } else {
      if (eb)  { eb.textContent  = "New assignment";     eb.setAttribute("data-sv", "Nytt uppdrag"); }
      if (h2)  { h2.textContent  = "Add an assignment";  h2.setAttribute("data-sv", "Lägg till ett uppdrag"); }
      if (sub) { sub.textContent = "Publish assignment"; sub.setAttribute("data-sv", "Publicera uppdrag"); }
    }
    reapplyLang();
  }

  function openAdd() {
    if (!isLoggedIn()) { openLogin(); return; }
    editingId = null;
    $("#wadm-add-form", addOverlay).reset();
    setAddModalMode("new");
    addOverlay.classList.add("open");
    $("#wadm-add-err", addOverlay).textContent = "";
    setTimeout(function () { $("#wadm-title", addOverlay).focus(); }, 30);
  }

  function openEdit(a) {
    if (!isLoggedIn()) { openLogin(); return; }
    editingId = a.id;
    var f = $("#wadm-add-form", addOverlay).elements;
    f.title.value    = a.title    || "";
    f.category.value = a.category || "it";
    f.status.value   = a.status   || "open";
    f.location.value = a.location || "";
    f.start.value    = a.start    || "";
    f.lede.value     = a.lede     || "";
    f.work.value     = a.work     || "";
    f.tags.value     = (a.tags || []).join(", ");
    f.ref.value      = a.ref      || "";
    setAddModalMode("edit");
    addOverlay.classList.add("open");
    $("#wadm-add-err", addOverlay).textContent = "";
    setTimeout(function () { $("#wadm-title", addOverlay).focus(); }, 30);
  }

  function closeAdd() { addOverlay.classList.remove("open"); editingId = null; }

  /* add-assignment trigger inside the list header */
  function renderAddBar() {
    if (!isAssignmentsPage()) return;
    var list = $(".assign-list");
    var old = $(".wadm-addbar", list);
    if (old) old.remove();
    if (!isLoggedIn()) return;
    var h4 = $("h4", list);
    var bar = el("div", { "class": "wadm-addbar" });
    bar.innerHTML =
      '<span class="wadm-modeflag"><span class="wadm-dot"></span><span data-sv="Adminläge">Admin mode</span></span>' +
      '<button type="button" class="wadm-add"><span aria-hidden="true">+</span> <span data-sv="Lägg till uppdrag">Add assignment</span></button>';
    if (h4 && h4.nextSibling) list.insertBefore(bar, h4.nextSibling);
    else list.insertBefore(bar, list.firstChild);
    $(".wadm-add", bar).addEventListener("click", openAdd);
    reapplyLang();
  }

  /* react to auth changes */
  function onAuthChanged() {
    renderAddBar();
    renderStoredAssignments(); // re-render so remove buttons appear/disappear
  }

  /* ----------------------------------------------------------------- init */
  async function init() {
    injectStyles();
    buildLoginModal();
    try {
      await loadSupabase();
      var s = await sb.auth.getSession();
      state.session = (s && s.data) ? s.data.session : null;
      sb.auth.onAuthStateChange(function (_evt, session) {
        state.session = session;
        renderNavAuth();
        onAuthChanged();
      });
    } catch (e) {
      console.error("[wenable] kunde inte initiera Supabase:", e);
    }
    renderNavAuth();
    if (isAssignmentsPage()) {
      buildAddModal();
      await refresh();
      window.addEventListener("hashchange", syncActiveRow);
    }
    // close modals on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeLogin(); if (addOverlay) closeAdd(); }
    });
    // keep injected copy in the right language when user toggles SV/EN
    window.addEventListener("wenable:langchange", function () {
      document.querySelectorAll(".assign-row.wadm-active").forEach(function () {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
