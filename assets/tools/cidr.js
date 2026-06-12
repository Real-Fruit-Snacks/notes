// CIDR Aggregator: parse a messy network list (CIDRs, bare IPs, dotted
// masks, comments), normalize host bits, then compute the minimal EXACT
// covering set - duplicates and contained blocks absorbed, aligned sibling
// pairs merged to a fixed point. Plus a splitter enumerating a block's
// children. All arithmetic is plain Numbers (exact to 2^53) rather than
// 32-bit ops, so /0-sized math never overflows. Verified by curated vectors
// plus a randomized interval-union equivalence property in the harness.
(function () {
  var input = document.getElementById("cidr-input");
  var resultsEl = document.getElementById("cidr-results");
  if (!input || !resultsEl) return;
  var errorEl = document.getElementById("cidr-error");
  var noticeEl = document.getElementById("cidr-notice");
  var descEl = document.getElementById("cidr-desc");
  var placeholderEl = document.getElementById("cidr-placeholder");
  var resultsHead = document.querySelector(".cidr-results-head");
  var copyBtn = document.getElementById("cidr-copy");
  var splitNet = document.getElementById("split-net");
  var splitPrefix = document.getElementById("split-prefix");
  var splitError = document.getElementById("split-error");
  var splitNotice = document.getElementById("split-notice");
  var splitResults = document.getElementById("split-results");

  var SPLIT_MAX = 64;

  // ---- uint32 helpers (Number arithmetic, no bitwise) ----
  function parseOctets(s) {
    var parts = s.split(".");
    if (parts.length !== 4) return null;
    var values = [];
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return null;
      var v = Number(parts[i]);
      if (v > 255) return null;
      values.push(v);
    }
    return values;
  }

  function ipToInt(o) {
    return o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
  }

  function intToIp(n) {
    return Math.floor(n / 16777216) % 256 + "." + Math.floor(n / 65536) % 256 +
      "." + Math.floor(n / 256) % 256 + "." + (n % 256);
  }

  function sizeOf(prefix) { return Math.pow(2, 32 - prefix); }

  function maskOf(prefix) { return 4294967296 - sizeOf(prefix); }

  // Contiguous-ones mask -> prefix length, else null.
  function maskToPrefix(maskInt) {
    for (var p = 0; p <= 32; p++) {
      if (maskOf(p) === maskInt) return p;
    }
    return null;
  }

  // ---- one entry -> {base, prefix, normalized} | {error} ----
  function parseEntry(text) {
    var s = text.trim();
    var ipPart = s, maskPart = null;
    var slash = s.indexOf("/");
    if (slash !== -1) {
      ipPart = s.slice(0, slash).trim();
      maskPart = s.slice(slash + 1).trim();
    } else if (s.indexOf(" ") !== -1) {
      var sp = s.split(/\s+/);
      if (sp.length !== 2) return { error: "not an address, CIDR, or ip+mask" };
      ipPart = sp[0];
      maskPart = sp[1];
    }
    var octets = parseOctets(ipPart);
    if (!octets) return { error: '"' + ipPart + '" is not a valid IPv4 address' };
    var prefix;
    if (maskPart === null) {
      prefix = 32; // bare address
    } else if (/^\d{1,2}$/.test(maskPart)) {
      prefix = Number(maskPart);
      if (prefix > 32) return { error: "/" + maskPart + " is longer than /32" };
    } else if (maskPart.indexOf(".") !== -1) {
      var maskOctets = parseOctets(maskPart);
      if (!maskOctets) return { error: '"' + maskPart + '" is not a valid netmask' };
      prefix = maskToPrefix(ipToInt(maskOctets));
      if (prefix === null) return { error: '"' + maskPart + '" is not a contiguous netmask' };
    } else {
      return { error: '"/' + maskPart + '" is not a prefix length or netmask' };
    }
    var base = ipToInt(octets);
    var size = sizeOf(prefix);
    var aligned = base - (base % size);
    return { base: aligned, prefix: prefix, normalized: aligned !== base };
  }

  // ---- whole textarea -> nets + diagnostics ----
  function parseList(text) {
    var nets = [], skipped = [], normalized = 0;
    var lines = text.split(/\r?\n/);
    for (var ln = 0; ln < lines.length; ln++) {
      var line = lines[ln];
      var hash = line.search(/#|\/\//);
      if (hash !== -1) line = line.slice(0, hash);
      var entries = line.split(/[,;]+/);
      for (var e = 0; e < entries.length; e++) {
        var entry = entries[e].trim();
        if (!entry) continue;
        var p = parseEntry(entry);
        if (p.error) skipped.push({ lineNo: ln + 1, text: entry, error: p.error });
        else {
          if (p.normalized) normalized++;
          nets.push({ base: p.base, prefix: p.prefix, inputs: 1 });
        }
      }
    }
    return { nets: nets, skipped: skipped, normalized: normalized };
  }

  // ---- minimal exact covering set ----
  // After host-bit normalization every block is aligned, so two blocks
  // either nest or are disjoint - a single sorted containment sweep plus
  // sibling merges to a fixed point yields the minimal set.
  function aggregate(nets) {
    var sorted = nets.slice().sort(function (a, b) {
      return a.base - b.base || a.prefix - b.prefix;
    });
    var kept = [];
    for (var i = 0; i < sorted.length; i++) {
      var n = sorted[i];
      var last = kept[kept.length - 1];
      if (last && n.base + sizeOf(n.prefix) <= last.base + sizeOf(last.prefix)) {
        last.inputs += n.inputs; // duplicate or contained: absorb
      } else {
        kept.push({ base: n.base, prefix: n.prefix, inputs: n.inputs });
      }
    }
    var changed = true;
    while (changed) {
      changed = false;
      for (var k = 0; k < kept.length - 1; k++) {
        var a = kept[k], b = kept[k + 1];
        var size = sizeOf(a.prefix);
        if (a.prefix === b.prefix && a.prefix > 0 &&
            a.base % (size * 2) === 0 && b.base === a.base + size) {
          kept.splice(k, 2, { base: a.base, prefix: a.prefix - 1, inputs: a.inputs + b.inputs });
          changed = true;
          k--; // the new supernet may merge again immediately
        }
      }
    }
    return kept;
  }

  // ---- splitter: children of (base, parentPrefix) at childPrefix ----
  function splitChildren(base, parentPrefix, childPrefix, max) {
    var children = [];
    var count = Math.pow(2, childPrefix - parentPrefix);
    var size = sizeOf(childPrefix);
    var shown = Math.min(count, max);
    for (var i = 0; i < shown; i++) {
      children.push({ base: base + i * size, prefix: childPrefix });
    }
    return { children: children, count: count };
  }

  function usableHosts(prefix) {
    if (prefix >= 31) return prefix === 31 ? 2 : 1; // RFC 3021 / host route
    return sizeOf(prefix) - 2;
  }

  // ---- rendering ----
  function cidrOf(n) { return intToIp(n.base) + "/" + n.prefix; }

  function row(net, extra) {
    var li = document.createElement("li");
    var name = document.createElement("span");
    name.className = "cidr-net";
    name.textContent = cidrOf(net);
    li.appendChild(name);
    for (var i = 0; i < extra.length; i++) {
      var meta = document.createElement("span");
      meta.className = "cidr-meta" + (extra[i].fill ? " cidr-fill" : "");
      meta.textContent = extra[i].text;
      li.appendChild(meta);
    }
    return li;
  }

  var lastList = "";
  function render() {
    resultsEl.textContent = "";
    errorEl.hidden = true;
    noticeEl.hidden = true;
    descEl.hidden = true;
    resultsHead.hidden = true;
    lastList = "";
    if (!input.value.replace(/\s/g, "")) {
      placeholderEl.hidden = false;
      return;
    }
    placeholderEl.hidden = true;

    var parsed = parseList(input.value);
    var notes = [];
    if (parsed.skipped.length) {
      var first = parsed.skipped[0];
      notes.push(parsed.skipped.length + " line" + (parsed.skipped.length > 1 ? "s" : "") +
        " skipped (line " + first.lineNo + ": " + first.error +
        (parsed.skipped.length > 1 ? ", …" : "") + ")");
    }
    if (parsed.normalized) {
      notes.push(parsed.normalized + (parsed.normalized > 1 ? " entries" : " entry") +
        " had host bits set — rounded down to the network address");
    }
    if (notes.length) {
      noticeEl.textContent = notes.join(" · ");
      noticeEl.hidden = false;
    }
    if (!parsed.nets.length) {
      errorEl.textContent = "No valid networks found — one CIDR, address, or ip + mask per line.";
      errorEl.hidden = false;
      return;
    }

    var out = aggregate(parsed.nets);
    var addresses = 0;
    for (var i = 0; i < out.length; i++) addresses += sizeOf(out[i].prefix);
    descEl.textContent = parsed.nets.length + " network" + (parsed.nets.length > 1 ? "s" : "") +
      " in → " + out.length + " network" + (out.length > 1 ? "s" : "") + " out · " +
      addresses.toLocaleString() + " address" + (addresses > 1 ? "es" : "") +
      ", exactly covered" +
      (out.length === parsed.nets.length ? " — already minimal, nothing merged." : ".");
    descEl.hidden = false;
    resultsHead.hidden = false;

    var list = [];
    for (var r = 0; r < out.length; r++) {
      var n = out[r];
      list.push(cidrOf(n));
      var extra = [
        { text: intToIp(maskOf(n.prefix)) },
        { text: sizeOf(n.prefix).toLocaleString() + " addresses" },
      ];
      if (n.inputs > 1) extra.push({ text: "← " + n.inputs + " inputs", fill: true });
      resultsEl.appendChild(row(n, extra));
    }
    lastList = list.join("\n");
  }

  function renderSplit() {
    splitResults.textContent = "";
    splitError.hidden = true;
    splitNotice.hidden = true;
    var parent = parseEntry(splitNet.value.trim());
    if (parent.error) {
      splitError.textContent = "Can't parse: " + parent.error + ".";
      splitError.hidden = false;
      return;
    }
    var child = Number(splitPrefix.value);
    if (!/^\d{1,2}$/.test(splitPrefix.value.trim()) || child > 32) {
      splitError.textContent = "Can't parse: the child prefix must be 0–32.";
      splitError.hidden = false;
      return;
    }
    if (child < parent.prefix) {
      splitError.textContent = "A /" + parent.prefix + " can't be split into bigger /" +
        child + " blocks — the child prefix must be at least /" + parent.prefix + ".";
      splitError.hidden = false;
      return;
    }
    var res = splitChildren(parent.base, parent.prefix, child, SPLIT_MAX);
    for (var i = 0; i < res.children.length; i++) {
      var c = res.children[i];
      var size = sizeOf(c.prefix);
      splitResults.appendChild(row(c, [
        { text: intToIp(c.base) + " – " + intToIp(c.base + size - 1) },
        { text: usableHosts(c.prefix).toLocaleString() + " usable", fill: true },
      ]));
    }
    var notes = [];
    if (parent.normalized) {
      notes.push("host bits rounded down: splitting " + cidrOf(parent));
    }
    if (res.count > SPLIT_MAX) {
      notes.push("showing the first " + SPLIT_MAX + " of " +
        res.count.toLocaleString() + " children");
    } else {
      notes.push(res.count.toLocaleString() + " child" + (res.count > 1 ? "ren" : "") +
        " of " + sizeOf(child).toLocaleString() + " address" + (sizeOf(child) > 1 ? "es" : "") + " each");
    }
    splitNotice.textContent = notes.join(" · ");
    splitNotice.hidden = false;
  }

  // ---- events ----
  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 200);
  });
  var splitTimer = null;
  function splitChanged() {
    clearTimeout(splitTimer);
    splitTimer = setTimeout(renderSplit, 150);
  }
  splitNet.addEventListener("input", splitChanged);
  splitPrefix.addEventListener("input", splitChanged);

  copyBtn.addEventListener("click", function () {
    if (!lastList || !navigator.clipboard) return;
    navigator.clipboard.writeText(lastList + "\n").then(function () {
      copyBtn.textContent = "Copied ✓";
      setTimeout(function () { copyBtn.textContent = "Copy list"; }, 1500);
    });
  });

  // ---- one-click examples ----
  var EXAMPLES = {
    merge: [
      "# four /24s, a duplicate, and a contained /25",
      "192.168.0.0/24",
      "192.168.1.0/24",
      "192.168.2.0/24",
      "192.168.3.0/24",
      "192.168.2.128/25",
      "192.168.1.0/24",
    ].join("\n"),
    trap: [
      "# adjacent but NOT aligned - these two can't merge",
      "192.168.1.0/24",
      "192.168.2.0/24",
      "",
      "# a bare IP becomes /32; host bits get rounded down",
      "10.0.0.5",
      "172.16.5.9/12",
    ].join("\n"),
    branches: [
      "# branch offices, summarized for the core router",
      "10.0.0.0/16",
      "10.1.0.0/16",
      "10.2.0.0/15",
      "10.4.0.0/14",
    ].join("\n"),
  };
  var exampleBtns = document.querySelectorAll(".example-btn[data-example]");
  for (var ei = 0; ei < exampleBtns.length; ei++) {
    exampleBtns[ei].addEventListener("click", function () {
      var ex = EXAMPLES[this.getAttribute("data-example")];
      if (ex == null) return;
      clearTimeout(timer);
      input.value = ex;
      render();
    });
  }

  render();
  renderSplit();
})();
