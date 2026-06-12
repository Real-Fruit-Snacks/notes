// Encoding Playground: one input interpreted per the selected mode (plain
// text, Base64, URL-encoding, hex, binary), decoded to a single byte array,
// then re-rendered as every representation at once plus SHA-256/512 digests
// via WebCrypto (async, sequence-guarded; needs a secure context). Decoders
// are deliberately tolerant: Base64 accepts whitespace, the base64url
// alphabet, and missing padding; hex accepts 0x/colons/spaces; binary any
// spacing. Verified in the harness against RFC 4648 vectors, randomized
// round-trips, and node's createHash as an independent digest reference.
(function () {
  var input = document.getElementById("enc-input");
  var tableEl = document.getElementById("enc-table");
  if (!input || !tableEl) return;
  var errorEl = document.getElementById("enc-error");
  var descEl = document.getElementById("enc-desc");

  var MAX_BYTES = 262144;   // 256 KB of payload is plenty for a playground
  var DISPLAY_CAP = 2048;   // per-row display cap; copying still gets it all

  function textToBytes(text) {
    return new TextEncoder().encode(text);
  }

  // -> { text, lossy }: lossy means invalid UTF-8 replaced with U+FFFD.
  function bytesToText(bytes) {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), lossy: false };
    } catch (e) {
      return { text: new TextDecoder("utf-8").decode(bytes), lossy: true };
    }
  }

  function b64Encode(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64UrlOf(b64) {
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64Decode(text) {
    var s = text.replace(/\s+/g, "");
    s = s.replace(/-/g, "+").replace(/_/g, "/"); // accept base64url too
    s = s.replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]*$/.test(s)) {
      return { error: "Base64 allows only A-Z a-z 0-9 + / (or - _ in base64url)" };
    }
    if (s.length % 4 === 1) {
      return { error: "that length isn't possible for Base64 (4n+1 characters)" };
    }
    while (s.length % 4 !== 0) s += "=";
    var bin;
    try {
      bin = atob(s);
    } catch (e) {
      return { error: "not decodable as Base64" };
    }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes: bytes };
  }

  // RFC 3986: unreserved bytes stay literal, everything else is %XX.
  function urlEncode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if ((b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) ||
          (b >= 0x30 && b <= 0x39) || b === 0x2D || b === 0x5F ||
          b === 0x2E || b === 0x7E) {
        out += String.fromCharCode(b);
      } else {
        out += "%" + (b < 16 ? "0" : "") + b.toString(16).toUpperCase();
      }
    }
    return out;
  }

  // "+" stays a literal plus (RFC 3986, not form-encoding) - see the wiki.
  function urlDecode(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "%") {
        var hx = text.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hx)) {
          return { error: '"%" must be followed by two hex digits' };
        }
        out.push(parseInt(hx, 16));
        i += 2;
      } else {
        var enc = textToBytes(ch);
        for (var j = 0; j < enc.length; j++) out.push(enc[j]);
      }
    }
    return { bytes: new Uint8Array(out) };
  }

  function hexEncode(bytes) {
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      out.push((bytes[i] < 16 ? "0" : "") + bytes[i].toString(16).toUpperCase());
    }
    return out.join(" ");
  }

  function hexDecode(text) {
    var s = text.replace(/0x/gi, "").replace(/[\s:,]+/g, "");
    if (!/^[0-9a-fA-F]*$/.test(s)) return { error: "hex allows only 0-9 and a-f" };
    if (s.length % 2 !== 0) return { error: "hex needs an even number of digits (two per byte)" };
    var bytes = new Uint8Array(s.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return { bytes: bytes };
  }

  function binEncode(bytes) {
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i].toString(2);
      while (b.length < 8) b = "0" + b;
      out.push(b);
    }
    return out.join(" ");
  }

  function binDecode(text) {
    var s = text.replace(/\s+/g, "");
    if (!/^[01]*$/.test(s)) return { error: "binary allows only 0 and 1" };
    if (s.length % 8 !== 0) return { error: s.length + " bits isn't whole bytes (multiples of 8)" };
    var bytes = new Uint8Array(s.length / 8);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(s.substr(i * 8, 8), 2);
    }
    return { bytes: bytes };
  }

  function hexOfBuffer(buf) {
    var v = new Uint8Array(buf);
    var out = "";
    for (var i = 0; i < v.length; i++) {
      out += (v[i] < 16 ? "0" : "") + v[i].toString(16);
    }
    return out;
  }

  // Input + mode -> { bytes, inWords } | { error }.
  function toBytes(text, mode) {
    if (mode === "text") {
      var bytes = textToBytes(text);
      var chars = 0;
      for (var it = 0; it < text.length; chars++) {
        var cp = text.codePointAt(it);
        it += cp > 0xFFFF ? 2 : 1;
      }
      return { bytes: bytes, inWords: chars + (chars === 1 ? " character" : " characters") };
    }
    var compact = text.replace(/\s+/g, "").length;
    var res = mode === "base64" ? b64Decode(text)
      : mode === "url" ? urlDecode(text.trim())
      : mode === "hex" ? hexDecode(text)
      : binDecode(text);
    if (res.error) return res;
    var label = mode === "base64" ? "Base64 characters"
      : mode === "url" ? "URL-encoded characters"
      : mode === "hex" ? "hex digits" : "bits";
    return { bytes: res.bytes, inWords: compact + " " + label };
  }

  // ---- rendering ----
  function factRow(label, value, full) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = label;
    var d = document.createElement("dd");
    d.textContent = value;
    if (full !== undefined) d.setAttribute("data-copy", full);
    d.setAttribute("title", "Click to copy");
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }

  function capped(label, full) {
    if (full.length <= DISPLAY_CAP) return factRow(label, full);
    return factRow(label,
      full.slice(0, DISPLAY_CAP) + " … (+" + (full.length - DISPLAY_CAP).toLocaleString() +
      " more characters - click copies everything)", full);
  }

  var mode = "text";
  var seq = 0;

  function render() {
    var token = ++seq;
    errorEl.hidden = true;
    input.classList.remove("invalid");
    if (!input.value) {
      descEl.hidden = true;
      tableEl.textContent = "";
      return;
    }
    var res = toBytes(input.value, mode);
    if (res.error) {
      errorEl.textContent = "Can't decode: " + res.error + ".";
      errorEl.hidden = false;
      input.classList.add("invalid");
      return;
    }
    var bytes = res.bytes;
    if (bytes.length > MAX_BYTES) {
      errorEl.textContent = "Can't decode: input over 256 KB — this playground keeps it small.";
      errorEl.hidden = false;
      input.classList.add("invalid");
      return;
    }
    tableEl.textContent = "";

    var decoded = bytesToText(bytes);
    var byteWord = bytes.length === 1 ? " byte" : " bytes";
    descEl.textContent = res.inWords + " → " + bytes.length.toLocaleString() + byteWord +
      (mode === "text" ? " of UTF-8."
        : decoded.lossy ? " — not valid UTF-8 as text (shown with �)."
        : " → " + decoded.text.length.toLocaleString() + " characters of text.");
    descEl.hidden = false;

    var b64 = b64Encode(bytes);
    tableEl.appendChild(capped(
      "Text · UTF-8" + (decoded.lossy ? " (invalid bytes → �)" : ""), decoded.text));
    tableEl.appendChild(capped("Base64", b64));
    tableEl.appendChild(capped("Base64url", b64UrlOf(b64)));
    tableEl.appendChild(capped("URL-encoded", urlEncode(bytes)));
    tableEl.appendChild(capped("Hex", hexEncode(bytes)));
    tableEl.appendChild(capped("Binary", binEncode(bytes)));

    var hasCrypto = typeof crypto !== "undefined" && crypto.subtle;
    var sha256Row = factRow("SHA-256", hasCrypto ? "computing…" : "unavailable (needs a secure context)");
    var sha512Row = factRow("SHA-512", hasCrypto ? "computing…" : "unavailable (needs a secure context)");
    tableEl.appendChild(sha256Row);
    tableEl.appendChild(sha512Row);
    if (hasCrypto) {
      crypto.subtle.digest("SHA-256", bytes).then(function (buf) {
        if (token === seq) sha256Row.querySelector("dd").textContent = hexOfBuffer(buf);
      });
      crypto.subtle.digest("SHA-512", bytes).then(function (buf) {
        if (token === seq) sha512Row.querySelector("dd").textContent = hexOfBuffer(buf);
      });
    }
  }

  // Click any value to copy it (the full value, not the display-capped one).
  tableEl.addEventListener("click", function (e) {
    var dd = e.target.closest ? e.target.closest("dd") : null;
    if (!dd || !navigator.clipboard) return;
    var value = dd.getAttribute("data-copy");
    if (value === null) value = dd.textContent;
    navigator.clipboard.writeText(value).then(function () {
      dd.classList.add("enc-copied");
      setTimeout(function () { dd.classList.remove("enc-copied"); }, 600);
    }).catch(function () { /* clipboard unavailable */ });
  });

  var modeBtns = document.querySelectorAll(".mode-btn[data-mode]");
  function setMode(next) {
    mode = next;
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].setAttribute("aria-pressed",
        modeBtns[i].getAttribute("data-mode") === next ? "true" : "false");
    }
  }
  for (var mb = 0; mb < modeBtns.length; mb++) {
    modeBtns[mb].addEventListener("click", function () {
      setMode(this.getAttribute("data-mode"));
      render();
    });
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });

  // ---- one-click examples ----
  var EXAMPLES = {
    hello: { mode: "text", value: "Hello, World!" },
    b64: { mode: "base64", value: "SGVsbG8sIFdvcmxkIQ==" },
    jwt: { mode: "base64", value: "eyJhbGciOiJIUzI1NiJ9" }, // base64url, no padding
  };
  var exampleBtns = document.querySelectorAll(".example-btn[data-example]");
  for (var ei = 0; ei < exampleBtns.length; ei++) {
    exampleBtns[ei].addEventListener("click", function () {
      var ex = EXAMPLES[this.getAttribute("data-example")];
      if (ex == null) return;
      clearTimeout(timer);
      input.value = ex.value;
      setMode(ex.mode);
      render();
    });
  }

  input.value = EXAMPLES.hello.value;
  setMode("text");
  render();
})();
