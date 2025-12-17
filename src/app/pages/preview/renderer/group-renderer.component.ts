import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FieldControl, FieldGroup } from '../../../models/form-schema.model';
import { FieldRendererComponent } from './field-renderer.component';

@Component({
  selector: 'app-group-renderer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FieldRendererComponent],
  template: `
    @if (isGroupVisible(group)) {
      <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div class="space-y-1">
          <h2 class="text-base font-semibold text-slate-900">{{ group.label }}</h2>
          <p class="text-xs text-slate-500">{{ group.children.length }} item{{ group.children.length === 1 ? '' : 's' }}</p>
        </div>
      </div>

      <div class="space-y-4">
        @for (child of group.children; track child.id) {
          @if (child.type === 'group') {
            @if (isGroupVisible(child)) {
              <div class="rounded-lg border border-slate-200 bg-white p-4">
                <app-group-renderer
                  [group]="child"
                  [formGroup]="childGroupForm(child.id)"
                  [submitted]="submitted"
                  [visibleControlKeys]="visibleControlKeys"
                  [visibleGroupIds]="visibleGroupIds"
                />
              </div>
            }
          } @else {
            @if (visibleControlKeys.has(child.key)) {
              <app-field-renderer
                [field]="child"
                [control]="formGroup.controls[child.key]"
                [submitted]="submitted"
              />
            }
          }
        }
      </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GroupRendererComponent {
  @Input({ required: true }) group!: FieldGroup;
  @Input({ required: true }) formGroup!: FormGroup;
  @Input() submitted = false;
  @Input({ required: true }) visibleControlKeys!: Set<string>;
  @Input({ required: true }) visibleGroupIds!: Set<string>;

  protected childGroupForm(groupId: string): FormGroup {
    const control = this.formGroup.get(groupId) as AbstractControl | null;
    if (!control || !(control instanceof FormGroup)) {
      return new FormGroup({});
    }
    return control;
  }

  protected isGroupVisible(group: FieldGroup): boolean {
    return this.visibleGroupIds.has(group.id) || this.group.id === group.id;
  }
}
