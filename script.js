const result = document.getElementById("result");
const inputCard = document.getElementById("inputCard");
const newRecipeSection = document.getElementById("newRecipeSection");
const savedModal = document.getElementById("savedModal");
const savedList = document.getElementById("savedList");

const filterCategory = document.getElementById("filterCategory");
const orderRating = document.getElementById("orderRating");

document.getElementById("savedBtn").onclick = showSaved;

let currentCategory = "";
let currentRating = 0;

async function generate() {
  const ingredients = document.getElementById("ingredients").value.trim();
  if (!ingredients) return alert("Inserisci ingredienti");

  inputCard.style.display = "none";

  result.innerHTML = `
    <div class="loading">
      🍳 Sto cucinando, aspetta
      <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
    </div>
  `;

  const people = 2; // provvisorio (poi metteremo il menu a tendina)

  const prompt = `
Crea una ricetta italiana usando questi ingredienti:
${ingredients} per ${people} persone.

Nome della ricetta in prima riga, poi descrizione breve e difficoltà.
Ingredienti e procedimento ordinati.
Scrivi tempi di cottura PRECISI in MINUTI (es: "cuoci per 10 minuti").
Usa linguaggio semplice.
Ricetta originale.
(non scrivere "Ecco la ricetta", solo la ricetta stessa), (non scrivere ricetta per x persone, lo so già), (non scrivere tempo totale preparazione, si sa già).
`;

  try {
    const response = await puter.ai.chat(prompt, { model: "gpt-5-nano" });

    let text =
      typeof response === "string"
        ? response
        : response?.message?.content || response?.content;

    currentCategory = detectCategory(text);
    currentRating = 0;

    // --- INSERIAMO I TIMER DIRETTAMENTE NEL TESTO ---
    let htmlText = text.replace(
      /(\d+)\s*minuti(\s*[.,;:!?])?/gi,
      (match, num, punctuation) => {
        const id = "t" + Math.random().toString(36).slice(2, 7);
        const punct = punctuation || "";
        return `${num} minuti${punct}
<span style="margin-left:8px;">
  <button class="primary timer-btn" id="btn-${id}" onclick="startInlineTimer(${num}, '${id}', this)">⏱ ${num}m</button>
</span>`;
      }
    );

    result.innerHTML = `
      <div class="card recipe-appear">
        <pre id="recipeText">${htmlText}</pre>

        <div class="rating">
          <span class="rating-label">Valutazione:</span>
          <div class="stars" id="stars">${renderStars(0)}</div>
        </div>

        <div class="actions">
          <button onclick="speak()">Ascolta 🔊</button>
          <button onclick="stopAudio()">Stop 🛑</button>
          <button onclick="save()">Salva 💾</button>
        </div>
      </div>
    `;

    newRecipeSection.style.display = "block";
  } catch (e) {
    console.error(e);
    result.innerHTML = `<div class="card">❌ È finito il gas... per oggi a dieta!! (Errore IA)</div>`;
    inputCard.style.display = "block";
  }
}

function resetApp() {
  document.getElementById("ingredients").value = "";
  result.innerHTML = "";
  inputCard.style.display = "block";
  newRecipeSection.style.display = "none";
}

/* ---------- STELLE ---------- */
function renderStars(active) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `
      <span class="star ${i <= active ? "active" : ""}"
            onclick="setRating(${i})">★</span>
    `;
  }
  return html;
}

function setRating(v) {
  currentRating = v;
  document.getElementById("stars").innerHTML = renderStars(v);
}

/* ---------- AUDIO LETTURA ---------- */
function speak() {
  speechSynthesis.cancel();
  speechSynthesis.speak(
    new SpeechSynthesisUtterance(
      document.getElementById("recipeText").innerText
    )
  );
}

function stopAudio() {
  speechSynthesis.cancel();
}

