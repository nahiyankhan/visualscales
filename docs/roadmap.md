# Roadmap

Launch the bundled fictional collection as a proof of concept for visual token
exploration. Then support local JSON input, portable exports, and sharing.
These milestones describe planned work; none of the input or sharing workflows
exist yet. There are no delivery dates.

## 1. Bring your own JSON

Add **Paste JSON** and **Open file** controls. Process data in the browser without
a server request or durable saving by default. Keep a way to clear the imported
collection and return to the sample.

Before implementation, document a supported subset of DTCG `$type`/`$value` and
Style Dictionary `type`/`value`. JSON syntax alone does not define token semantics.
Start with supported sRGB colors, whole-token aliases, and explicit dimensions.
Add `rem` only with a visible root-size assumption. Report unsupported composites,
relative lengths, and expressions rather than guessing their values or purpose.

Acceptance criteria:

- The bundled fixtures and imported collections feed the same color and space
  views. Do not add a separate generic catalog.
- Show token paths and reasons for malformed input, unsupported values, missing
  references, cycles, and identity collisions. Distinguish partial success from
  a fully supported collection.
- Preserve authored paths, alias identities, and immediate references. Equal
  values do not create relationships; ambiguous tokens do not gain invented roles.
- Set file-size and token-count limits. Cover empty, single-token, color-only,
  dimension-only, disconnected, deep-alias, and large collections in tests.
- Handle long labels, duplicate values, collection replacement, and dimensions
  beyond the sample's camera range. Reset stale selection and renderer state.
- Carry the active collection between the separate HTML pages. Identify it in
  the UI; do not imply the decorative entrance depicts an imported collection.
- Preserve keyboard access, reduced motion, searchable fallback content, and
  the existing fixture experience.

Suggested first tracking issue: **Explore user-provided JSON in Color and Space**.
Split validation, view adapters, and the input/session UI into reviewable tasks
with shared sample cases.

## 2. Export and reopen

Save a versioned file containing supported token data and meaningful view state.
Let users inspect what the export contains and reopen it locally.

Acceptance criteria:

- Round-trip token identity, verified aliases, unit context, selected token, and
  exploration mode without changing values.
- Validate reopened snapshots; explain unsupported versions and corrupt data.
- Exclude device-local metadata and unrelated files. Explain whether the snapshot
  contains supported normalized data or the original input; do not silently imply both.
- Saving is explicit. If device-local persistence is added, provide clear/delete
  controls and document what remains after the tab closes.

## 3. Share an exploration

Start with exported files. For small collections, evaluate compressed data in a
URL fragment with a tested size cap and an export fallback.

Acceptance criteria:

- The recipient can open the included collection and restore its meaningful view
  state, not just a token ID from the bundled sample.
- Preview the shared content and warn that anyone receiving the file or URL receives
  the included data. A fragment is not encryption or access control.
- Fail gracefully when data exceeds link limits. Do not silently drop tokens.
- Consider hosted snapshots only if real usage requires larger links. Specify
  retention, deletion, access expectations, abuse controls, and operating cost first.

The current `?token=` query parameter only selects a token in the bundled color
collection. It does not carry a dataset or represent the planned sharing feature.

## README and issues

Keep the three outcomes in the README. Create an implementation issue when its
scope, test cases, and acceptance criteria are ready and someone can review the
work. Use this document to draft those issues; it is not a second competing backlog.
No GitHub issues have been created as part of the local cleanup.

CLI generation, npm packages, YAML/CSS import, plugins, token editing, accounts,
and collaboration are outside this roadmap.
