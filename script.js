const result = document.getElementById("result");
const inputCard = document.getElementById("inputCard");
const newRecipeSection = document.getElementById("newRecipeSection");
const savedModal = document.getElementById("savedModal");
const savedList = document.getElementById("savedList");

const filterCategory = document.getElementById("filterCategory");
const orderRating = document.getElementById("orderRating");

const chipsBox = document.getElementById("chips");
const ingredientInput = document.getElementById("ingredientInput");
const peopleSelect = document.getElementById("people");

document.getElementById("savedBtn").onclick = showSaved;

let currentCategory = "";
let currentRating = 0;
let ingredientChips = [];
let lastRecipeText = "";
let lastRecipeName = "";
const activeFilters = new Set();

/* ---------- UTILS ---------- */
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function getSavedRecipes() {
  return JSON.parse(localStorage.getItem("recipes") || "[]");
}

/* ---------- BOZZA (persistenza ingredienti/filtri tra un refresh e l'altro) ---------- */
function saveDraft() {
  localStorage.setItem(
    "sc_draft",
    JSON.stringify({
      chips: ingredientChips,
      people: peopleSelect.value,
      filters: Array.from(activeFilters),
    })
  );
}

function loadDraft() {
  let d;
  try {
    d = JSON.parse(localStorage.getItem("sc_draft") || "null");
  } catch (e) {
    d = null;
  }
  if (!d) return;

  ingredientChips = Array.isArray(d.chips) ? d.chips : [];
  renderChips();

  if (d.people) peopleSelect.value = d.people;

  if (Array.isArray(d.filters)) {
    d.filters.forEach((f) => {
      activeFilters.add(f);
      const btn = document.querySelector(`.filter-chip[data-filter="${f}"]`);
      if (btn) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
      }
    });
  }
}

/* ---------- CHIP INGREDIENTI ---------- */
function renderChips() {
  chipsBox.innerHTML = ingredientChips
    .map(
      (c, i) => `
      <span class="chip">${escapeHtml(c)}
        <button type="button" class="chip-remove" onclick="removeChip(${i})" aria-label="Rimuovi ${escapeHtml(c)}">×</button>
      </span>`
    )
    .join("");
}

function addChip(value) {
  const v = value.trim();
  if (!v) return;
  ingredientChips.push(v);
  renderChips();
  saveDraft();
}

function removeChip(i) {
  ingredientChips.splice(i, 1);
  renderChips();
  saveDraft();
}

ingredientInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addChip(ingredientInput.value);
    ingredientInput.value = "";
  } else if (e.key === "Backspace" && ingredientInput.value === "" && ingredientChips.length) {
    ingredientChips.pop();
    renderChips();
    saveDraft();
  }
});

peopleSelect.addEventListener("change", saveDraft);

/* ---------- FILTRI RAPIDI ---------- */
document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const f = btn.dataset.filter;
    if (activeFilters.has(f)) {
      activeFilters.delete(f);
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    } else {
      activeFilters.add(f);
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    }
    saveDraft();
  });
});

function buildConstraints() {
  let c = "";
  if (activeFilters.has("vegetariano")) {
    c += "\nLa ricetta deve essere vegetariana: niente carne né pesce.";
  }
  if (activeFilters.has("veloce")) {
    c += "\nIl tempo totale (preparazione + cottura) deve stare sotto i 30 minuti.";
  }
  if (activeFilters.has("senzaglutine")) {
    c += "\nLa ricetta deve essere senza glutine: evita ingredienti che lo contengono.";
  }
  return c;
}

