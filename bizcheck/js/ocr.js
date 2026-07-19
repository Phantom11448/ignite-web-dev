// ocr.js
// -----------------------------------------------------------------------
// Best-effort receipt OCR using Tesseract.js — runs entirely in the
// browser (same reasoning as the Cloudinary swap: no backend, no API
// key, no billing account to fight with). Used to guess an expense's
// dollar amount straight off a photographed receipt, so crew can snap a
// photo and be mostly done instead of retyping a number they just
// photographed.
//
// This is a GUESS, not a guarantee. Receipt print quality, camera angle,
// and lighting vary a lot, and OCR will misread things sometimes. The
// amount field in the UI stays editable specifically so a bad guess is a
// quick correction, not a blocker — never trust this output blindly.
//
// First call on a page load downloads Tesseract's language data (a few
// MB, cached by the browser after that), so the very first OCR run is
// slower than the rest.
// -----------------------------------------------------------------------

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import(
      "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js"
    ).then(({ createWorker }) => createWorker("eng"));
  }
  return workerPromise;
}

/**
 * Runs OCR on a receipt photo and returns its best guess at the total
 * dollar amount as a number, or null if nothing dollar-shaped was found.
 */
export async function extractTotalFromReceipt(file) {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(file);
  return guessTotalFromText(text);
}

// --- internal helpers -----------------------------------------------------

const AMOUNT_PATTERN = /\$?\s*(\d{1,4}[.,]\d{2})/g;

/**
 * Scores each line of the OCR'd text for how likely it is to be the
 * receipt's total, then returns the dollar amount from the best-scoring
 * line. Falls back to the largest dollar figure anywhere in the text if
 * no line looks like a total — on most receipts the total is the
 * largest number (bigger than any single line item, subtotal, or tax).
 */
function guessTotalFromText(text) {
  const lines = text.split("\n");
  let best = null; // { amount, score }

  for (const line of lines) {
    const lower = line.toLowerCase();
    let score = 0;
    if (/\btotal\b/.test(lower) && !/sub[\s-]*total/.test(lower)) {
      score = 100; // "Total", "Grand Total" — but not "Subtotal"
    } else if (/(amount|balance)\s+due/.test(lower)) {
      score = 90;
    } else if (/\btotal\b/.test(lower)) {
      score = 50; // "Subtotal" — a fallback signal, not the real total
    }

    for (const match of line.matchAll(AMOUNT_PATTERN)) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (Number.isNaN(amount)) continue;
      if (!best || score > best.score || (score === best.score && amount > best.amount)) {
        best = { amount, score };
      }
    }
  }

  if (best && best.score > 0) return best.amount;

  const allAmounts = [...text.matchAll(AMOUNT_PATTERN)]
    .map((match) => parseFloat(match[1].replace(",", ".")))
    .filter((n) => !Number.isNaN(n));

  return allAmounts.length > 0 ? Math.max(...allAmounts) : null;
}
