// Mobile navigation drawer: hamburger toggles the sidebar + scrim.
(function () {
  var btn = document.getElementById("nav-toggle");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.getElementById("scrim");
  if (!btn || !sidebar) return;

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

  btn.addEventListener("click", function () {
    document.body.classList.contains("nav-open") ? close() : open();
  });
  if (scrim) scrim.addEventListener("click", close);
  sidebar.addEventListener("click", function (e) {
    if (e.target.tagName === "A") close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
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
