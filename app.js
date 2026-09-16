(async () => {
  if (!document.getElementById("resendConfirmation")) {
    const hiddenResend = document.createElement("button");
    hiddenResend.id = "resendConfirmation";
    hiddenResend.type = "button";
    hiddenResend.hidden = true;
    document.body.appendChild(hiddenResend);
  }
  const files = ["app.part1.txt","app.part2.txt","app.part3.txt","app.part4.txt","app.part5.txt"];
  const parts = await Promise.all(files.map(async file => {
    const response = await fetch(file, { cache: "no-store" });
    if (!response.ok) throw new Error(`Impossible de charger ${file}`);
    return response.text();
  }));
  const source = parts.join("");
  (0, eval)(source);
})().catch(error => {
  console.error("Lion Dynasty app loading error", error);
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "Le site n’a pas pu se charger. Recharge la page.";
    toast.classList.add("show");
  }
});
