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