/*
 * Click-to-reveal email (anti-harvesting).
 *
 * The full address is never written into the HTML source. It is assembled
 * here from separate parts and only inserted into the DOM after the visitor
 * clicks a [data-email-reveal] button.
 *
 * Buttons marked data-requires-human stay disabled until the page signals a
 * successful human verification (the intake page does this after Turnstile
 * succeeds by setting window.rdwHumanVerified and dispatching the
 * "rdw:human-verified" event).
 */
(function () {
  "use strict";

  const user = "admin";
  const domain = "rapiprintdesignworks.com";
  const scheme = "mail" + "to:";

  function revealButtons() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-email-reveal]"));
  }

  function needsHuman(btn) {
    return btn.hasAttribute("data-requires-human");
  }

  function setGate(btn, ok) {
    if (!needsHuman(btn)) return;
    btn.disabled = !ok;
    if (ok) {
      btn.removeAttribute("title");
    } else {
      btn.setAttribute("title", "Complete the human verification below to enable");
    }
  }

  function reveal(btn) {
    if (btn.disabled) return;
    if (needsHuman(btn) && !window.rdwHumanVerified) return;

    const address = user + "@" + domain;
    const link = document.createElement("a");
    link.className = "email-reveal-link";
    link.href = scheme + address;
    link.textContent = address;
    btn.parentNode.replaceChild(link, btn);
  }

  function init() {
    revealButtons().forEach(function (btn) {
      setGate(btn, !!window.rdwHumanVerified);
      btn.addEventListener("click", function () { reveal(btn); });
    });
  }

  document.addEventListener("rdw:human-verified", function (e) {
    const ok = !!(e && e.detail && e.detail.verified);
    revealButtons().forEach(function (btn) { setGate(btn, ok); });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
