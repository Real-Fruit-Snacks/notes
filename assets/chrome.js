// Small UI chrome: topbar scroll shadow, back-to-top, heading anchors.
(function () {
  var topbar = document.querySelector(".topbar");
  var toTop = document.getElementById("to-top");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (topbar) topbar.classList.toggle("scrolled", y > 4);
    if (toTop) toTop.hidden = y < 400;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Add a hover "#" anchor to body headings that have an id.
  var headings = document.querySelectorAll(
    ".note-body h2[id], .note-body h3[id], .note-body h4[id]"
  );
  headings.forEach(function (h) {
    var a = document.createElement("a");
    a.className = "heading-anchor";
    a.href = "#" + h.id;
    a.setAttribute("aria-label", "Link to this section");
    a.textContent = "#";
    h.appendChild(a);
  });

  // Theme toggle: persists to localStorage; the head boot script applied the
  // initial value. Dispatches "themechange" so canvases (graph) can recolour.
  var themeBtn = document.getElementById("theme-toggle");
  var themeMeta = document.getElementById("meta-theme-color");
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    if (themeMeta) themeMeta.setAttribute("content", t === "light" ? "#eff1f5" : "#1e1e2e");
    if (themeBtn) {
      themeBtn.textContent = t === "light" ? "☾" : "☀";
      themeBtn.setAttribute(
        "aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme"
      );
    }
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: t } }));
  }
  if (themeBtn) {
    applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      try { localStorage.setItem("theme", next); } catch (e) {}
      applyTheme(next);
    });
  }
})();
