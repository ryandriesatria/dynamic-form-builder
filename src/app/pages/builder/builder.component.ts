import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

type PaletteField = {
  label: string;
  description: string;
};

type PaletteSection = {
  title: string;
  fields: PaletteField[];
};

type FormTreeNode = {
  label: string;
  type: 'group' | 'field';
  meta: string;
  depth: number;
  badge?: string;
};

type InspectorSelection = {
  label: string;
  type: string;
  key: string;
  description: string;
  helperText: string;
  validations: { label: string; value: string }[];
  visibility: string[];
  actions: string[];
};

@Component({
  selector: 'app-builder',
  standalone: true,
  templateUrl: './builder.component.html',
  styleUrls: ['./builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuilderComponent {
  protected readonly paletteSections = signal<PaletteSection[]>([
    {
      title: 'Inputs',
      fields: [
        { label: 'Text input', description: 'Single line for names and titles.' },
        { label: 'Email', description: 'Validates formatting automatically.' },
        { label: 'Number', description: 'Capture counts, currency, or scores.' },
        { label: 'Date', description: 'Schedule meetings or target launch days.' }
      ]
    },
    {
      title: 'Choices',
      fields: [
        { label: 'Select', description: 'Dropdown with curated options.' },
        { label: 'Radio group', description: 'Pick one clear option.' },
        { label: 'Checkbox', description: 'Toggle opt-ins and agreements.' }
      ]
    },
    {
      title: 'Layout',
      fields: [
        { label: 'Section', description: 'Organize steps or themes.' },
        { label: 'Group', description: 'Nest related inputs together.' },
        { label: 'Hint', description: 'Add helper text or guidance.' }
      ]
    }
  ]);

  protected readonly formTree = signal<FormTreeNode[]>([
    { label: 'Contact form', type: 'group', meta: '3 sections - 6 fields', depth: 0, badge: 'Root' },
    { label: 'Hero', type: 'group', meta: 'Intro copy & CTA', depth: 1 },
    { label: 'Name', type: 'field', meta: 'Text - required', depth: 2 },
    { label: 'Email address', type: 'field', meta: 'Email - validated', depth: 2 },
    { label: 'Message', type: 'field', meta: 'Textarea - helper text', depth: 2 },
    { label: 'Preferences', type: 'group', meta: 'Optional branch', depth: 1 },
    { label: 'Contact me', type: 'field', meta: 'Checkbox toggles follow-up fields', depth: 2 },
    { label: 'Channel', type: 'field', meta: 'Select - defaults to email', depth: 2 },
    { label: 'Availability', type: 'field', meta: 'Date - weekdays only', depth: 2 }
  ]);

  protected readonly selectedField = signal<InspectorSelection>({
    label: 'Email address',
    type: 'Email',
    key: 'contact.email',
    description: 'Primary contact method for updates and receipts.',
    helperText: 'We only use this to notify you about your submission.',
    validations: [
      { label: 'Required', value: 'Yes - cannot submit without a value' },
      { label: 'Format', value: 'Must match email pattern' },
      { label: 'Domain allowlist', value: 'Optional: limit to company domains' }
    ],
    visibility: [
      'Visible when "Contact me" checkbox is selected',
      'Hidden for kiosk mode submissions'
    ],
    actions: [
      'On change -> validate MX and surface hint',
      'On submit -> send confirmation email'
    ]
  });
}
