# Front End Companion — Build 004

The first functional phone-first build.

## What works

- Separate upload cards for Daily Grid, Daily Grid Summary and Training.
- Selected filenames appear immediately with a green tick.
- Build Week stays disabled until both required PDFs are selected.
- PDFs are read locally in the browser using PDF.js.
- The app finds likely team names and builds a printable Monday deployment draft.
- Print / Save PDF is formatted for A4 landscape.
- All files stay on the device; this build does not upload reports to a server.

## Upload these six files to GitHub

- index.html
- main.css
- print.css
- app.js
- monday.json
- README.md

Upload them into the root of the repository, replacing the existing files.

## GitHub Pages

After committing the files, wait around one minute and refresh:

https://daithaig.github.io/front-end-companion/

## Build note

PDF layouts vary. Build 004 establishes the complete phone upload flow and local PDF-reading foundation. The parser and optimiser will be refined against real Daily Grid reports in later builds.
