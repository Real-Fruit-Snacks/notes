// Hover previews for internal links: show a small card with the note's excerpt.
(function () {
  var BASE = document.body.getAttribute("data-base-url") || "/";
  var card = document.getElementById("link-preview");
  if (!card) return;

  var data = null;
  var timer = null;

  fetch(BASE + "excerpts.json")
    .then(function (r) { return r.json(); })
    .then(function (d) { data = d; })
    .catch(function () {});

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function show(link) {
    if (!data) return;
    var info = data[link.getAttribute("data-slug")];
    if (!info) return;
    card.innerHTML =
      "<strong>" + esc(info.title) + "</strong>" +
      (info.excerpt ? "<p>" + esc(info.excerpt) + "</p>" : "");
    card.hidden = false;
    var r = link.getBoundingClientRect();
    card.style.top = window.scrollY + r.bottom + 8 + "px";
    var left = window.scrollX + r.left;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - card.offsetWidth - 12;
    card.style.left = Math.max(8, Math.min(left, maxLeft)) + "px";
  }

  function hide() { card.hidden = true; }

  function closest(el) {
    return el && el.closest ? el.closest("a.internal-link[data-slug]") : null;
  }

  document.addEventListener("mouseover", function (e) {
    var link = closest(e.target);
    if (!link) return;
    clearTimeout(timer);
    timer = setTimeout(function () { show(link); }, 220);
  });
  document.addEventListener("mouseout", function (e) {
    if (!closest(e.target)) return;
    clearTimeout(timer);
    hide();
  });
})();
