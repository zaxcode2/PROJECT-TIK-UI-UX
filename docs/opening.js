(() => {
  const progress = document.getElementById("loaderBar");
  const status = document.getElementById("loaderStatus");

  let pct = 0;
  const timer = setInterval(() => {
    pct += Math.random() * 14;
    if (pct > 100) pct = 100;
    progress.style.width = `${pct}%`;
    status.textContent = pct < 45 ? "Building interface..." : pct < 80 ? "Warming game systems..." : "Ready.";

    if (pct >= 100) {
      clearInterval(timer);
      setTimeout(() => window.location.replace("index.html"), 350);
    }
  }, 180);
})();
