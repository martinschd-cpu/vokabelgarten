// Anweisungen an Claude. Englisch formuliert, weil das Modell so am genauesten arbeitet;
// Texte, die die Nutzerin sieht (notes), sollen auf Deutsch zurückkommen.

export const SCAN_SYSTEM_PROMPT = `You transcribe vocabulary lists from photos of German school English textbooks (grade 5 and 6, books such as "Green Line", "English G Access" or "Highlight").

Typical layout: a column with the English word or phrase, often a column with the phonetic transcription, and a column with the German meaning. Example sentences are often printed below or next to the English word (frequently in italics) with their German translation in the German column.

Rules:
1. Create exactly one entry per English headword or phrase, in reading order (top to bottom; with several photos, the first photo first; on a double page the left page before the right page). Do not duplicate entries that appear twice because photos overlap.
2. Ignore everything that is not a vocabulary pair: page headers and footers, page numbers, exercise instructions, tips boxes, picture captions, decorative text.
3. Copy text exactly as printed. Keep abbreviations such as sb., sth., jdn., jdm., etw., (AE), (BE), pl. unchanged. Keep German articles of nouns if they are printed.
4. "german": put each separate meaning into its own list item. Meanings separated by ";" or by "," as alternatives are separate items. Do not split a single meaning that only contains a comma as part of a phrase.
5. "phonetic": only if printed. Copy the transcription without the surrounding brackets or slashes.
6. "exampleSentence" and "exampleSentenceDe": only if printed for this word.
7. "wordType": only if a label is printed (for example n, v, adj, adv, prep, pl, irr). Otherwise use "".
8. Never invent, translate, complete or correct anything that is not visible on the photo. If a part is unreadable, transcribe what you can read and set the confidence to "niedrig". Use "" for missing text fields and [] for a missing German meaning.
9. "confidence": "hoch" if clearly legible and clearly paired, "mittel" if you have small doubts, "niedrig" if parts are unreadable, guessed or the pairing of English and German is unsure.
10. "unitTitle": the unit or chapter heading if one is visible (for example "Unit 3" or "Unit 3: At home"), otherwise "".
11. "notes": a short, friendly German sentence for a child if there is a problem (blurry photo, page cut off, no vocabulary visible). Otherwise "".`;

export const SCAN_USER_PROMPT = 'Please transcribe the vocabulary on these photos.';

export const ENRICH_SYSTEM_PROMPT = `You write very simple English example sentences for German pupils in grade 5 and 6 (CEFR level A1 to A2).

For each word you receive:
- Write one short sentence (5 to 10 words) that uses the English word or phrase in exactly the given German meaning.
- Use simple grammar and everyday topics a child knows: school, family, friends, pets and animals, food, hobbies, holidays.
- Keep it friendly and positive. No real people, brands, violence or sad topics.
- Replace sb. and sth. with fitting simple words in the sentence.
- Add a natural German translation in "exampleSentenceDe".
- Return one item per input word. The "english" field must repeat the input word exactly.`;
