// Places the couple's bit.ly QR (assets/qr-bitly.png → https://bit.ly/AdamRae) and short link.
// The short link is case-sensitive: keep "AdamRae" exactly as written.
const SHORT_LINK = "bit.ly/AdamRae";
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".qr").forEach(el => {
    el.innerHTML = '<img src="../assets/qr-bitly.png" alt="QR code to bit.ly/AdamRae" style="width:100%;height:100%;display:block">';
  });
  document.querySelectorAll(".url-text").forEach(el => el.textContent = SHORT_LINK);
});
