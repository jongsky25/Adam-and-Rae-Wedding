// Draws the QR for the upload page link typed in the toolbar.
function renderQR() {
  const url = document.getElementById("url").value.trim();
  const qr = qrcode(0, "M"); qr.addData(url); qr.make();
  const n = qr.getModuleCount(); let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const svg = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code to share photos"><path fill="#3b1d22" d="${d}"/></svg>`;
  document.querySelectorAll(".qr").forEach(el => el.innerHTML = svg);
  document.querySelectorAll(".url-text").forEach(el => el.textContent = url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
}
document.addEventListener("DOMContentLoaded", renderQR);
