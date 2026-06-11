// Mobile navigation drawer: hamburger toggles the sidebar + scrim.
// Desktop: hamburger collapses/expands the sidebar, persisted in localStorage.
(function () {
  var btn = document.getElementById("nav-toggle");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  if (!btn || !sidebar) return;

  var desktop = window.matchMedia("(min-width: 821px)");

  // --- Desktop helpers ---
  function desktopCollapse() {
    document.documentElement.setAttribute("data-sidebar", "collapsed");
    btn.setAttribute("aria-expanded", "false");
    try { localStorage.setItem("sidebar", "collapsed"); } catch (e) {}
  }
  function desktopExpand() {
    document.documentElement.removeAttribute("data-sidebar");
    btn.setAttribute("aria-expanded", "true");
    try { localStorage.removeItem("sidebar"); } catch (e) {}
  }

  // --- Mobile helpers ---
  function open() {
    document.body.classList.add("nav-open");
    if (scrim) scrim.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    document.body.classList.remove("nav-open");
    if (scrim) scrim.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  // Sync aria-expanded with current boot state on desktop.
  if (desktop.matches) {
    btn.setAttribute("aria-expanded",
      document.documentElement.getAttribute("data-sidebar") === "collapsed" ? "false" : "true");
  }

  // Re-sync when crossing the desktop/mobile breakpoint.
  desktop.addEventListener("change", function (e) {
    if (e.matches) {
      // Entering desktop: clear any mobile drawer state, reflect collapse state.
      close();
      btn.setAttribute("aria-expanded",
        document.documentElement.getAttribute("data-sidebar") === "collapsed" ? "false" : "true");
    } else {
      // Entering mobile: drawer starts closed.
      btn.setAttribute("aria-expanded", "false");
    }
  });

  btn.addEventListener("click", function () {
    if (desktop.matches) {
      document.documentElement.getAttribute("data-sidebar") === "collapsed"
        ? desktopExpand()
        : desktopCollapse();
    } else {
      document.body.classList.contains("nav-open") ? close() : open();
    }
  });
  if (scrim) scrim.addEventListener("click", close);
  sidebar.addEventListener("click", function (e) {
    if (e.target.tagName === "A") close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !desktop.matches) close();
  });
})();

// Folders start collapsed; reveal the current note by expanding only the
// folders on its path.
(function () {
  var active = document.querySelector(".sidebar .nav-note.active");
  var d = active && active.closest("details");
  while (d) {
    d.open = true;
    d = d.parentElement && d.parentElement.closest("details");
  }
})();

// Expand-all / collapse-all controls for the sidebar folder tree.
(function () {
  var sidebar = document.getElementById("sidebar");
  var tools = document.getElementById("sidebar-tools");
  if (!sidebar || !tools) return;

  function folders() { return sidebar.querySelectorAll("details"); }

  // No folders -> nothing to expand/collapse, so hide the controls.
  if (!folders().length) { tools.hidden = true; return; }

  function setAll(open) {
    folders().forEach(function (d) { d.open = open; });
  }
  var ea = document.getElementById("expand-all");
  var ca = document.getElementById("collapse-all");
  if (ea) ea.addEventListener("click", function () { setAll(true); });
  if (ca) ca.addEventListener("click", function () { setAll(false); });
})();
