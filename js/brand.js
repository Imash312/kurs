// «ИМРАН» астындагы «компьютердик сабаттуулук» жазуусун ИМРАНдын туурасына так тегиздейт.
(function () {
  const textWidth = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
  function fit() {
    document.querySelectorAll(".wm").forEach(wm => {
      const b = wm.querySelector("b"), s = wm.querySelector("small");
      if (!b || !s) return;
      s.style.letterSpacing = "0px"; s.style.marginRight = ""; s.style.fontSize = "";
      // ИМРАНдын көрүнгөн туурасы (акыркы тамгадан кийинки аралыкты эсепке албай)
      const bw = textWidth(b) - (parseFloat(getComputedStyle(b).letterSpacing) || 0);
      let sw = textWidth(s);
      if (sw > bw) { // жазуу узун болсо, арипти кичирейтет
        s.style.fontSize = (parseFloat(getComputedStyle(s).fontSize) * bw / sw * 0.98) + "px";
        sw = textWidth(s);
      }
      const n = s.textContent.length;
      if (n > 1 && bw > sw) {
        const ls = (bw - sw) / (n - 1);
        s.style.letterSpacing = ls + "px";
        s.style.marginRight = -ls + "px";
      }
    });
  }
  window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  document.addEventListener("DOMContentLoaded", fit);
  window.fitWordmarks = fit;
})();
