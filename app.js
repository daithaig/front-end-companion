const $ = id => document.getElementById(id);
const state = {};

["grid", "summary"].forEach(id => {
  $(id).onchange = event => {
    state[id] = event.target.files[0];
    $("build").disabled = !(state.grid && state.summary);
  };
});

async function readFirstPdfPage(file) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  await page.render({ canvasContext: context, viewport }).promise;
  const textContent = await page.getTextContent();
  const items = textContent.items.map((item, index) => ({
    index,
    text: item.str.trim(),
    x: item.transform[4] * 2,
    y: viewport.height - item.transform[5] * 2,
    width: (item.width || 0) * 2,
    height: Math.abs(item.transform[3] || 0) * 2
  })).filter(item => item.text);

  return { pdf, viewport, context, items };
}

function findRosterRows(items) {
  const rows = [];
  for (const item of items) {
    if (!/^[A-Z][A-Za-z' .-]{4,}$/.test(item.text)) continue;
    if (/Daily|Grid|Report|FRONT|ASCOT|Required|Scheduled|Variance|Team Member|Manager|Checkout|Smokeshop|Date|Total|Leave/.test(item.text)) continue;

    const hours = items.find(other =>
      Math.abs(other.y - item.y) < 8 &&
      /^\d+\.\d{2}$/.test(other.text) &&
      other.x > item.x
    );

    if (hours) {
      rows.push({
        name: item.text.replace(/\s+[A-Z]\s+/, " "),
        y: item.y,
        x: item.x,
        paidHours: Number(hours.text)
      });
    }
  }

  return rows.filter((row, index) =>
    !rows.slice(0, index).some(previous => previous.name === row.name && Math.abs(previous.y - row.y) < 8)
  );
}

function pixelIsDark(context, x, y) {
  const rgba = context.getImageData(x | 0, y | 0, 1, 1).data;
  return (rgba[0] + rgba[1] + rgba[2]) / 3 < 205;
}

function detectShift(context, y, timelineStart, timelineEnd) {
  const runs = [];
  let active = false;
  let start = 0;

  for (let x = timelineStart; x < timelineEnd; x += 2) {
    let darkSamples = 0;
    for (let offsetY = -4; offsetY <= 4; offsetY += 2) {
      if (pixelIsDark(context, x, y + offsetY)) darkSamples++;
    }

    if (darkSamples > 1 && !active) {
      active = true;
      start = x;
    }
    if (darkSamples < 2 && active) {
      if (x - start > 20) runs.push([start, x]);
      active = false;
    }
  }

  if (active && timelineEnd - start > 20) runs.push([start, timelineEnd]);
  if (!runs.length) return null;

  return [
    Math.min(...runs.map(run => run[0])),
    Math.max(...runs.map(run => run[1]))
  ];
}

function positionPercent(x, start, end) {
  return Math.max(0, Math.min(100, ((x - start) / (end - start)) * 100));
}

function minutesToClock(totalMinutes) {
  const rounded = Math.round(totalMinutes / 15) * 15;
  const hours24 = Math.floor(rounded / 60) % 24;
  const minutes = rounded % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

function detectMealBreaks(items, row, timelineStart, timelineEnd) {
  const slotWidth = (timelineEnd - timelineStart) / 72; // 06:00–24:00 in 15-minute cells

  const markers = items
    .filter(item =>
      item.text === "X" &&
      item.y - row.y >= 18 &&
      item.y - row.y <= 32 &&
      item.x >= timelineStart &&
      item.x <= timelineEnd
    )
    .sort((a, b) => a.x - b.x);

  const groups = [];
  for (const marker of markers) {
    const current = groups[groups.length - 1];
    if (!current || marker.x - current[current.length - 1].x > slotWidth * 1.45) {
      groups.push([marker]);
    } else {
      current.push(marker);
    }
  }

  return groups
    .filter(group => group.length >= 2)
    .map(group => {
      const rawStart = group[0].x - slotWidth / 2;
      const rawEnd = group[group.length - 1].x + slotWidth / 2;
      const startMinutes = 360 + ((rawStart - timelineStart) / slotWidth) * 15;
      const endMinutes = 360 + ((rawEnd - timelineStart) / slotWidth) * 15;
      return {
        startX: rawStart,
        endX: rawEnd,
        startMinutes: Math.round(startMinutes / 15) * 15,
        endMinutes: Math.round(endMinutes / 15) * 15,
        markerCount: group.length
      };
    });
}

async function readScoDemand(file) {
  const page = await readFirstPdfPage(file);
  const text = page.items.map(item => item.text).join(" ");
  const match = text.match(/Self Checkout\s+Required\s+\d+\.\d+\s+((?:\d+\s+){50,80})/i);
  if (!match) return Array(18).fill(0);

  const quarterHours = match[1].trim().split(/\s+/).map(Number);
  const hourly = [];
  for (let hour = 0; hour < 18; hour++) {
    hourly.push(Math.max(0, ...quarterHours.slice(hour * 4, hour * 4 + 4)));
  }
  return hourly;
}

$("build").onclick = async () => {
  try {
    $("status").textContent = "Reading the reports and matching meal breaks…";

    const page = await readFirstPdfPage(state.grid);
    const roster = findRosterRows(page.items);
    const timelineStart = page.viewport.width * 0.205;
    const timelineEnd = page.viewport.width * 0.98;
    const rowsContainer = $("rows");
    rowsContainer.innerHTML = "";

    let renderedRows = 0;
    let detectedMeals = 0;

    roster.slice(0, 15).forEach(person => {
      const shift = detectShift(page.context, person.y + 12, timelineStart, timelineEnd);
      if (!shift) return;

      const meals = detectMealBreaks(page.items, person, timelineStart, timelineEnd)
        .filter(meal => meal.startX >= shift[0] - 12 && meal.endX <= shift[1] + 12);

      detectedMeals += meals.length;
      renderedRows++;

      const row = document.createElement("div");
      row.className = "row";

      const mealMarkup = meals.map(meal => {
        const label = `${minutesToClock(meal.startMinutes)}–${minutesToClock(meal.endMinutes)}`;
        return `<i class="meal" style="left:${positionPercent(meal.startX, timelineStart, timelineEnd)}%;right:${100 - positionPercent(meal.endX, timelineStart, timelineEnd)}%" title="Meal ${label}"><span>M</span></i>`;
      }).join("");

      const mealText = meals.length
        ? meals.map(meal => `${minutesToClock(meal.startMinutes)}–${minutesToClock(meal.endMinutes)}`).join(", ")
        : "";

      row.innerHTML = `
        <div class="person">
          <strong>${person.name}</strong>
          ${mealText ? `<small>Meal ${mealText}</small>` : ""}
        </div>
        <div class="timeline">
          <i class="bar" style="left:${positionPercent(shift[0], timelineStart, timelineEnd)}%;right:${100 - positionPercent(shift[1], timelineStart, timelineEnd)}%"></i>
          ${mealMarkup}
        </div>`;

      rowsContainer.appendChild(row);
    });

    const pageText = page.items.map(item => item.text).join(" ");
    const dateMatch = pageText.match(/Date:\s*(Monday,\s*\d+\s+\w+\s+\d{4})/i);
    $("date").textContent = dateMatch ? dateMatch[1] : "Monday";

    const scoDemand = await readScoDemand(state.summary);
    $("sco").innerHTML = scoDemand.map(number =>
      `<i class="dot ${number ? "on" : ""}">${number || ""}</i>`
    ).join("");

    $("stats").textContent = `${renderedRows} roster rows · ${detectedMeals} meal breaks detected · ${page.pdf.numPages} grid pages`;
    $("setup").hidden = true;
    $("result").hidden = false;
  } catch (error) {
    console.error(error);
    $("status").textContent = "Could not read the reports. Please check both PDFs and try again.";
  }
};
