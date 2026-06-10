// Per-note "local graph": the current note plus its direct neighbours.
// d3 is loaded lazily, only the first time the box is expanded, so ordinary
// note pages stay light (d3 is ~280KB).
(function () {
  var BASE = document.body.getAttribute("data-base-url") || "/";
  var mount = document.getElementById("local-graph");
  if (!mount) return;
  var box = mount.closest("details");
  var slug = mount.getAttribute("data-slug");
  var started = false;

  function onOpen() {
    if (started || !box.open) return;
    started = true;
    loadD3(function () {
      fetch(BASE + "graph.json")
        .then(function (r) { return r.json(); })
        .then(build)
        .catch(function () { mount.textContent = "Could not load graph data."; });
    });
  }

  // Build before paint if the box was opened by the user.
  box.addEventListener("toggle", onOpen);
  if (box.open) onOpen();

  function loadD3(cb) {
    if (window.d3) return cb();
    var s = document.createElement("script");
    s.src = BASE + "assets/vendor/d3.min.js";
    s.onload = cb;
    s.onerror = function () { mount.textContent = "Could not load the graph library."; };
    document.head.appendChild(s);
  }

  function build(data) {
    // Ego network: current node + nodes sharing an edge with it.
    var neighbours = {};
    neighbours[slug] = true;
    data.links.forEach(function (l) {
      var s = id(l.source), t = id(l.target);
      if (s === slug) neighbours[t] = true;
      if (t === slug) neighbours[s] = true;
    });

    var nodes = data.nodes.filter(function (n) { return neighbours[n.id]; });
    if (nodes.length <= 1) {
      mount.innerHTML = '<p class="muted" style="margin:.5rem">No links yet.</p>';
      return;
    }
    var keep = {};
    nodes.forEach(function (n) { keep[n.id] = true; });
    var links = data.links.filter(function (l) {
      return keep[id(l.source)] && keep[id(l.target)];
    });

    // Fresh copies so d3 can mutate x/y without touching the cached json.
    nodes = nodes.map(function (n) { return { id: n.id, title: n.title, url: n.url }; });
    links = links.map(function (l) { return { source: id(l.source), target: id(l.target) }; });

    render(nodes, links);
  }

  function id(v) { return typeof v === "object" ? v.id : v; }

  function render(nodes, links) {
    var width = mount.clientWidth || 600;
    var height = mount.clientHeight || 280;
    mount.innerHTML = "";

    var svg = window.d3.select(mount).append("svg")
      .attr("width", "100%").attr("height", "100%")
      .attr("viewBox", [0, 0, width, height]);

    var link = svg.append("g").selectAll("line")
      .data(links).join("line").attr("stroke-width", 1);

    var node = svg.append("g").selectAll("g")
      .data(nodes).join("g").style("cursor", "pointer")
      .on("click", function (_e, d) { window.location.href = BASE + d.url; });

    node.append("circle")
      .attr("r", function (d) { return d.id === slug ? 8 : 5; })
      .attr("class", function (d) { return d.id === slug ? "node-current" : "node"; });

    node.append("text")
      .attr("x", 9).attr("y", 3)
      .text(function (d) { return d.title; });

    var sim = window.d3.forceSimulation(nodes)
      .force("link", window.d3.forceLink(links).id(function (d) { return d.id; }).distance(55))
      .force("charge", window.d3.forceManyBody().strength(-160))
      .force("center", window.d3.forceCenter(width / 2, height / 2))
      .on("tick", function () {
        link
          .attr("x1", function (d) { return d.source.x; })
          .attr("y1", function (d) { return d.source.y; })
          .attr("x2", function (d) { return d.target.x; })
          .attr("y2", function (d) { return d.target.y; });
        node.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
      });

    node.call(window.d3.drag()
      .on("start", function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", function (e, d) { d.fx = e.x; d.fy = e.y; })
      .on("end", function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  }
})();
