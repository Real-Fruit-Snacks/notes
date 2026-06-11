// Subnet Calculator: live IPv4 CIDR math with a synced prefix slider,
// a facts grid, and a binary network/host bit visualization.
(function () {
  var input = document.getElementById("subnet-input");
  var slider = document.getElementById("subnet-prefix");
  if (!input || !slider) return;
  var prefixLabel = document.getElementById("subnet-prefix-label");
  var errorEl = document.getElementById("subnet-error");
  var bitsEl = document.getElementById("subnet-bits");
  var factsEl = document.getElementById("subnet-facts");
  var outputEl = document.getElementById("subnet-output");

  // ---- math (uint32 via >>> 0) ----
  function ipToInt(o) { return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0; }
  function intToIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  function maskOf(n) { return n === 0 ? 0 : (0xFFFFFFFF << (32 - n)) >>> 0; }

  function maskToPrefix(mask) {
    // Prefix length of a contiguous mask, or -1 if not contiguous.
    var n = 0, seenZero = false;
    for (var i = 31; i >= 0; i--) {
      if ((mask >>> i) & 1) {
        if (seenZero) return -1;
        n++;
      } else {
        seenZero = true;
      }
    }
    return n;
  }

  function parseOctets(s) {
    var parts = s.split(".");
    if (parts.length !== 4) return { error: "not a valid IPv4 address" };
    var values = [];
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return { error: "not a valid IPv4 address" };
      var v = Number(parts[i]);
      if (v > 255) return { error: "octet " + parts[i] + " out of range (0–255)" };
      values.push(v);
    }
    return { values: values };
  }

  // Returns {ip, prefix|null} or {error}. prefix is null for a bare IP
  // (the slider's current value then applies).
  function parse(text) {
    var s = text.trim().replace(/\s+/g, " ");
    if (!s) return { error: "enter a network in CIDR notation" };
    var ipPart = s, maskPart = null;
    var slash = s.indexOf("/");
    if (slash !== -1) {
      ipPart = s.slice(0, slash).trim();
      maskPart = s.slice(slash + 1).trim();
    } else if (s.indexOf(" ") !== -1) {
      var sp = s.split(" ");
      ipPart = sp[0];
      maskPart = sp[1];
    }

    var octets = parseOctets(ipPart);
    if (octets.error) return octets;
    var ip = ipToInt(octets.values);

    if (maskPart === null || maskPart === "") return { ip: ip, prefix: null };

    if (maskPart.indexOf(".") !== -1) {
      var m = parseOctets(maskPart);
      if (m.error) return m;
      var p = maskToPrefix(ipToInt(m.values));
      if (p === -1) return { error: "netmask " + maskPart + " is not contiguous" };
      return { ip: ip, prefix: p };
    }
    if (!/^\d+$/.test(maskPart) || Number(maskPart) > 32) {
      return { error: "prefix must be between 0 and 32" };
    }
    return { ip: ip, prefix: Number(maskPart) };
  }

  function classOf(ip) {
    var top = ip >>> 28; // top 4 bits
    if ((top & 0x8) === 0) return "A";
    if ((top & 0xC) === 0x8) return "B";
    if ((top & 0xE) === 0xC) return "C";
    if (top === 0xE) return "D (multicast)";
    return "E (reserved)";
  }

  // Most-specific/special first: 255.255.255.255 must match before 240.0.0.0/4.
  var DESIGNATIONS = [
    ["255.255.255.255", 32, "Limited broadcast"],
    ["0.0.0.0", 8, "This network"],
    ["10.0.0.0", 8, "Private (RFC 1918)"],
    ["100.64.0.0", 10, "Carrier-grade NAT (RFC 6598)"],
    ["127.0.0.0", 8, "Loopback"],
    ["169.254.0.0", 16, "Link-local (RFC 3927)"],
    ["172.16.0.0", 12, "Private (RFC 1918)"],
    ["192.0.2.0", 24, "Documentation (TEST-NET-1)"],
    ["192.168.0.0", 16, "Private (RFC 1918)"],
    ["198.18.0.0", 15, "Benchmarking (RFC 2544)"],
    ["198.51.100.0", 24, "Documentation (TEST-NET-2)"],
    ["203.0.113.0", 24, "Documentation (TEST-NET-3)"],
    ["224.0.0.0", 4, "Multicast"],
    ["240.0.0.0", 4, "Reserved (RFC 1112)"],
  ].map(function (r) {
    return { net: ipToInt(r[0].split(".").map(Number)), mask: maskOf(r[1]), label: r[2] };
  });

  function designationOf(network) {
    for (var i = 0; i < DESIGNATIONS.length; i++) {
      var d = DESIGNATIONS[i];
      if (((network & d.mask) >>> 0) === d.net) return d.label;
    }
    return "Public";
  }

  // ---- rendering ----
  function fact(dt, dd) {
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

  function renderFacts(ip, n) {
    var mask = maskOf(n);
    var network = (ip & mask) >>> 0;
    var broadcast = (network | ~mask) >>> 0;
    var total = Math.pow(2, 32 - n);

    var usable, first, last, note = "";
    if (n <= 30) {
      usable = total - 2;
      first = network + 1;
      last = broadcast - 1;
    } else if (n === 31) {
      usable = 2;
      first = network;
      last = broadcast;
      note = " (point-to-point, RFC 3021)";
    } else {
      usable = 1;
      first = network;
      last = network;
      note = " (single host)";
    }

    factsEl.textContent = "";
    factsEl.appendChild(fact("CIDR", intToIp(network) + "/" + n));
    factsEl.appendChild(fact("Netmask", intToIp(mask)));
    factsEl.appendChild(fact("Wildcard", intToIp(~mask >>> 0)));
    factsEl.appendChild(fact("Network", intToIp(network) + (n === 31 ? " (no network on /31)" : "")));
    factsEl.appendChild(fact("Broadcast", intToIp(broadcast) + (n === 31 ? " (no broadcast on /31)" : "")));
    factsEl.appendChild(fact("First usable", intToIp(first)));
    factsEl.appendChild(fact("Last usable", intToIp(last)));
    factsEl.appendChild(fact("Usable hosts", usable.toLocaleString() + note));
    factsEl.appendChild(fact("Total addresses", total.toLocaleString()));
    factsEl.appendChild(fact("Class", classOf(ip)));
    factsEl.appendChild(fact("Designation", designationOf(network)));
  }

  function boundary() {
    var b = document.createElement("span");
    b.className = "bit-boundary";
    return b;
  }

  function renderBits(ip, n) {
    bitsEl.textContent = "";
    for (var g = 0; g < 4; g++) {
      if (g > 0) {
        var dot = document.createElement("span");
        dot.className = "bit-dot";
        dot.textContent = ".";
        bitsEl.appendChild(dot);
      }
      var group = document.createElement("span");
      group.className = "octet";
      for (var j = 0; j < 8; j++) {
        var i = g * 8 + j;
        if (i === n) group.appendChild(boundary());
        var bit = document.createElement("span");
        bit.className = "bit " + (i < n ? "bit-net" : "bit-host");
        bit.textContent = String((ip >>> (31 - i)) & 1);
        group.appendChild(bit);
      }
      if (g === 3 && n === 32) group.appendChild(boundary());
      bitsEl.appendChild(group);
    }
  }

  // ---- state & events ----
  var ip = ipToInt([192, 168, 1, 0]);
  var prefix = 24;

  function recompute(fromSlider) {
    if (fromSlider) {
      prefix = Number(slider.value);
      input.value = intToIp(ip) + "/" + prefix;
    } else {
      var res = parse(input.value);
      if (res.error) {
        errorEl.textContent = res.error;
        errorEl.hidden = false;
        input.classList.add("invalid");
        outputEl.classList.add("stale");
        return;
      }
      ip = res.ip;
      if (res.prefix !== null) prefix = res.prefix;
      slider.value = String(prefix);
    }
    errorEl.hidden = true;
    input.classList.remove("invalid");
    outputEl.classList.remove("stale");
    prefixLabel.textContent = "/" + prefix;
    renderBits(ip, prefix);
    renderFacts(ip, prefix);
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { recompute(false); }, 150);
  });
  slider.addEventListener("input", function () {
    clearTimeout(timer);
    recompute(true);
  });

  recompute(false);
})();
