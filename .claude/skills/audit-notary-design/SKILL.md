---
name: audit-notary-design
description: Design and change the look or the interaction of the Audit Notary web app — tokens, components, page templates, views, charts, copy — within its visual language "The Register" (sheet and margin, the seal, the daybook, the file-drawer columns). Covers the rules a change must keep, the copy rules, the accessibility checklist and the screenshot-critique loop against the scenario mock. Use before writing or restyling any part of web-app/src.
user-invocable: true
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Skill
---

# Audit Notary Design Skill

The reasoning is `doc/concepts/visual-design.adoc`; this skill is how to work with it. The structure of the app (shell,
templates, closed vocabulary, tag grammar, column engine) is that of `pm-web-app`; the look is Audit Notary's own.
Read the concept first, then the component you are about to change.

## 1. Before you design

1. Name the document and its moment: whose record is it, who fills it in, who signs it, what is at stake. The design
   follows from the subject (a workshop, a release, an incident under a deadline), never from a template.
2. Find the existing piece. `web-app/src/lib/components/` is a closed vocabulary: extend a component before adding
   one, and add one only with its test in `components.test.ts` or a test file beside it.
3. For a chart, load the `dataviz` skill first and validate any new colour with its validator against both sheet
   colours (`#ffffff`, `#161d2e`).
4. For a page in a new lens, decide which template it is (`DashboardPage`, `TriagePage`, `ObjectPage`, `WizardPage`)
   and which levels the chain has.

## 2. The rules of the register

**Surfaces**

- A document is a `Sheet` on the desk. Its record is on the left. The `margin` holds provenance: people, the signed
  history, the release. The `status` holds what must stay in reach: the save state and its act.
- No cards inside a sheet, no sheet inside a sheet. Sections are divided by space and hairlines, not by boxes.
- List columns lie on the desk; only the object column holds a sheet.

**Colour** (only through `tokens.css`; a literal anywhere else fails the build)

- Signature ink (`--color-brand`) is the one accent: the primary act, the selection, the focus ring, links.
- Seal gold (`--color-seal`) is for seals only: the released seal, the sealed state label, a release line in the
  history. It is never a status colour and never a decoration.
- Attention, danger, success and running keep one meaning each, and colour never speaks alone: every state has its
  word, every figure its text.
- The rail is dark in both themes. On the rail use `--color-rail-*` and `--focus-ring-rail`.
- The five SAMM business functions are `--color-series-1` … `-5`, always in model order.

**Type**

- Source Serif 4 (`--font-serif`) is for the record: titles at `--text-display`, section heads, question texts, figures
  of scores, the daybook's numerals.
- Inter is for everything around the record: controls, labels, meta.
- No labels in capitals, no `A · B · C` meta strings (use a `<dl>` of terms), no arrow appended to a link text.
- Monospace (`Chip`) only for what is compared or copied: tags, pseudonyms, blob ids.

**Tags** (the grammar of `pm-web-app`)

- A box (`ReasonBadge`) means "needs you".
- A dot (`StatusLabel`) means "for information".
- At most one of each per row.

**Acts**

- One primary act per screen, on the object.
- An act that cannot be taken now stays focusable and says why (`Button disabledReason`).
- Navigation that is the screen's act is a `Link look="primary"`.
- Destructive acts live behind a confirmation.

**Motion**

- Only in answer to an act, plus the one orchestrated moment: the seal pressed on a release (`--duration-seal`).
- Everything collapses to 0 ms under reduced motion.

**The mascot**

- Only on calm surfaces: an empty Due list, a finished release.
- Never in incidents, deadlines, warnings or errors.

**CSP and markup**

- No `style` attribute and no `{@html}`. Set CSS custom properties with `style:--name`.
- No raw `<button>`, `<a>`, `<input>`, `<select>` or `<textarea>` in views, templates or routes.

## 3. Copy

- Every text is a catalogue key in `messages_en.properties` **and** `messages_de.properties`
  (`web-app/src/main/resources/META-INF/audit-notary/messages/`). Write the German yourself, in the same plain register
  as the English. Never leave a literal in markup: `npm run lint` fails.
- The voice is a notary's office: plain, calm, accountable. Say what happened and what to do; no apology, no jokes.
- Buttons say exactly what happens ("Save for everyone", "Release (confirm with MFA)"), and the result repeats the
  verb ("Saved for everyone at 09:52").
- "Saved for you" (draft) and "saved for everyone" (signed commit) must never be confused.
- Never use the words *notarised* or *certified* for what the app does.
- Texts of a document type's model (SAMM answers, quality criteria) are data served with the model, not catalogue
  keys.

## 4. Accessibility checklist

Check each item before you hand a change over.

- [ ] Every new colour pair is in `tokens.test.ts` and passes 4.5:1 for text, 3:1 for graphics and field boundaries,
      in both themes.
- [ ] Every control is reachable and operable by keyboard. Arrow keys stay with radio groups; shortcut keys are an
      addition, never the only way.
- [ ] The accessible name contains the visible label (WCAG 2.5.3). A link whose visible text is an abbreviation gets
      the abbreviation out of the link, or into the start of its name.
- [ ] A change the person did not cause (a save by someone else, a new object) is announced politely; focus moves to
      a new object's heading.
- [ ] A chart has a legend for two series or more, direct labels where few, and the same figures as a table.
- [ ] Forced colours: the component still shows its state (`@media (forced-colors: active)`).
- [ ] Phone (390 px): nothing scrolls sideways, targets are 44 px, the status of a sheet stays above the record.
- [ ] German: no clipped or overlapping text with the longer words.

## 5. The screenshot-critique loop

Run the app against the scenario mock and look at every screen you touched.

```bash
web-mock/start.sh -s workshop                 # port 7420; profiles: workshop, read-only, degraded, empty,
                                              # first-login, release (states review, password, wrong-password,
                                              # changed, released); workshop also has saved-by-other, conflict
(cd web-app && npm run dev)                   # http://127.0.0.1:5173
curl -X POST http://127.0.0.1:7420/mock/scenario -d '{"scenario":"release#password"}'
```

Capture each screen at 1440, 1024 and 390 px, light and dark, English and German:

- With Claude in Chrome when it is connected.
- Otherwise with a short Playwright script from `web-e2e/node_modules` that logs in through
  `/api/v1/auth/login?return=<path>` and takes full-page screenshots. Keep the script in `.plan/temp/`.

For every screenshot ask:

1. Is the record the most important thing on the screen? Does anything compete with it?
2. Is the seal or the primary act the only bold thing? Remove one accessory.
3. Does every state have its word? Would the screen still work in greyscale?
4. Does anything read like a template default rather than like this subject (cards for everything, a gradient,
   all-caps eyebrows)?
5. Is the copy plain, and does the button say what happens?

Fix what you find and capture again. Full-page captures show the sticky rail and bottom bar cut off at the first
viewport; that is the capture, not the page.

## 6. Verify

```bash
cd web-app && npm run lint && npm run check && npx vitest run --coverage   # 80 % thresholds
cd web-e2e && npx playwright test                                           # axe on every view, both themes
./mvnw clean verify                                                         # everything, as CI runs it
```

A new view also gets:

- a row in `web-e2e/tests/theme-readability.spec.js`;
- its flows in a spec of its own;
- its data in a `web-mock` profile, with large or shared answers as `body_file` under `scenarios/data/`.
