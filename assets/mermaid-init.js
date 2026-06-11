// Render mermaid fences; re-render with the matching theme on toggle.
(function () {
  if (typeof mermaid === "undefined") return;
  var blocks = Array.prototype.slice.call(document.querySelectorAll("pre.mermaid"));
  if (!blocks.length) return;
  blocks.forEach(function (el) { el.setAttribute("data-src", el.textContent); });

  function render() {
    blocks.forEach(function (el) {
      el.removeAttribute("data-processed");
      el.textContent = el.getAttribute("data-src");
    });
    var light = document.documentElement.getAttribute("data-theme") === "light";
    mermaid.initialize({ startOnLoad: false, theme: light ? "default" : "dark" });
    mermaid.run({ nodes: blocks });
  }
  render();
  document.addEventListener("themechange", render);
})();
