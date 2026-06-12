// Render mermaid fences. Both site themes are dark, so mermaid always uses
// its dark theme and diagrams never need re-rendering on theme toggle.
(function () {
  if (typeof mermaid === "undefined") return;
  var blocks = Array.prototype.slice.call(document.querySelectorAll("pre.mermaid"));
  if (!blocks.length) return;
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
  mermaid.run({ nodes: blocks });
})();
