# Codex Forms

An Angular app for building dynamic forms in the browser:

- Builder: field palette, nested tree, properties inspector (validation + visibility rules)
- Preview: runtime-rendered Reactive Form with live validation and JSON submission output

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm start
   ```

3. Build for production:

   ```bash
   npm run build
   ```

## Architecture notes

- Schema model: `src/app/models/form-schema.model.ts`
- State store (schema + selection): `src/app/services/form-schema.store.ts`
- Runtime builder (schema → `FormGroup`): `src/app/services/form-runtime.service.ts`
- Builder page: `src/app/pages/builder/builder.component.ts`
- Preview page: `src/app/pages/preview/preview.component.ts`

## Screenshots

- Builder (3-panel layout)
- Preview (rendered form + JSON output)
