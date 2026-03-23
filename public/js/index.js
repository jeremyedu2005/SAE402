<<<<<<< Updated upstream
 let equipeSelectionnee = null;

        // Sélection d'équipe
        document.querySelectorAll(".team-card").forEach((card) => {
            card.addEventListener("click", () => {
                document.querySelectorAll(".team-card").forEach((c) => c.classList.remove("selected"));
                card.classList.add("selected");
                equipeSelectionnee = card.dataset.team;
            });
        });

        // Bouton suivant
        document.querySelector("#btn-suivant").addEventListener("click", () => {
            if (!equipeSelectionnee) {
                document.getElementById("erreur").style.display = "block";
                return;
            }
            document.querySelector("#erreur").style.display = "none";
            localStorage.setItem("equipeChoisie", equipeSelectionnee);
            window.location.href = "page/class.html";
        });
=======
document.addEventListener("DOMContentLoaded", () => {
  /* 1. ÉLÉMENTS DU DOM */
  const blueCorner = document.getElementById("blue-corner");
  const redCorner = document.getElementById("red-corner");
  const subtitle = document.getElementById("vanishing-subtitle");
  const h1 = document.getElementById("vanishing-h1");
  const logo = document.getElementById("main-logo");

  /* 2. SYSTÈME DE PARTICULES */
  function createPixel(corner, color, team) {
    if (!corner) return;
    const pixel = document.createElement("div");
    pixel.className = "pixel-particle";
    pixel.style.backgroundColor = color;

    const size = Math.floor(Math.random() * 6) + 5;
    pixel.style.width = `${size}px`;
    pixel.style.height = `${size}px`;

    const delay = Math.random() * 0.5;
    pixel.style.animationDelay = `${delay}s`;

    if (team === "blue") {
      pixel.style.left = "50px";
      pixel.style.bottom = "50px";
      pixel.style.setProperty("--dx", `${100 + Math.random() * 400}px`);
      pixel.style.setProperty("--dy", `${-(300 + Math.random() * 700)}px`);
    } else {
      pixel.style.right = "50px";
      pixel.style.bottom = "50px";
      pixel.style.setProperty("--dx", `${-(100 + Math.random() * 400)}px`);
      pixel.style.setProperty("--dy", `${-(300 + Math.random() * 700)}px`);
    }

    corner.appendChild(pixel);
    setTimeout(() => pixel.remove(), 2500);
  }

  setInterval(() => createPixel(blueCorner, "#00ffff", "blue"), 50);
  setTimeout(() => {
    setInterval(() => createPixel(redCorner, "#ff0000", "red"), 50);
  }, 85);

  /* 3. GESTION DES INTERACTIONS (SOURIS) */
  document.addEventListener("mousemove", (e) => {
    const halfWidth = window.innerWidth / 2;
    const triggerHeight = window.innerHeight * 0.7;

    if (e.clientY > triggerHeight) {
      if (subtitle) subtitle.style.opacity = "0";
      if (h1) h1.style.opacity = "0";
      if (logo) logo.classList.add("focus");

      blueCorner.style.pointerEvents = "auto";
      redCorner.style.pointerEvents = "auto";

      if (e.clientX < halfWidth) {
        blueCorner.classList.add("bright");
        blueCorner.classList.remove("dim");
        redCorner.classList.add("dim");
        redCorner.classList.remove("bright");
      } else {
        redCorner.classList.add("bright");
        redCorner.classList.remove("dim");
        blueCorner.classList.add("dim");
        blueCorner.classList.remove("bright");
      }
    } else {
      if (subtitle) subtitle.style.opacity = "1";
      if (h1) h1.style.opacity = "1";
      if (logo) logo.classList.remove("focus");

      blueCorner.style.pointerEvents = "none";
      redCorner.style.pointerEvents = "none";

      blueCorner.classList.remove("bright", "dim");
      redCorner.classList.remove("bright", "dim");
    }
  });

  /* 4. SÉLECTION ET REDIRECTION */
  const selectAndRedirect = (team) => {
    localStorage.setItem("equipeChoisie", team);
    window.location.href = "page/class.html";
  };

  blueCorner.addEventListener("click", () => selectAndRedirect("blue"));
  redCorner.addEventListener("click", () => selectAndRedirect("red"));
});
>>>>>>> Stashed changes
