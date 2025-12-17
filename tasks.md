Dynamic Form Builder (No Backend)

What it is
A form-builder UI where users:
- Add fields (text, email, select, checkbox)
- Configure validation rules
- Preview the form
- Export form schema as JSON

Features
- Drag & drop fields
- Nested form groups
- Conditional fields (show/hide)
- Live validation preview

Angular Skills Shown
- Reactive Forms (advanced)
- FormArray / FormGroup recursion
- Dynamic component rendering
- Custom validators
- State-driven UI


---

## Milestone 0 — Architecture

### Task 0.1 — Create Angular app skeleton

**Prompt**

> Initialize Angular app `codex-forms` with strict mode enabled. Tailwind for styling and set up routing. Use standalone APIs. Create base layout (navbar + content). Add a “Builder” and “Preview” route.

**Acceptance**

* `/#/builder` and `/#/preview` routes work
* App builds successfully
* Navbar links switch routes

**Suggested files**

* `src/app/app.routes.ts`
* `src/app/layout/*`

---

### Task 0.2 — Define the form schema model (the “contract”)

**Prompt**

> Create a typed schema model for a form builder. Include:
>
> * FormSchema: id, name, version, root: FieldGroup
> * FieldGroup: id, type='group', label, children: FieldNode[]
> * FieldNode union: FieldGroup | FieldControl
> * FieldControl: id, type (text/email/number/textarea/select/checkbox/radio/date), key, label, placeholder, defaultValue, required, validators (min/max/minLength/maxLength/pattern), options for select/radio, visibility rules (simple conditions).
>   Add helpers for ID generation and deep clone.

**Acceptance**

* Types compile
* Example schema can be created in code without errors

**Files**

* `src/app/core/schema/form-schema.model.ts`
* `src/app/core/schema/schema.utils.ts`

---

### Task 0.3 — Create the in-app store for schema state

**Prompt**

> Implement `FormSchemaStore` service using RxJS:
>
> * state: currentSchema, selectedNodeId
> * selectors: schema$, selectedNode$, selectedNodeId$
> * commands: loadDefaultSchema(), selectNode(id), updateNode(nodePatch), addNode(parentGroupId, node), removeNode(id), moveNode(dragId, targetGroupId, index)
>   Use immutable updates.

**Acceptance**

* Selecting and updating nodes works via unit tests
* No direct mutation of existing schema objects

**Files**

* `src/app/core/store/form-schema.store.ts`
* `src/app/core/store/form-schema.store.spec.ts`

---

## Milestone 1 — Builder UI (Field palette + tree + properties panel)

### Task 1.1 — Builder page layout (3 panels)

**Prompt**

> Build the Builder page with 3 columns:
>
> 1. Field Palette (left)
> 2. Form Tree (center)
> 3. Properties Inspector (right)
>    Make it responsive (stack on small screens).

**Acceptance**

* Layout renders and is usable on small screens
* Each panel is a standalone component

**Files**

* `src/app/features/builder/builder.page.ts`
* `src/app/features/builder/components/*`

---

### Task 1.2 — Field palette (create nodes)

**Prompt**

> Implement Field Palette with buttons to add:
>
> * group
> * text, email, number, textarea
> * select, checkbox, radio, date
>   Clicking adds a node into the currently selected group (default root group). If selected is a control, add to its parent group.
>   Provide sensible defaults for each type.

**Acceptance**

* Adds fields and they appear in the Tree
* Always adds to a group; never crashes when nothing selected

---

### Task 1.3 — Form tree with selection + expand/collapse

**Prompt**

> Implement Form Tree viewer:
>
> * Shows groups and controls hierarchically
> * Click selects a node and highlights it
> * Group nodes can expand/collapse
> * Add “delete” icon per node (with confirm modal)
>   Keep rendering efficient (trackBy).

**Acceptance**

* Selection updates inspector
* Delete works (cannot delete root group)
* Tree stays stable without re-render flicker

---

### Task 1.4 — Properties inspector (edit selected node)

**Prompt**

> Build Properties Inspector:
>
> * If group selected: edit label
> * If control selected: edit label, key, placeholder, defaultValue, required, type-specific fields (options for select/radio)
> * Validation editor: min/max/minLength/maxLength/pattern
>   Use reactive form in the inspector and patch values when selection changes.

**Acceptance**

* Editing updates schema state immediately (or on Save button if you prefer)
* Key must be unique among all controls (show error)
* Pattern validator checks valid regex string (show error)

**Tests**

* Unique key validator unit test
* Regex validator unit test

---

## Milestone 2 — Drag & Drop + Nested Groups

