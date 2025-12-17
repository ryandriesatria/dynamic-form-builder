import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormRuntimeService } from '../../services/form-runtime.service';
import { FormSchemaStore } from '../../services/form-schema.store';
import { GroupRendererComponent } from './renderer/group-renderer.component';
import { RouterModule } from '@angular/router';
import { filter, startWith, switchMap } from 'rxjs/operators';
import { FieldControl, FieldGroup, FormSchema, VisibilityCondition, VisibilityOperator } from '../../models/form-schema.model';
import { of } from 'rxjs';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, GroupRendererComponent, RouterModule],
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewComponent implements OnInit {
  private readonly store = inject(FormSchemaStore);
  private readonly runtime = inject(FormRuntimeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly schema = toSignal(this.store.schema$, { initialValue: null });
  protected readonly submittedJson = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly visibleControlKeys = signal<Set<string>>(new Set<string>());
  protected readonly visibleGroupIds = signal<Set<string>>(new Set<string>());

  protected readonly runtimeResult = computed(() => {
    const schema = this.schema();
    if (!schema) {
      return null;
    }
    return this.runtime.build(schema);
  });

  ngOnInit(): void {
    if (!this.store.snapshot.currentSchema) {
      this.store.loadDefaultSchema();
    }

    this.store.schema$
      .pipe(
        filter((schema): schema is FormSchema => !!schema),
        switchMap((schema) => {
          const runtime = this.runtime.build(schema);
          return runtime.form.valueChanges.pipe(
            startWith(runtime.form.value),
            switchMap(() => of({ schema, runtime }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ schema, runtime }) => {
        const visibility = this.computeVisibility(schema.root, runtime.form.value);
        this.visibleControlKeys.set(visibility.visibleControlKeys);
        this.visibleGroupIds.set(visibility.visibleGroupIds);
        this.applyVisibilityToForm(schema.root, runtime.form, visibility.visibleControlKeys);
      });

    this.store.schema$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.submitted.set(false);
      this.submittedJson.set(null);
    });
  }

  protected submit(): void {
    const result = this.runtimeResult();
    if (!result) {
      return;
    }

    this.submitted.set(true);
    result.form.markAllAsTouched();

    const value = result.form.value;
    this.submittedJson.set(JSON.stringify(value, null, 2));
  }

  private computeVisibility(
    root: FieldGroup,
    formValue: unknown
  ): { visibleControlKeys: Set<string>; visibleGroupIds: Set<string> } {
    const visibleControlKeys = new Set<string>();
    const visibleGroupIds = new Set<string>([root.id]);

    const walk = (group: FieldGroup): boolean => {
      let anyVisible = false;

      for (const child of group.children) {
        if (child.type === 'group') {
          const childVisible = walk(child as FieldGroup);
          if (childVisible) {
            visibleGroupIds.add(child.id);
            anyVisible = true;
          }
          continue;
        }

        const control = child as FieldControl;
        const visible = this.isFieldVisible(control, formValue);
        if (visible) {
          visibleControlKeys.add(control.key);
          anyVisible = true;
        }
      }

      return anyVisible;
    };

    walk(root);
    return { visibleControlKeys, visibleGroupIds };
  }

  private isFieldVisible(field: FieldControl, formValue: unknown): boolean {
    const defaultVisible = field.visibleByDefault !== false;
    if (!field.visibility || !field.visibility.conditions.length) {
      return defaultVisible;
    }

    const results = field.visibility.conditions.map((condition) =>
      this.evaluateCondition(condition, formValue)
    );

    const match = field.visibility.mode === 'all' ? results.every(Boolean) : results.some(Boolean);
    return match;
  }

  private evaluateCondition(condition: VisibilityCondition, formValue: unknown): boolean {
    const actualValue = this.readFormValue(formValue, condition.fieldKey);
    const operator = condition.operator as VisibilityOperator;
    const expected = condition.value;

    switch (operator) {
      case 'equals':
        return actualValue === expected;
      case 'notEquals':
        return actualValue !== expected;
      case 'greaterThan':
        return typeof actualValue === 'number' && typeof expected === 'number' && actualValue > expected;
      case 'lessThan':
        return typeof actualValue === 'number' && typeof expected === 'number' && actualValue < expected;
      case 'includes':
      case 'contains':
        if (typeof actualValue === 'string') {
          return actualValue.includes(String(expected));
        }
        if (Array.isArray(actualValue)) {
          return actualValue.includes(expected as never);
        }
        return false;
      case 'isChecked':
        return actualValue === true;
      default:
        return false;
    }
  }

  private readFormValue(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }

    for (const childValue of Object.values(record)) {
      if (childValue && typeof childValue === 'object') {
        const found = this.readFormValue(childValue, key);
        if (found !== undefined) {
          return found;
        }
      }
    }

    return undefined;
  }

  private applyVisibilityToForm(group: FieldGroup, formGroup: { get: (path: any) => any }, visibleKeys: Set<string>): void {
    for (const child of group.children) {
      if (child.type === 'group') {
        const nested = formGroup.get(child.id);
        if (nested) {
          this.applyVisibilityToForm(child as FieldGroup, nested, visibleKeys);
        }
        continue;
      }

      const field = child as FieldControl;
      const control = formGroup.get(field.key);
      if (!control) {
        continue;
      }

      const shouldBeEnabled = visibleKeys.has(field.key);
      if (shouldBeEnabled && control.disabled) {
        control.enable({ emitEvent: false });
      } else if (!shouldBeEnabled && control.enabled) {
        control.disable({ emitEvent: false });
      }
    }
  }
}
