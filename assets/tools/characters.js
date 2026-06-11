// Character Inspector: classify each code point of the pasted text into a
// colored chip, with a detail card (code point, Unicode name, class).
// Names come from unicode-names.json, generated at build time and fetched
// lazily on first input.
(function () {
  var input = document.getElementById("char-input");
  var grid = document.getElementById("char-grid");
  if (!input || !grid) return;
  var summaryEl = document.getElementById("char-summary");
  var noticeEl = document.getElementById("char-notice");
  var detailEl = document.getElementById("char-detail");
  var baseUrl = document.body.getAttribute("data-base-url") || "/";
  var reprWrap = document.querySelector(".repr-wrap");
  var reprTable = document.getElementById("repr-table");
  var reprNotice = document.getElementById("repr-notice");
  var reprPlaceholder = document.getElementById("repr-placeholder");
  var md5Grid = document.getElementById("md5-grid");
  var md5Placeholder = document.getElementById("md5-placeholder");
  var REPR_MAX = 256;

  var MAX_CHIPS = 10000;
  var CLASS_LABELS = {
    upper: "uppercase letter", lower: "lowercase letter", digit: "digit",
    punct: "punctuation", symbol: "symbol", space: "whitespace",
    invisible: "invisible / control", nonascii: "non-ASCII",
  };
  var SUMMARY_ORDER = [
    "upper", "lower", "digit", "punct", "symbol", "space", "invisible", "nonascii",
  ];
  var SPACE_LABELS = { 0x20: "SP", 0x09: "TAB", 0x0A: "LF", 0x0D: "CR" };
  var INVIS_LABELS = {
    0x00: "NUL", 0x1B: "ESC", 0x7F: "DEL", 0x85: "NEL",
    0xA0: "NBSP", 0xAD: "SHY", 0x200B: "ZWSP", 0x200C: "ZWNJ", 0x200D: "ZWJ",
    0x2060: "WJ", 0xFEFF: "BOM", 0x202F: "NNBSP", 0x3000: "IDSP",
    0x202A: "LRE", 0x202B: "RLE", 0x202C: "PDF", 0x202D: "LRO", 0x202E: "RLO",
  };
  // Ordinary space/tab/newline are matched explicitly in classify() BEFORE
  // this regex, so Cc here only catches the sneaky controls (spec precedence).
  var RE_INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]/u;
  var RE_PUNCT = /\p{P}/u;

  function classify(ch, cp) {
    if (cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D) return "space";
    if (RE_INVISIBLE.test(ch)) return "invisible";
    if (cp < 0x80) {
      if (cp >= 0x41 && cp <= 0x5A) return "upper";
      if (cp >= 0x61 && cp <= 0x7A) return "lower";
      if (cp >= 0x30 && cp <= 0x39) return "digit";
      if (RE_PUNCT.test(ch)) return "punct";
      return "symbol"; // remaining printable ASCII: $ + < = > ^ ` | ~
    }
    return "nonascii";
  }

  function hex(cp) {
    var h = cp.toString(16).toUpperCase();
    return h.length < 4 ? ("000" + h).slice(-4) : h;
  }

  function labelFor(cls, ch, cp) {
    if (cls === "space") return SPACE_LABELS[cp] || hex(cp);
    if (cls === "invisible") return INVIS_LABELS[cp] || hex(cp);
    return ch;
  }

  function byteHex(n) {
    var h = n.toString(16).toUpperCase();
    return h.length < 2 ? "0" + h : h;
  }

  function unitHex(n) {
    var h = n.toString(16).toUpperCase();
    return ("000" + h).slice(-4);
  }

  // Standard UTF-8: 1-4 bytes, prefix byte + 10xxxxxx continuations.
  function utf8Bytes(cp) {
    if (cp <= 0x7F) return [cp];
    if (cp <= 0x7FF) return [0xC0 | (cp >> 6), 0x80 | (cp & 63)];
    if (cp <= 0xFFFF) {
      return [0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    }
    return [
      0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
      0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63),
    ];
  }

  // UTF-16 code units: ch is one whole code point (1 or 2 units).
  function utf16Units(ch) {
    var units = [ch.charCodeAt(0)];
    if (ch.length > 1) units.push(ch.charCodeAt(1));
    return units;
  }

  // Code point bits padded to whole bytes, space-grouped per byte.
  function binaryOf(cp) {
    var bits = cp <= 0xFF ? 8 : cp <= 0xFFFF ? 16 : 24;
    var b = cp.toString(2);
    while (b.length < bits) b = "0" + b;
    return b.replace(/(.{8})(?=.)/g, "$1 ");
  }

  // Whole text -> flat UTF-8 byte array (reuses the verified encoder).
  function textToUtf8(text) {
    var arr = Array.from(text);
    var bytes = [];
    for (var i = 0; i < arr.length; i++) {
      var bs = utf8Bytes(arr[i].codePointAt(0));
      for (var j = 0; j < bs.length; j++) bytes.push(bs[j]);
    }
    return bytes;
  }

  // Clean-room RFC 1321 MD5 over a byte array (WebCrypto has no MD5).
  // Verified against Node's OpenSSL MD5 in the extraction harness.
  var MD5_K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  var MD5_S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  function add32(a, b) { return (a + b) | 0; }
  function rotl32(x, c) { return (x << c) | (x >>> (32 - c)); }

  function md5Hex(bytes) {
    var padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    var bitLen = bytes.length * 8;
    var lo = bitLen >>> 0;
    var hi = Math.floor(bitLen / 0x100000000);
    padded.push(lo & 255, (lo >>> 8) & 255, (lo >>> 16) & 255, (lo >>> 24) & 255);
    padded.push(hi & 255, (hi >>> 8) & 255, (hi >>> 16) & 255, (hi >>> 24) & 255);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    for (var off = 0; off < padded.length; off += 64) {
      var M = [];
      for (var w = 0; w < 16; w++) {
        M[w] = padded[off + w * 4] | (padded[off + w * 4 + 1] << 8) |
               (padded[off + w * 4 + 2] << 16) | (padded[off + w * 4 + 3] << 24);
      }
      var a = a0, b = b0, c = c0, d = d0;
      for (var i = 0; i < 64; i++) {
        var f, g;
        if (i < 16) { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        f = add32(add32(add32(f, a), MD5_K[i]), M[g]);
        a = d; d = c; c = b;
        b = add32(b, rotl32(f, MD5_S[i]));
      }
      a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d);
    }

    var out = "";
    var words = [a0, b0, c0, d0];
    for (var wi = 0; wi < 4; wi++) {
      for (var bi = 0; bi < 4; bi++) {
        var v = (words[wi] >>> (bi * 8)) & 255;
        out += (v < 16 ? "0" : "") + v.toString(16);
      }
    }
    return out;
  }

  function factRow(dt, dd) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = dt;
    var d = document.createElement("dd");
    d.textContent = dd;
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }

  function hashLabel(bytes) {
    return md5Hex(bytes) + " · " + bytes.length.toLocaleString() + " bytes";
  }

  // Hashes always cover the FULL text — deliberately not subject to the
  // 10k chip cap or REPR_MAX (a truncated hash would match nothing).
  function renderHashes() {
    if (!md5Grid) return;
    md5Grid.textContent = "";
    if (!chars.length) {
      md5Grid.hidden = true;
      md5Placeholder.hidden = false;
      return;
    }
    md5Grid.hidden = false;
    md5Placeholder.hidden = true;
    var bytes = textToUtf8(input.value);
    md5Grid.appendChild(factRow("MD5", hashLabel(bytes)));
    md5Grid.appendChild(factRow("MD5 + LF", hashLabel(bytes.concat(10))));
    md5Grid.appendChild(factRow("MD5 + CRLF", hashLabel(bytes.concat(13, 10))));
  }

  // Row order must match the wiki entries in templates/tools/characters.html.
  var REPR_ROWS = [
    { label: "Character",
      value: function (c) { return labelFor(c.cls, c.ch, c.cp); } },
    { label: "Code point", value: function (c) { return "U+" + hex(c.cp); } },
    { label: "Decimal", value: function (c) { return String(c.cp); } },
    { label: "Hex", value: function (c) { return "0x" + hex(c.cp); } },
    { label: "Binary", value: function (c) { return binaryOf(c.cp); } },
    { label: "UTF-8",
      value: function (c) { return utf8Bytes(c.cp).map(byteHex).join(" "); } },
    { label: "UTF-16",
      value: function (c) { return utf16Units(c.ch).map(unitHex).join(" "); } },
    { label: "HTML entity",
      value: function (c) { return "&#x" + hex(c.cp) + ";"; } },
    { label: "URL-encoded",
      value: function (c) { return encodeURIComponent(c.ch); } },
  ];

  function renderRepr() {
    if (!reprTable) return;
    var thead = reprTable.tHead;
    var tbody = reprTable.tBodies[0];
    thead.textContent = "";
    tbody.textContent = "";
    if (!chars.length) {
      reprWrap.hidden = true;
      reprPlaceholder.hidden = false;
      reprNotice.hidden = true;
      return;
    }
    reprWrap.hidden = false;
    reprPlaceholder.hidden = true;

    var headRow = document.createElement("tr");
    for (var r = 0; r < REPR_ROWS.length; r++) {
      var th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = REPR_ROWS[r].label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);

    var count = Math.min(chars.length, REPR_MAX);
    for (var i = 0; i < count; i++) {
      var ch = chars[i];
      var cp = ch.codePointAt(0);
      var c = { ch: ch, cp: cp, cls: classify(ch, cp) };
      var tr = document.createElement("tr");
      for (var k = 0; k < REPR_ROWS.length; k++) {
        var cell;
        if (k === 0) {
          cell = document.createElement("th");
          cell.setAttribute("scope", "row");
          cell.className = "chip-" + c.cls;
        } else {
          cell = document.createElement("td");
        }
        cell.textContent = REPR_ROWS[k].value(c);
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }

    if (chars.length > REPR_MAX) {
      reprNotice.textContent =
        "Representations for the first " + REPR_MAX + " characters.";
      reprNotice.hidden = false;
    } else {
      reprNotice.hidden = true;
    }
  }

  // Lazily fetched code point -> name table; detail degrades gracefully
  // while loading or if the fetch fails.
  var names = null;
  var namesRequested = false;
  function ensureNames() {
    if (namesRequested || typeof fetch !== "function") return;
    namesRequested = true;
    fetch(baseUrl + "unicode-names.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { names = data; renderDetail(); })
      .catch(function () { /* card keeps showing code point + class */ });
  }

  var chars = [];        // code points (as strings) of the current text
  var activeIndex = -1;  // chip shown in the detail card
  var pinnedIndex = -1;  // clicked chip; hover only drives the card when unpinned

  function render() {
    chars = Array.from(input.value);
    activeIndex = -1;
    pinnedIndex = -1;
    grid.textContent = "";
    detailEl.hidden = true;
    if (!chars.length) {
      summaryEl.textContent = "";
      noticeEl.hidden = true;
      var p = document.createElement("p");
      p.className = "char-placeholder muted";
      p.textContent = "Paste text above to inspect it.";
      grid.appendChild(p);
      renderRepr();
      renderHashes();
      return;
    }
    ensureNames();

    var counts = {};
    var frag = document.createDocumentFragment();
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var cp = ch.codePointAt(0);
      var cls = classify(ch, cp);
      counts[cls] = (counts[cls] || 0) + 1;
      if (i < MAX_CHIPS) {
        var chip = document.createElement("span");
        chip.className = "chip chip-" + cls;
        chip.setAttribute("data-i", String(i));
        if (cls === "space" || cls === "invisible") {
          var small = document.createElement("span");
          small.className = "chip-label";
          small.textContent = labelFor(cls, ch, cp);
          chip.appendChild(small);
        } else {
          chip.textContent = ch;
        }
        frag.appendChild(chip);
        if (cp === 0x0A) {
          var br = document.createElement("span");
          br.className = "chip-break";
          frag.appendChild(br);
        }
      }
    }
    grid.appendChild(frag);

    var parts = [
      chars.length + (chars.length === 1 ? " character" : " characters"),
    ];
    SUMMARY_ORDER.forEach(function (cls) {
      if (counts[cls]) parts.push(counts[cls] + " " + CLASS_LABELS[cls]);
    });
    summaryEl.textContent = parts.join(" · ");

    if (chars.length > MAX_CHIPS) {
      noticeEl.textContent =
        "Showing the first " + MAX_CHIPS.toLocaleString() +
        " characters; the summary covers the whole text.";
      noticeEl.hidden = false;
    } else {
      noticeEl.hidden = true;
    }
    renderRepr();
    renderHashes();
  }

  function renderDetail() {
    if (activeIndex < 0 || activeIndex >= chars.length) return;
    var ch = chars[activeIndex];
    var cp = ch.codePointAt(0);
    var cls = classify(ch, cp);
    detailEl.textContent = "";
    detailEl.hidden = false;

    var big = document.createElement("span");
    big.className = "char-big chip-" + cls;
    big.textContent = labelFor(cls, ch, cp);

    var meta = document.createElement("span");
    meta.className = "char-meta";
    var code = document.createElement("code");
    code.textContent = "U+" + hex(cp);
    meta.appendChild(code);
    var name = names ? names[hex(cp)] : null;
    var nameText = name || (names ? "(unnamed code point)" : "(name loading…)");
    meta.appendChild(
      document.createTextNode(" · " + nameText + " · " + CLASS_LABELS[cls])
    );

    detailEl.appendChild(big);
    detailEl.appendChild(meta);
  }

  function setActive(i, pin) {
    var limit = Math.min(chars.length, MAX_CHIPS);
    if (i < 0 || i >= limit) return false;
    if (pin) pinnedIndex = i;
    activeIndex = i;
    var prev = grid.querySelector(".chip.active");
    if (prev) prev.classList.remove("active");
    var chip = grid.querySelector('.chip[data-i="' + i + '"]');
    if (chip) {
      chip.classList.add("active");
      if (pin) chip.scrollIntoView({ block: "nearest" });
    }
    renderDetail();
    return true;
  }

  grid.addEventListener("mouseover", function (e) {
    var chip = e.target.closest(".chip");
    if (chip && pinnedIndex < 0) setActive(Number(chip.getAttribute("data-i")), false);
  });
  grid.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    var i = Number(chip.getAttribute("data-i"));
    if (pinnedIndex === i) {
      pinnedIndex = -1; // second click unpins; hover previews resume
    } else {
      setActive(i, true);
    }
  });
  grid.addEventListener("keydown", function (e) {
    var moved = false;
    if (e.key === "ArrowRight") {
      moved = setActive(activeIndex < 0 ? 0 : activeIndex + 1, true);
    } else if (e.key === "ArrowLeft") {
      moved = setActive(activeIndex < 0 ? 0 : activeIndex - 1, true);
    } else if (e.key === "Home") {
      moved = setActive(0, true);
    } else if (e.key === "End") {
      moved = setActive(Math.min(chars.length, MAX_CHIPS) - 1, true);
    } else if (e.key === "Escape") {
      pinnedIndex = -1; // release pin; hover previews resume
      return;
    } else {
      return;
    }
    if (moved) e.preventDefault();
  });

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  render();
})();
