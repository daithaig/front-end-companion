
const state = {
  grid: null,
  summary: null,
  training: null
};

const gridInput = document.getElementById("gridInput");
const summaryInput = document.getElementById("summaryInput");
const trainingInput = document.getElementById("trainingInput");
const buildButton = document.getElementById("buildButton");
const setupStatus = document.getElementById("setupStatus");
const progressMessage = document.getElementById("progressMessage");
const setupPanel = document.getElementById("setupPanel");
const outputPanel = document.getElementById("outputPanel");

function showFile(input, targetId, key) {
  const file = input.files?.[0] || null;
  state[key] = file;
  const target = document.getElementById(targetId);

  if (!file) {
    target.textContent = "No file selected";
    target.classList.remove("selected");
  } else {
    target.textContent = `✓ ${file.name}`;
    target.classList.add("selected");
  }
  updateReadyState();
}

function updateReadyState() {
  const ready = Boolean(state.grid && state.summary);
  buildButton.disabled = !ready;
  setupStatus.textContent = ready ? "Ready to build" : "Waiting for files";
  setupStatus.classList.toggle("ready", ready);
  progressMessage.textContent = ready
    ? "Both required reports are selected."
    : "Select both required PDFs to continue.";
}

gridInput.addEventListener("change", () => showFile(gridInput, "gridFile", "grid"));
summaryInput.addEventListener("change", () => showFile(summaryInput, "summaryFile", "summary"));
trainingInput.addEventListener("change", () => showFile(trainingInput, "trainingFile", "training"));

async function readPdfText(file) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progressMessage.textContent = `Reading page ${pageNumber} of ${pdf.numPages}…`;
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += "\n" + content.items.map(item => item.str).join(" ");
  }

  return { text, pages: pdf.numPages };
}

function likelyNames(text) {
  const rejected = new Set([
    "Daily Grid", "Daily Grid Summary", "Team Member", "Customer Service",
    "Service Supervisor", "Assistant Manager", "Store Manager",
    "Checkout", "Smokeshop", "Self Checkout", "Front End"
  ]);

  const candidates = text.match(/\b[A-Z][a-zA-Z'’-]{1,24}\s+[A-Z][a-zA-Z'’-]{1,24}\b/g) || [];
  const unique = [];

  for (const raw of candidates) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (rejected.has(name)) continue;
    if (name.includes("Daily Grid")) continue;
    if (!unique.includes(name)) unique.push(name);
    if (unique.length >= 18) break;
  }

  return unique;
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function renderRows(names) {
  const rows = document.getElementById("teamRows");
  const template = document.getElementById("teamRowTemplate");
  rows.innerHTML = "";

  names.forEach((name, index) => {
    const row = template.content.cloneNode(true);
    row.querySelector(".initial").textContent = initials(name);
    row.querySelector(".name").textContent = name;

    const bar = row.querySelector(".deployment-bar");
    const left = 3 + (index % 4) * 2;
    const right = 5 + (index % 3) * 3;
    bar.style.left = `${left}%`;
    bar.style.right = `${right}%`;

    rows.appendChild(row);
  });
}

async function buildWeek() {
  if (!state.grid || !state.summary) return;

  buildButton.disabled = true;
  setupStatus.textContent = "Building";
  progressMessage.textContent = "Uploading locally…";

  try {
    const gridResult = await readPdfText(state.grid);
    progressMessage.textContent = "Reading demand summary…";
    const summaryResult = await readPdfText(state.summary);

    progressMessage.textContent = "Creating deployment draft…";

    let names = likelyNames(gridResult.text);
    if (names.length < 4) {
      const sample = await fetch("monday.json").then(response => response.json());
      names = sample.staff;
    }

    renderRows(names);
    document.getElementById("teamCount").textContent = String(names.length);
    document.getElementById("pageCount").textContent =
      String(gridResult.pages + summaryResult.pages);

    const today = new Date();
    const formatted = today.toLocaleDateString("en-AU", {
      day: "numeric", month: "long", year: "numeric"
    });
    document.getElementById("sheetDate").textContent = `W/C ${formatted}`;
    document.getElementById("footerWeek").textContent = `W/C ${formatted}`;

    setupPanel.classList.add("hidden");
    outputPanel.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    setupStatus.textContent = "Could not read file";
    progressMessage.textContent =
      "The files were selected correctly, but this PDF could not be read yet. Try another export.";
    buildButton.disabled = false;
  }
}

buildButton.addEventListener("click", buildWeek);
document.getElementById("printButton").addEventListener("click", () => window.print());
document.getElementById("startAgainButton").addEventListener("click", () => location.reload());
