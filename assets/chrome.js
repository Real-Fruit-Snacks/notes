// Small UI chrome: topbar scroll shadow, back-to-top, heading anchors.
(function () {
  var topbar = document.querySelector(".topbar");
  var toTop = document.getElementById("to-top");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (topbar) topbar.classList.toggle("scrolled", y > 4);
    if (toTop) toTop.hidden = y < 400;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Add a hover "#" anchor to body headings that have an id.
  var headings = document.querySelectorAll(
    ".note-body h2[id], .note-body h3[id], .note-body h4[id]"
  );
  headings.forEach(function (h) {
    var a = document.createElement("a");
    a.className = "heading-anchor";
    a.href = "#" + h.id;
    a.setAttribute("aria-label", "Link to this section");
    a.textContent = "#";
    h.appendChild(a);
  });
})();
