import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { FieldControl } from '../../../models/form-schema.model';

@Component({
  selector: 'app-field-renderer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="space-y-1">
      <label class="block text-sm font-semibold text-slate-900">
        {{ field.label }}
        @if (field.required) {
          <span class="text-rose-600">*</span>
        }
      </label>

      @switch (field.type) {
        @case ('textarea') {
          <textarea
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [attr.placeholder]="field.placeholder ?? ''"
            [formControl]="control"
            rows="4"
          ></textarea>
        }
        @case ('select') {
          <select
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [formControl]="control"
          >
            <option value="" disabled>Select…</option>
            @for (opt of field.options ?? []; track opt.label + '-' + opt.value) {
              <option [value]="opt.value">{{ opt.label }}</option>
            }
          </select>
        }
        @case ('checkbox') {
          <label class="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" [formControl]="control" />
            <span>{{ field.label }}</span>
          </label>
        }
        @case ('radio') {
          <div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            @for (opt of field.options ?? []; track opt.label + '-' + opt.value) {
              <label class="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  class="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  [value]="opt.value"
                  [checked]="control.value === opt.value"
                  (change)="control.setValue(opt.value)"
                />
                <span>{{ opt.label }}</span>
              </label>
            }
          </div>
        }
        @default {
          <input
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [attr.type]="inputType()"
            [attr.placeholder]="field.placeholder ?? ''"
            [formControl]="control"
          />
        }
      }

      @if (showErrors()) {
        <div class="pt-1 text-xs text-rose-600">
          @for (msg of errorMessages(); track msg) {
            <p>{{ msg }}</p>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldRendererComponent {
  @Input({ required: true }) field!: FieldControl;
  @Input({ required: true }) control!: AbstractControl;
  @Input() submitted = false;

  protected readonly inputType = computed(() => {
    switch (this.field?.type) {
      case 'email':
        return 'email';
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  });

  protected showErrors(): boolean {
    if (!this.control) {
      return false;
    }
    return !!this.control.errors && (this.control.touched || this.submitted);
  }

  protected errorMessages(): string[] {
    const errors = this.control?.errors;
    if (!errors) {
      return [];
    }

    const messages: string[] = [];
    if (errors['required']) {
      messages.push('This field is required.');
    }
    if (errors['requiredTrue']) {
      messages.push('Please confirm to continue.');
    }
    if (errors['email']) {
      messages.push('Enter a valid email address.');
    }
    if (errors['minlength']) {
      messages.push(`Minimum length is ${errors['minlength'].requiredLength}.`);
    }
    if (errors['maxlength']) {
      messages.push(`Maximum length is ${errors['maxlength'].requiredLength}.`);
    }
    if (errors['min']) {
      messages.push(`Minimum value is ${errors['min'].min}.`);
    }
    if (errors['max']) {
      messages.push(`Maximum value is ${errors['max'].max}.`);
    }
    if (errors['pattern']) {
      messages.push('Value does not match the expected format.');
    }

    return messages;
  }
}