/* ---------- SALVA (con obblighi) ---------- */
function save() {
  let text = document.getElementById("recipeText").innerText;
  
  // Rimuove il testo dei timer (es: "⏱ 2m", "0:45", "✅ Finito!", ecc)
  text = text.replace(/\s*⏱\s*\d+m\s*/g, '');
  text = text.replace(/\s*\d+:\d{2}\s*/g, '');
  text = text.replace(/\s*✅\s*Finito!\s*/g, '');
  text = text.replace(/\s*✔\s*Timer completato\s*/g, '');
  
  const name = text.split("\n")[0] || "Ricetta";

  if (currentRating === 0) {
    alert("⭐ Dai prima una valutazione da 1 a 5 stelle!");
    return;
  }

  const category = prompt(
    "Scegli il tipo di piatto:\n\nantipasto\nprimo\nsecondo\ndolce"
  );

  if (!category) return alert("Salvataggio annullato.");

  const cat = category.toLowerCase().trim();

  if (!["antipasto", "primo", "secondo", "dolce"].includes(cat)) {
    return alert("Scrivi esattamente: antipasto, primo, secondo o dolce.");
  }

  const recipes = JSON.parse(localStorage.getItem("recipes") || "[]");

  recipes.push({
    name,
    text,
    category: cat,
    rating: currentRating,
  });

  localStorage.setItem("recipes", JSON.stringify(recipes));
  alert("✅ Ricetta salvata!");
}

/* ---------- TIMER INLINE CON COUNTDOWN ---------- */
function startInlineTimer(minuti, spanId, btn) {
  let remaining = minuti * 60; // secondi totali

  btn.disabled = true;

  const interval = setInterval(() => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    btn.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    remaining--;

    if (remaining < 0) {
      clearInterval(interval);

      const audio = new Audio("timer.mp3");
      audio.play();

      btn.textContent = "✅ Finito!";
      btn.disabled = false;
      alert(`⏰ Timer ${minuti} minuti terminato!`);
    }
  }, 1000);
}

/* ---------- RICETTE SALVATE ---------- */
function showSaved() {
  savedModal.style.display = "block";
  savedList.innerHTML = "";

  let recipes = JSON.parse(localStorage.getItem("recipes") || "[]");

  const filter = filterCategory.value;
  const order = orderRating.value;
  const searchTerm = document.getElementById("searchRecipe").value.toLowerCase();

  if (filter !== "all")
    recipes = recipes.filter((r) => r.category === filter);

  if (searchTerm)
    recipes = recipes.filter((r) => r.name.toLowerCase().includes(searchTerm));

  recipes.sort((a, b) =>
    order === "asc" ? a.rating - b.rating : b.rating - a.rating
  );

  recipes.forEach((r, i) => {
    const d = document.createElement("details");
    d.innerHTML = `
      <summary>${r.name} ${"★".repeat(r.rating)}</summary>
      <pre>${r.text}</pre>
      <div class="actions">
        <button onclick="deleteRecipe(${i})">Elimina 🗑</button>
        <button onclick="exportPDF(${i})">Esporta 📄</button>
      </div>
    `;
    savedList.appendChild(d);
  });
}
function deleteRecipe(i) {
  const r = JSON.parse(localStorage.getItem("recipes"));
  r.splice(i, 1);
  localStorage.setItem("recipes", JSON.stringify(r));
  showSaved();
}

function renameRecipe(i) {
  const r = JSON.parse(localStorage.getItem("recipes"));
  const n = prompt("Nuovo nome:", r[i].name);
  if (n) {
    r[i].name = n;
    localStorage.setItem("recipes", JSON.stringify(r));
    showSaved();
  }
}

function exportPDF(i) {
  const r = JSON.parse(localStorage.getItem("recipes"))[i];
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.text(r.text, 10, 10, { maxWidth: 180 });
  pdf.save(r.name + ".pdf");
}

function closeSaved() {
  savedModal.style.display = "none";
}

/* ---------- CATEGORIA AUTOMATICA (solo per filtro) ---------- */
function detectCategory(t) {
  t = t.toLowerCase();
  if (t.includes("antipasto")) return "antipasto";
  if (t.includes("secondo")) return "secondo";
  if (t.includes("dolce")) return "dolce";
  return "primo";
}