/* ---------- GENERA RICETTA ---------- */
async function generate() {
  const pending = ingredientInput.value.trim();
  if (pending) {
    addChip(pending);
    ingredientInput.value = "";
  }

  if (ingredientChips.length === 0) return alert("Inserisci almeno un ingrediente");

  const ingredients = ingredientChips.join(", ");
  const people = peopleSelect.value;
  const constraints = buildConstraints();

  inputCard.style.display = "none";

  result.innerHTML = `
    <div class="loading">
      Sto cucinando, aspetta
      <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
    </div>
  `;

  const prompt = `
Crea una ricetta italiana usando questi ingredienti:
${ingredients} per ${people} persone.
${constraints}

Nome della ricetta in prima riga.
Nella seconda riga scrivi esattamente "Difficoltà: " seguito da Facile, Media o Difficile.
Nella terza riga scrivi esattamente "Tempo totale: " seguito dal numero di minuti totali, es: "Tempo totale: 35 minuti".
Poi vai a capo e scrivi una breve descrizione, seguita da ingredienti e procedimento ordinati.
Scrivi tempi di cottura PRECISI in MINUTI (es: "cuoci per 10 minuti").
Usa linguaggio semplice.
Ricetta originale.
(non scrivere "Ecco la ricetta", solo la ricetta stessa), (non scrivere ricetta per x persone, lo so già), (non ripetere il tempo totale nel corpo del testo, l'hai già scritto sopra).
`;

  try {
    const response = await puter.ai.chat(prompt, { model: "gpt-5-nano" });

    let text =
      typeof response === "string"
        ? response
        : response?.message?.content || response?.content;

    currentCategory = detectCategory(text);
    currentRating = 0;

    // Tutto il testo generato dall'IA viene sempre escapato prima di finire nel DOM:
    // gli unici tag HTML reali che inseriamo sono i bottoni dei timer, costruiti da noi.
    const safeText = escapeHtml(text);

    const diffMatch = safeText.match(/Difficolt[àa]\s*:\s*([^\n<]+)/i);
    const timeMatch = safeText.match(/Tempo totale\s*:\s*([^\n<]+)/i);

    let cleanText = safeText
      .replace(/Difficolt[àa]\s*:\s*[^\n]+\n?/i, "")
      .replace(/Tempo totale\s*:\s*[^\n]+\n?/i, "");

    // --- INSERIAMO I TIMER DIRETTAMENTE NEL TESTO ---
    const htmlText = cleanText.replace(
      /(\d+)\s*minuti(\s*[.,;:!?])?/gi,
      (match, num, punctuation) => {
        const id = "t" + Math.random().toString(36).slice(2, 7);
        const punct = punctuation || "";
        return `${num} minuti${punct} <button class="timer-btn" id="btn-${id}" onclick="startInlineTimer(${num}, '${id}', this)">⏱ ${num}m</button>`;
      }
    );

    const nl = htmlText.indexOf("\n");
    const titleHtml = nl === -1 ? htmlText.trim() : htmlText.slice(0, nl).trim();
    const bodyHtml = nl === -1 ? "" : htmlText.slice(nl + 1).trim();

    const badges = [`<span class="badge">${capitalize(currentCategory)}</span>`];
    if (diffMatch) badges.push(`<span class="badge">${diffMatch[1].trim()}</span>`);
    if (timeMatch) badges.push(`<span class="badge">${timeMatch[1].trim()}</span>`);

    const savedCount = getSavedRecipes().length;

    result.innerHTML = `
      <div class="card recipe-appear">
        <div class="recipe-head">
          <h2 class="recipe-title" id="recipeTitle">${titleHtml}</h2>
          <div class="badges" id="recipeBadges">${badges.join("")}</div>
        </div>

        <pre id="recipeText" class="recipe-body">${bodyHtml}</pre>

        <div class="rating">
          <span class="rating-label">Valutazione:</span>
          <div class="stars" id="stars">${renderStars(0)}</div>
        </div>

        <div class="actions">
          <button onclick="speak()">Ascolta</button>
          <button onclick="stopAudio()">Stop</button>
          <button onclick="save()">Salva</button>
        </div>

        <div class="recipe-meta">
          <span id="savedCountLabel">Salvate · ${savedCount}</span>
          <button type="button" onclick="exportCurrentPDF()">Export PDF</button>
        </div>
      </div>
    `;

    lastRecipeName = document.getElementById("recipeTitle").innerText.trim() || "Ricetta";
    lastRecipeText = getFullRecipeText();

    newRecipeSection.style.display = "block";
  } catch (e) {
    console.error(e);
    result.innerHTML = `<div class="card">È finito il gas... per oggi a dieta! (Errore IA, riprova tra poco)</div>`;
    inputCard.style.display = "block";
  }
}

function resetApp() {
  ingredientChips = [];
  renderChips();
  ingredientInput.value = "";
  activeFilters.clear();
  document.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-pressed", "false");
  });
  saveDraft();
  result.innerHTML = "";
  inputCard.style.display = "block";
  newRecipeSection.style.display = "none";
}

