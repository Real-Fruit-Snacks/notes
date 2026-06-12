// Timestamp Converter: one auto-detecting input (epoch seconds/ms/µs/ns by
// magnitude, ISO 8601 with or without zone, "now", or whatever the browser's
// Date parser accepts) rendered as one row per format, click-to-copy. All
// rendering is derived from a single epoch-milliseconds value; the detected
// row always states what was assumed. Verified in the extraction harness
// under TZ=UTC (exact vectors) plus round-trip properties in the real zone.
(function () {
  var input = document.getElementById("ts-input");
  var tableEl = document.getElementById("ts-table");
  if (!input || !tableEl) return;
  var nowBtn = document.getElementById("ts-now");
  var errorEl = document.getElementById("ts-error");
  var descEl = document.getElementById("ts-desc");

  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday",
                  "Thursday", "Friday", "Saturday"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MAX_MS = 8640000000000000; // ±100M days: the Date range

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function pad4(n) {
    var s = String(Math.abs(n));
    while (s.length < 4) s = "0" + s;
    return (n < 0 ? "-" : "") + s;
  }

  // getTimezoneOffset() is minutes BEHIND UTC: NY summer 240 -> "-04:00",
  // Kolkata -330 -> "+05:30".
  function offsetString(minutes) {
    var sign = minutes <= 0 ? "+" : "-";
    var abs = Math.abs(minutes);
    return sign + pad2(Math.floor(abs / 60)) + ":" + pad2(abs % 60);
  }

  function fracPart(ms) {
    var frac = ((ms % 1000) + 1000) % 1000;
    return frac ? "." + (frac < 10 ? "00" : frac < 100 ? "0" : "") + frac : "";
  }

  function isoUTC(ms) {
    var d = new Date(ms);
    return pad4(d.getUTCFullYear()) + "-" + pad2(d.getUTCMonth() + 1) + "-" +
      pad2(d.getUTCDate()) + "T" + pad2(d.getUTCHours()) + ":" +
      pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds()) + fracPart(ms) + "Z";
  }

  function isoLocal(ms) {
    var d = new Date(ms);
    return pad4(d.getFullYear()) + "-" + pad2(d.getMonth() + 1) + "-" +
      pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" +
      pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + fracPart(ms) +
      offsetString(d.getTimezoneOffset());
  }

  function rfc2822Local(ms) {
    var d = new Date(ms);
    return DOW[d.getDay()] + ", " + pad2(d.getDate()) + " " + MON[d.getMonth()] +
      " " + pad4(d.getFullYear()) + " " + pad2(d.getHours()) + ":" +
      pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + " " +
      offsetString(d.getTimezoneOffset()).replace(":", "");
  }

  function localHuman(ms) {
    var d = new Date(ms);
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZoneName: "short",
      }).format(d);
    }
    return d.toString();
  }

  function relativeOf(ms, nowMs) {
    var diff = ms - nowMs;
    var abs = Math.abs(diff);
    var units = [
      [31557600000, "year"], [2629800000, "month"], [86400000, "day"],
      [3600000, "hour"], [60000, "minute"],
    ];
    if (abs < 45000) return diff <= 0 ? "just now" : "in a moment";
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var n = Math.round(abs / units[i][0]);
        var word = n + " " + units[i][1] + (n > 1 ? "s" : "");
        return diff < 0 ? word + " ago" : "in " + word;
      }
    }
    var secs = Math.round(abs / 1000);
    return diff < 0 ? secs + " seconds ago" : "in " + secs + " seconds";
  }

  // Pure calendar math on components (timezone-free, harness-stable).
  function dayOfYear(y, m, d) {
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  }

  // ISO 8601 week number: the week containing the year's first Thursday.
  function weekNum(y, m, d) {
    var t = new Date(Date.UTC(y, m - 1, d));
    var day = (t.getUTCDay() + 6) % 7; // Mon=0
    t.setUTCDate(t.getUTCDate() - day + 3); // this week's Thursday
    var firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    var fday = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
    return 1 + Math.round((t - firstThu) / 604800000);
  }

  // ---- input -> { ms, detected } | { error } ----
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|z|[+-]\d{2}:?\d{2})?)?$/;

  function parseInput(text, nowMs) {
    var t = text.trim();
    if (!t) return { empty: true };
    if (/^now$/i.test(t)) return { ms: nowMs, detected: "the current moment" };

    if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
      var n = Number(t);
      var abs = Math.abs(n), ms, unit;
      if (abs < 1e11) { ms = n * 1000; unit = "seconds"; }
      else if (abs < 1e14) { ms = n; unit = "milliseconds"; }
      else if (abs < 1e17) { ms = n / 1000; unit = "microseconds"; }
      else { ms = n / 1000000; unit = "nanoseconds"; }
      ms = Math.round(ms);
      if (Math.abs(ms) > MAX_MS) {
        return { error: "that's outside the representable date range (±275,760 years)" };
      }
      return { ms: ms, detected: "Unix " + unit + " (guessed by magnitude)" };
    }

    var m = ISO_RE.exec(t);
    if (m) {
      var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      var h = Number(m[4] || 0), mi = Number(m[5] || 0), s = Number(m[6] || 0);
      var frac = m[7] ? Number((m[7] + "000").slice(0, 3)) : 0;
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) {
        return { error: "those date/time fields are out of range" };
      }
      var ms2, detected;
      if (m[8] && m[8].toUpperCase() === "Z") {
        ms2 = Date.UTC(y, mo - 1, d, h, mi, s, frac);
        detected = "ISO 8601 (UTC)";
      } else if (m[8]) {
        var om = /^([+-])(\d{2}):?(\d{2})$/.exec(m[8]);
        var offMin = (om[1] === "-" ? -1 : 1) * (Number(om[2]) * 60 + Number(om[3]));
        ms2 = Date.UTC(y, mo - 1, d, h, mi, s, frac) - offMin * 60000;
        detected = "ISO 8601 (UTC" + offsetString(-offMin) + " offset)";
      } else if (m[4] !== undefined) {
        var local = new Date(y, mo - 1, d, h, mi, s, frac);
        ms2 = local.getTime();
        detected = "ISO 8601, no timezone — assumed your local clock";
        if (local.getFullYear() !== y || local.getMonth() !== mo - 1 || local.getDate() !== d) {
          return { error: pad4(y) + "-" + pad2(mo) + "-" + pad2(d) + " isn't a real calendar date" };
        }
      } else {
        ms2 = Date.UTC(y, mo - 1, d);
        detected = "ISO 8601 date — midnight UTC";
      }
      // Reject rollovers like Feb 30 (the local path verified above).
      var cd = new Date(Date.UTC(y, mo - 1, d));
      if (cd.getUTCMonth() !== mo - 1 || cd.getUTCDate() !== d) {
        return { error: pad4(y) + "-" + pad2(mo) + "-" + pad2(d) + " isn't a real calendar date" };
      }
      return { ms: ms2, detected: detected };
    }

    var guess = new Date(t);
    if (!isNaN(guess.getTime())) {
      return { ms: guess.getTime(), detected: "your browser's Date parser" };
    }
    return { error: "couldn't recognize this as a timestamp" };
  }

  function epochSecondsText(ms) {
    var whole = Math.floor(ms / 1000);
    var frac = ((ms % 1000) + 1000) % 1000;
    return frac ? whole + "." + (frac < 10 ? "00" : frac < 100 ? "0" : "") + frac
                : String(whole);
  }

  // ---- rendering ----
  function factRow(label, dd) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = label;
    var d = document.createElement("dd");
    d.textContent = dd;
    d.setAttribute("title", "Click to copy");
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }

  function tzRow() {
    var name = "your timezone";
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) name = tz;
    }
    var now = new Date();
    var jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
    var jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
    var dst = jan === jul ? "no DST"
      : now.getTimezoneOffset() < Math.max(jan, jul) ? "DST in effect" : "DST not in effect";
    return name + " · UTC" + offsetString(now.getTimezoneOffset()) + " · " + dst;
  }

  function render() {
    var nowMs = Date.now();
    var res = parseInput(input.value, nowMs);
    if (res.empty) {
      errorEl.hidden = true;
      input.classList.remove("invalid");
      descEl.hidden = true;
      tableEl.textContent = "";
      return;
    }
    if (res.error) {
      errorEl.textContent = "Can't parse: " + res.error + ".";
      errorEl.hidden = false;
      input.classList.add("invalid");
      return;
    }
    errorEl.hidden = true;
    input.classList.remove("invalid");
    tableEl.textContent = "";

    var ms = res.ms;
    var d = new Date(ms);
    descEl.textContent = localHuman(ms) + " — " + relativeOf(ms, nowMs) + ".";
    descEl.hidden = false;

    tableEl.appendChild(factRow("Detected as", res.detected));
    tableEl.appendChild(factRow("Unix seconds", epochSecondsText(ms)));
    tableEl.appendChild(factRow("Unix milliseconds", String(ms)));
    tableEl.appendChild(factRow("ISO 8601 · UTC", isoUTC(ms)));
    tableEl.appendChild(factRow("ISO 8601 · local", isoLocal(ms)));
    tableEl.appendChild(factRow("UTC", d.toUTCString()));
    tableEl.appendChild(factRow("RFC 2822 · local", rfc2822Local(ms)));
    tableEl.appendChild(factRow("Calendar · local",
      DOW_FULL[d.getDay()] + " · day " +
      dayOfYear(d.getFullYear(), d.getMonth() + 1, d.getDate()) + " of " +
      d.getFullYear() + " · ISO week " +
      weekNum(d.getFullYear(), d.getMonth() + 1, d.getDate())));
    tableEl.appendChild(factRow("Your timezone", tzRow()));
  }

  // Click any value to copy it.
  tableEl.addEventListener("click", function (e) {
    var dd = e.target.closest ? e.target.closest("dd") : null;
    if (!dd || !navigator.clipboard) return;
    navigator.clipboard.writeText(dd.textContent).then(function () {
      dd.classList.add("ts-copied");
      setTimeout(function () { dd.classList.remove("ts-copied"); }, 600);
    }).catch(function () { /* clipboard unavailable */ });
  });

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  nowBtn.addEventListener("click", function () {
    input.value = String(Math.floor(Date.now() / 1000));
    render();
  });

  // ---- one-click examples ----
  var EXAMPLES = {
    epoch: "0",
    y2038: "2147483647", // the 32-bit signed overflow moment
    tokyo: "2026-12-25T00:00+09:00",
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

  input.value = String(Math.floor(Date.now() / 1000));
  render();
})();
