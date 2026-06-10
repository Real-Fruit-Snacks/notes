// Force-directed note graph rendered with d3-force + SVG.
(function () {
  var BASE = document.body.getAttribute("data-base-url") || "/";
  var mount = document.getElementById("graph");
  if (!mount || typeof d3 === "undefined") return;

  fetch(BASE + "graph.json")
    .then(function (r) { return r.json(); })
    .then(function (data) { draw(data); })
    .catch(function () { mount.textContent = "Could not load graph data."; });

  function draw(data) {
    var width = mount.clientWidth || 800;
    var height = mount.clientHeight || 600;

    var svg = d3.select(mount).append("svg")
      .attr("width", "100%").attr("height", "100%")
      .attr("viewBox", [0, 0, width, height]);

    var link = svg.append("g").selectAll("line")
      .data(data.links).join("line").attr("stroke-width", 1);

    var node = svg.append("g").selectAll("g")
      .data(data.nodes).join("g").style("cursor", "pointer")
      .on("click", function (_e, d) { window.location.href = BASE + d.url; });

    node.append("circle")
      .attr("r", function (d) { return 4 + Math.sqrt(d.val) * 2; })
      .attr("fill", "var(--accent)");

    node.append("text")
      .attr("x", 8).attr("y", 3)
      .text(function (d) { return d.title; });

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
  }
})();