### Task 2.1 — Drag & drop in the tree

**Prompt**

> Add drag & drop to reorder controls inside a group and move controls between groups. Use Angular CDK DragDrop. Update store method `moveNode`.
> Disallow dropping a group into its own descendant.

**Acceptance**

* Reorder within group works
* Move between groups works
* Invalid moves are prevented and show a toast

---

### Task 2.2 — Nested groups creation & editing

**Prompt**

> Ensure groups can be nested and can contain other groups and controls. Update palette and tree to handle nested structure well. Add “Add Group” in palette and allow selecting groups.

**Acceptance**

* Deep nesting works (3+ levels)
* Inspector edits group label correctly

---

## Milestone 3 — Preview mode (schema → Reactive Form)

### Task 3.1 — Convert schema to Angular FormGroup

**Prompt**

> Implement a `FormRuntimeService` that converts FormSchema into Angular Reactive Form structures:
>
> * Recursively create FormGroup for groups
> * FormControl for controls
> * Apply validators based on schema
>   Return `form: FormGroup` and a flat map of `key -> FieldControl`
>   Include unit tests.

**Acceptance**

* Generated FormGroup matches schema keys
* Validators apply correctly (required, minLength, pattern, etc.)

**Files**

* `src/app/core/runtime/form-runtime.service.ts`
* `src/app/core/runtime/form-runtime.service.spec.ts`

---

### Task 3.2 — Preview page renders form dynamically

**Prompt**

> Create Preview page:
>
> * Reads schema from store
> * Uses FormRuntimeService to build reactive form
> * Renders fields dynamically (component per type)
> * Shows validation messages under each field
> * Has “Submit” button that prints JSON result to a panel (not console)

**Acceptance**

* Form renders from schema
* Live validation works
* Submitted value shown as formatted JSON

---

## Milestone 4 - Conditional visibility rules

### Task 4.1 - Add simple show/hide logic

**Prompt**

> Add visibility rules to FieldControl:
>
> * VisibleByDefault boolean
> * Rules: array of conditions { dependsOnKey, operator (equals/notEquals/contains/isChecked), value }
>   In Preview, recompute visibility reactively using form.valueChanges.
>   Hidden controls should be disabled and excluded from output.

**Acceptance**

* Toggling a controlling field shows/hides dependent fields
* Hidden fields are disabled and not in submission output

---

### Task 4.2 - Builder UI for visibility rules

**Prompt**

> Extend the Properties Inspector (for controls) to edit visibility:
>
> * `visibleByDefault` toggle
> * Visibility mode: `all` / `any`
> * Conditions editor: `{ dependsOnKey, operator (equals/notEquals/contains/isChecked), value }`
>   - dependsOnKey should be selectable from existing control keys
>   - operator/value should be editable
>
> Preview must react to these rules without reload.

**Acceptance**

* Visibility rules can be configured from Builder UI
* Preview updates show/hide reactively

---

## Milestone 5 — Import/Export + Local persistence

### Task 5.1 — Export schema as JSON (download)

**Prompt**

> Add “Export JSON” in Builder:
>
> * downloads current schema as `codex-form.json`
>   Add “Copy to clipboard” option.

**Acceptance**

* Download works
* JSON is valid and includes version

---

### Task 5.2 — Import schema from JSON (upload)

**Prompt**

> Add “Import JSON”:
>
> * file picker reads JSON
> * validates shape + version
> * loads schema into store
>   Show error toast on invalid file.

**Acceptance**

* Import replaces current schema
* Invalid file handled gracefully

---

### Task 5.3 — Autosave to localStorage

**Prompt**

> Implement autosave:
>
> * debounce schema changes (e.g. 500ms)
> * save to localStorage under key `codexForms.schema`
> * on app start, restore if available
>   Add “Reset to default” button.

**Acceptance**

* Refresh keeps schema
* Reset clears localStorage and loads default

---

## Milestone 6 — Polish (what makes it portfolio-grade)

### Task 6.1 — Accessibility + UX polish

**Prompt**

> Improve accessibility:
>
> * labels wired to inputs
> * keyboard navigation in tree
>   Add toasts for actions (add/delete/move/import/export).
>   Add a small “Unsaved changes” indicator (even though it autosaves, show activity).

**Acceptance**

* Basic keyboard support
* Consistent toasts

---

### Task 6.2 — README + screenshots checklist

**Prompt**

> Write a portfolio-ready README:
>
> * What it is
> * Features list
> * Tech choices
> * How to run
> * Architecture notes (schema, store, runtime)
>   Add placeholder screenshot section and a short GIF capture guide.

**Acceptance**

* README looks professional and complete

---
