// Client-side full-text search over search.json using MiniSearch.
(function () {
  var BASE = document.body.getAttribute("data-base-url") || "/";
  var input = document.getElementById("search-input");
  var results = document.getElementById("search-results");
  if (!input || !results || typeof MiniSearch === "undefined") return;

  var mini = null;
  var docs = [];
  var activeIdx = -1;

  fetch(BASE + "search.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      docs = data;
      mini = new MiniSearch({
        fields: ["title", "text", "tags"],
        storeFields: ["title", "url", "tags"],
        searchOptions: { boost: { title: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
      });
      mini.addAll(docs);
    })
    .catch(function () {});

  function hide() { results.hidden = true; results.innerHTML = ""; activeIdx = -1; }

  function render(hits) {
    if (!hits.length) { hide(); return; }
    results.innerHTML = "";
    hits.slice(0, 12).forEach(function (h) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = h.url;
      a.innerHTML = "<span>" + escapeHtml(h.title) + "</span>" +
        (h.tags && h.tags.length ? "<small>#" + h.tags.map(escapeHtml).join(" #") + "</small>" : "");
      li.appendChild(a);
      results.appendChild(li);
    });
    results.hidden = false;
    activeIdx = -1;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  input.addEventListener("input", function () {
    var q = input.value.trim();
    if (!mini || q.length < 2) { hide(); return; }
    render(mini.search(q));
  });

  input.addEventListener("keydown", function (e) {
    var items = results.querySelectorAll("li");
    if (e.key === "ArrowDown") { e.preventDefault(); move(1, items); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1, items); }
    else if (e.key === "Enter") {
      // Fall back to the top hit when nothing is highlighted yet.
      var pick = items[activeIdx] || items[0];
      var link = pick && pick.querySelector("a");
      if (link) { e.preventDefault(); window.location.href = link.href; }
    } else if (e.key === "Escape") { hide(); input.blur(); }
  });

  function move(delta, items) {
    if (!items.length) return;
    if (activeIdx >= 0) items[activeIdx].classList.remove("active");
    activeIdx = (activeIdx + delta + items.length) % items.length;
    items[activeIdx].classList.add("active");
  }

  document.addEventListener("click", function (e) {
    if (!results.contains(e.target) && e.target !== input) hide();
  });

  // Press "/" anywhere to jump to the search box.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    var tag = el && el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (el && el.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });
})();
