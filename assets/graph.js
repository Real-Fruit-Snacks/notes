// Force-directed note graph (d3 + SVG) with zoom/pan, hover-highlighting,
// folder colours behind a clickable legend, an orphan toggle, and a title
// filter. All state is DOM classes; the simulation itself never restarts.
(function () {
  var BASE = document.body.getAttribute("data-base-url") || "/";
  var mount = document.getElementById("graph");
  if (!mount || typeof d3 === "undefined") return;

  fetch(BASE + "graph.json")
    .then(function (r) { return r.json(); })
    .then(draw)
    .catch(function () { mount.textContent = "Could not load graph data."; });

  // Catppuccin Mocha accents, assigned to folders in name order.
  var PALETTE = ["#89b4fa", "#a6e3a1", "#fab387", "#f38ba8", "#cba6f7",
                 "#94e2d5", "#f9e2af", "#f5c2e7", "#89dceb", "#b4befe"];

  function folderOf(id) {
    return id.indexOf("/") > -1 ? id.slice(0, id.indexOf("/")) : "";
  }

  // d3 mutates link endpoints from id strings into node objects.
  function endId(v) { return typeof v === "object" ? v.id : v; }

  function draw(data) {
    var width = mount.clientWidth || 800;
    var height = mount.clientHeight || 600;

    var folders = Array.from(
      new Set(data.nodes.map(function (n) { return folderOf(n.id); }))
    ).sort();
    var colour = {};
    folders.forEach(function (f, i) { colour[f] = PALETTE[i % PALETTE.length]; });

    var degree = {};
    var neighbours = {};
    data.nodes.forEach(function (n) {
      neighbours[n.id] = {};
      neighbours[n.id][n.id] = true;
    });
    data.links.forEach(function (l) {
      degree[l.source] = (degree[l.source] || 0) + 1;
      degree[l.target] = (degree[l.target] || 0) + 1;
      neighbours[l.source][l.target] = true;
      neighbours[l.target][l.source] = true;
    });

    var svg = d3.select(mount).append("svg")
      .attr("width", "100%").attr("height", "100%")
      .attr("viewBox", [0, 0, width, height]);
    var root = svg.append("g");

    var link = root.append("g").selectAll("line")
      .data(data.links).join("line").attr("stroke-width", 1);

    var node = root.append("g").selectAll("g")
      .data(data.nodes).join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .on("click", function (_e, d) { window.location.href = BASE + d.url; })
      .on("mouseenter", onEnter)
      .on("mouseleave", onLeave);

    node.append("circle")
      .attr("r", function (d) { return 4 + Math.sqrt(d.val) * 2; })
      .attr("fill", function (d) { return colour[folderOf(d.id)]; });

    node.append("text")
      .attr("x", 8).attr("y", 3)
      .text(function (d) { return d.title; });

    // -- zoom & pan; labels fade away when zoomed far out ------------------
    svg.call(
      d3.zoom().scaleExtent([0.2, 8]).on("zoom", function (e) {
        root.attr("transform", e.transform);
        svg.classed("zoomed-out", e.transform.k < 0.7);
      })
    );

    var sim = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(function (d) { return d.id; }).distance(70))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", ticked);

    node.call(d3.drag()
      .on("start", function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", function (e, d) { d.fx = e.x; d.fy = e.y; })
      .on("end", function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    function ticked() {
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });
      node.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
    }

    // -- filtering: hidden folders, orphans, title query --------------------
    var hiddenFolders = {};
    var showOrphans = true;
    var query = "";

    function nodeVisible(d) {
      if (hiddenFolders[folderOf(d.id)]) return false;
      if (!showOrphans && !degree[d.id]) return false;
      return true;
    }

    function apply() {
      var vis = {};
      data.nodes.forEach(function (n) { vis[n.id] = nodeVisible(n); });
      node.classed("hidden", function (d) { return !vis[d.id]; });
      link.classed("hidden", function (l) {
        return !vis[endId(l.source)] || !vis[endId(l.target)];
      });
      node.classed("dim", function (d) {
        return !!query && d.title.toLowerCase().indexOf(query) === -1;
      });
      link.classed("dim", false);
    }

    // -- hover: spotlight the node and its direct neighbours ---------------
    function onEnter(_e, d) {
      var nb = neighbours[d.id];
      svg.classed("hovering", true);
      node.classed("dim", function (o) { return !nb[o.id]; });
      link.classed("dim", function (l) {
        return endId(l.source) !== d.id && endId(l.target) !== d.id;
      });
    }
    function onLeave() {
      svg.classed("hovering", false);
      apply();
    }

    // -- toolbar controls ---------------------------------------------------
    var legend = document.getElementById("graph-legend");
    if (legend) {
      folders.forEach(function (f) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "legend-item";
        var swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = colour[f];
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(f || "root"));
        btn.addEventListener("click", function () {
          hiddenFolders[f] = !hiddenFolders[f];
          btn.classList.toggle("off", !!hiddenFolders[f]);
          apply();
        });
        legend.appendChild(btn);
      });
    }

    var orphans = document.getElementById("graph-orphans");
    if (orphans) {
      orphans.addEventListener("change", function () {
        showOrphans = orphans.checked;
        apply();
      });
    }

    var search = document.getElementById("graph-search");
    if (search) {
      search.addEventListener("input", function () {
        query = search.value.trim().toLowerCase();
        apply();
      });
    }
  }
})();
