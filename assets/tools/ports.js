// Port Reference: fetches the build-time ports.json (vendored IANA registry
// + curated overlay) and renders a filterable table. Search accepts a port
// number (exact or prefix) or a keyword matched against service, category,
// description, and notes; transport pills and a category select compose with
// it. Pure rendering — all data work happens at build time in ports.py.
(function () {
  var search = document.getElementById("ports-search");
  var table = document.getElementById("ports-table");
  if (!search || !table) return;
  var tbody = table.tBodies[0];
  var countEl = document.getElementById("ports-count");
  var catSel = document.getElementById("ports-cat");
  var baseUrl = document.body.getAttribute("data-base-url") || "/";

  var CATS = {};
  var PORTS = [];
  var proto = "all";

  function badge(text, cls) {
    var span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    return span;
  }

  function rowFor(e) {
    var tr = document.createElement("tr");
    var tdPort = document.createElement("td");
    tdPort.className = "port-num";
    tdPort.textContent = e.p;
    tr.appendChild(tdPort);
    var tdProto = document.createElement("td");
    tdProto.className = "port-proto";
    tdProto.textContent = e.proto;
    tr.appendChild(tdProto);
    var tdName = document.createElement("td");
    tdName.className = "port-name";
    tdName.textContent = e.n;
    tr.appendChild(tdName);
    var tdCat = document.createElement("td");
    tdCat.appendChild(badge(CATS[e.c] || e.c,
      "port-cat" + (e.c === "evil" ? " port-cat-evil" : "")));
    tr.appendChild(tdCat);
    var tdDesc = document.createElement("td");
    tdDesc.className = "port-desc";
    tdDesc.appendChild(document.createTextNode(e.d));
    if (e.note) {
      var note = document.createElement("span");
      note.className = "port-note";
      note.textContent = e.note;
      tdDesc.appendChild(note);
    }
    tr.appendChild(tdDesc);
    return tr;
  }

  function matches(e, q, qIsNum) {
    if (proto !== "all" && e.proto.indexOf(proto) === -1) return false;
    if (catSel.value !== "all" && e.c !== catSel.value) return false;
    if (!q) return true;
    if (qIsNum) {
      var s = String(e.p);
      return s === q || s.indexOf(q) === 0;
    }
    var hay = (e.n + " " + e.d + " " + (e.note || "") + " " +
      (CATS[e.c] || "")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function render() {
    tbody.textContent = "";
    if (!PORTS.length) return;
    var q = search.value.trim().toLowerCase();
    var qIsNum = /^\d+$/.test(q);
    var shown = 0;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < PORTS.length; i++) {
      if (matches(PORTS[i], q, qIsNum)) {
        frag.appendChild(rowFor(PORTS[i]));
        shown++;
      }
    }
    tbody.appendChild(frag);
    countEl.textContent = shown === PORTS.length
      ? PORTS.length.toLocaleString() + " ports"
      : "Showing " + shown.toLocaleString() + " of " +
        PORTS.length.toLocaleString() + " ports";
    countEl.hidden = false;
  }

  function loadFailed() {
    countEl.textContent = "Couldn't load the port table — reload to retry.";
    countEl.hidden = false;
  }

  if (typeof fetch !== "function") { loadFailed(); return; }
  countEl.textContent = "Loading the port table…";
  countEl.hidden = false;
  fetch(baseUrl + "ports.json")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) { loadFailed(); return; }
      CATS = data.categories;
      PORTS = data.ports;
      // Category options, alphabetical by label.
      var ids = Object.keys(CATS).sort(function (a, b) {
        return CATS[a] < CATS[b] ? -1 : 1;
      });
      for (var i = 0; i < ids.length; i++) {
        var opt = document.createElement("option");
        opt.value = ids[i];
        opt.textContent = CATS[ids[i]];
        catSel.appendChild(opt);
      }
      render();
    })
    .catch(loadFailed);

  var timer = null;
  search.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  });
  catSel.addEventListener("change", render);

  var protoBtns = document.querySelectorAll(".mode-btn[data-proto]");
  for (var pb = 0; pb < protoBtns.length; pb++) {
    protoBtns[pb].addEventListener("click", function () {
      proto = this.getAttribute("data-proto");
      for (var i = 0; i < protoBtns.length; i++) {
        protoBtns[i].setAttribute("aria-pressed",
          protoBtns[i].getAttribute("data-proto") === proto ? "true" : "false");
      }
      render();
    });
  }

  // ---- one-click examples ----
  var EXAMPLES = { https: "443", rdp: "3389", redis: "redis" };
  var exampleBtns = document.querySelectorAll(".example-btn[data-example]");
  for (var ei = 0; ei < exampleBtns.length; ei++) {
    exampleBtns[ei].addEventListener("click", function () {
      var ex = EXAMPLES[this.getAttribute("data-example")];
      if (ex == null) return;
      clearTimeout(timer);
      search.value = ex;
      catSel.value = "all";
      proto = "all";
      for (var i = 0; i < protoBtns.length; i++) {
        protoBtns[i].setAttribute("aria-pressed",
          protoBtns[i].getAttribute("data-proto") === "all" ? "true" : "false");
      }
      render();
    });
  }
})();
