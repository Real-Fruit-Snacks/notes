// Render $...$ / $$...$$ spans produced at build time with KaTeX.
(function () {
  if (typeof katex === "undefined") return;
  document.querySelectorAll(".math").forEach(function (el) {
    var tex = el.textContent;
    try {
      katex.render(tex, el, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
      });
    } catch (e) { /* leave the raw TeX visible */ }
  });
})();
