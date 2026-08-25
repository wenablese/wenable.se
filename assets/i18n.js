/* Wenable — tiny i18n engine
   - Default language: Swedish ("sv")
   - Persists choice in localStorage
   - Any element with a data-sv="..." attribute is translatable.
     Its ORIGINAL markup (English) is captured into data-en on first run,
     so the page source stays authored in English while SV lives in data-sv.
   - Elements may use {data-sv-attr-...} too — handled generically below.
   - Fires a "wenable:langchange" event so JS-driven copy (e.g. the homepage
     rotating headline) can re-render in the active language.            */
(function () {
  var KEY = "wenable-lang";
  var lang = localStorage.getItem(KEY) || "en";

  function translateEl(el, l) {
    if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
    el.innerHTML = l === "sv" ? el.dataset.sv : el.dataset.en;
  }

  // generic attribute translation: data-sv-attr-placeholder, data-sv-attr-aria-label, ...
  function translateAttrs(el, l) {
    for (var i = 0; i < el.attributes.length; i++) {
      var name = el.attributes[i].name;
      var m = name.match(/^data-sv-attr-(.+)$/);
      if (!m) continue;
      var attr = m[1];
      var enKey = "data-en-attr-" + attr;
      if (!el.hasAttribute(enKey)) el.setAttribute(enKey, el.getAttribute(attr) || "");
      el.setAttribute(attr, l === "sv" ? el.getAttribute(name) : el.getAttribute(enKey));
    }
  }

  function apply(l) {
    document.documentElement.lang = l;
    document.querySelectorAll("[data-sv]").forEach(function (el) { translateEl(el, l); });
    document.querySelectorAll("[data-sv-attr-placeholder],[data-sv-attr-aria-label],[data-sv-attr-alt],[data-sv-attr-title],[data-sv-attr-content]")
      .forEach(function (el) { translateAttrs(el, l); });
    document.querySelectorAll("[data-lang-btn]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.langBtn === l);
      b.setAttribute("aria-pressed", b.dataset.langBtn === l ? "true" : "false");
    });
    localStorage.setItem(KEY, l);
    window.dispatchEvent(new CustomEvent("wenable:langchange", { detail: { lang: l } }));
  }

  window.WenableLang = {
    get: function () { return lang; },
    set: function (l) {
      if (l !== "sv" && l !== "en") return;
      lang = l;
      apply(l);
    },
    toggle: function () { this.set(lang === "sv" ? "en" : "sv"); }
  };

  function bind() {
    document.querySelectorAll("[data-lang-btn]").forEach(function (b) {
      b.addEventListener("click", function () { window.WenableLang.set(b.dataset.langBtn); });
    });
    apply(lang);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