function getFullRecipeText() {
  const title = document.getElementById("recipeTitle")?.innerText || "";
  const body = document.getElementById("recipeText")?.innerText || "";
  return (title + "\n" + body).trim();
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
  speechSynthesis.speak(new SpeechSynthesisUtterance(getFullRecipeText()));
}

function stopAudio() {
  speechSynthesis.cancel();
}

/* ---------- SALVA ---------- */
function save() {
  let text = getFullRecipeText();

  // Rimuove il testo dei timer (es: "⏱ 2m", "0:45", "✅ Finito!", ecc)
  text = text.replace(/\s*⏱\s*\d+m\s*/g, "");
  text = text.replace(/\s*\d+:\d{2}\s*/g, "");
  text = text.replace(/\s*✅\s*Finito!\s*/g, "");

  const name = lastRecipeName || text.split("\n")[0] || "Ricetta";

  if (currentRating === 0) {
    alert("Dai prima una valutazione da 1 a 5 stelle!");
    return;
  }

  const recipes = getSavedRecipes();
  recipes.push({
    name,
    text,
    category: currentCategory || "primo",
    rating: currentRating,
  });

  localStorage.setItem("recipes", JSON.stringify(recipes));

  const label = document.getElementById("savedCountLabel");
  if (label) label.textContent = `Salvate · ${recipes.length}`;

  alert("Ricetta salvata!");
}

/* ---------- EXPORT PDF (ricetta corrente, anche non salvata) ---------- */
function exportCurrentPDF() {
  if (!lastRecipeText) return;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.text(lastRecipeText, 10, 10, { maxWidth: 180 });
  pdf.save((lastRecipeName || "ricetta") + ".pdf");
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
      alert(`Timer ${minuti} minuti terminato!`);
    }
  }, 1000);
}

/* ---------- RICETTE SALVATE ---------- */
function showSaved() {
  savedModal.style.display = "block";

  let recipes = getSavedRecipes();

  const filter = filterCategory.value;
  const order = orderRating.value;
  const searchTerm = document.getElementById("searchRecipe").value.toLowerCase();

  if (filter !== "all") recipes = recipes.filter((r) => r.category === filter);
  if (searchTerm) recipes = recipes.filter((r) => r.name.toLowerCase().includes(searchTerm));

  recipes.sort((a, b) => (order === "asc" ? a.rating - b.rating : b.rating - a.rating));

  if (recipes.length === 0) {
    savedList.innerHTML = `<p class="empty-state">Nessuna ricetta salvata (ancora).</p>`;
    return;
  }

  savedList.innerHTML = "";
  recipes.forEach((r, i) => {
    const d = document.createElement("details");
    d.innerHTML = `
      <summary>${escapeHtml(r.name)} ${"★".repeat(r.rating)}</summary>
      <pre>${escapeHtml(r.text)}</pre>
      <div class="actions">
        <button onclick="deleteRecipe(${i})">Elimina</button>
        <button onclick="exportPDF(${i})">Esporta</button>
      </div>
    `;
    savedList.appendChild(d);
  });
}

function deleteRecipe(i) {
  const r = getSavedRecipes();
  r.splice(i, 1);
  localStorage.setItem("recipes", JSON.stringify(r));
  showSaved();
}

function renameRecipe(i) {
  const r = getSavedRecipes();
  const n = prompt("Nuovo nome:", r[i].name);
  if (n) {
    r[i].name = n;
    localStorage.setItem("recipes", JSON.stringify(r));
    showSaved();
  }
}

function exportPDF(i) {
  const r = getSavedRecipes()[i];
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.text(r.text, 10, 10, { maxWidth: 180 });
  pdf.save(r.name + ".pdf");
}

function closeSaved() {
  savedModal.style.display = "none";
}

/* ---------- CATEGORIA AUTOMATICA ---------- */
function detectCategory(t) {
  t = t.toLowerCase();
  if (t.includes("antipasto")) return "antipasto";
  if (t.includes("secondo")) return "secondo";
  if (t.includes("dolce")) return "dolce";
  return "primo";
}

/* ---------- INIT ---------- */
loadDraft();
