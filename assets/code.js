// Add a "Copy" button to every highlighted code block.
(function () {
  // Clipboard API needs a secure context (HTTPS/localhost); without it,
  // skip the buttons entirely rather than render ones that can't work.
  if (!navigator.clipboard || !navigator.clipboard.writeText) return;
  var blocks = document.querySelectorAll("pre.highlight");
  blocks.forEach(function (pre) {
    var btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var code = pre.querySelector("code");
      var text = (code || pre).innerText;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1200);
      });
    });
    pre.appendChild(btn);
  });
})();
