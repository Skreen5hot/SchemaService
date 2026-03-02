# BIBSS Demo — Now Available

**Subject:** New Tool: Instantly See the Structure of Your Data

---

Hi team,

We've built a tool that helps you understand the structure of your data — without installing anything or writing code. It runs entirely in your browser.

**Try it now:** https://skreen5hot.github.io/SchemaService/

---

## What It Does

You give it a data file (CSV or JSON), and it tells you:

- What columns/fields are in your data
- What the **resolved type** of each field is — when a column has mixed types (e.g., some numbers, some text), BIBSS picks the broadest type that covers all values
- Which fields are always present vs. sometimes missing
- Which fields allow empty values

It produces two outputs:

- **JSON Schema** — a standard, portable description of your data's structure that developers and other tools can use directly
- **CISM** (switch to the CISM tab) — a richer internal model that includes **type distributions**: the exact breakdown of how many values were integers, booleans, text, etc. *before* the type was resolved. This is what downstream systems like SAS use for consensus promotion.

---

## How To Use It

1. **Open the link** above in any modern browser (Chrome, Firefox, Edge, Safari)
2. **Paste your data** into the input box on the left — or click **Upload File** to load a `.csv` or `.json` file
3. Click **Infer Schema**
4. The right panel shows the inferred schema — switch between **JSON Schema** and **CISM** tabs
5. Click **Copy** to grab the result

**Start here:** Click **Load Example** and pick **Employee CSV** to see differentiated types — salary shows as `integer`, active as `boolean`, and names as `string`. This is the best way to see BIBSS in action before trying your own data.

**Keyboard shortcut:** Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) to infer without clicking the button.

---

## What You Should Know

- **Your data stays private.** Everything runs locally in your browser. No data is sent to any server.
- **It works with CSV and JSON.** The tool auto-detects the format.
- **It handles messy data.** Missing values, mixed types, optional fields — it figures out the right structure. If a column mixes integers and text, the resolved type widens to text, but the CISM preserves the exact counts (e.g., "95 integers, 3 strings, 2 nulls").
- **It's deterministic.** The same input always produces the same output. No guessing, no AI inference — just mechanical structural analysis.
- **CSV and JSON take different paths.** CSV values go through type narrowing (detecting integers, booleans, etc. from text), while JSON values keep their native types. The same data can produce different type distributions depending on the input format — this is by design.

---

## When Is This Useful?

- **Documenting datasets** — Generate a schema to describe what's in a CSV or API response
- **Validating data** — Use the JSON Schema output to check that new data matches the expected structure
- **Onboarding** — Help new team members understand what a dataset contains without reading every row
- **Data integration** — Quickly compare the structure of two datasets by inferring schemas for both

---

## Feedback

If you run into issues or have suggestions, let us know. This is v1.3 — we're actively improving it.

---

*BIBSS (Brain-in-the-Box Schema Service) v1.3*
