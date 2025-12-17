import { Injectable } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { FieldControl, FieldGroup, FieldNode, FormSchema } from '../models/form-schema.model';

export type RuntimeBuildResult = {
  form: FormGroup;
  controlsByKey: Map<string, FieldControl>;
};

@Injectable({ providedIn: 'root' })
export class FormRuntimeService {
  build(schema: FormSchema): RuntimeBuildResult {
    const controlsByKey = new Map<string, FieldControl>();
    const form = this.buildGroup(schema.root, controlsByKey);
    return { form, controlsByKey };
  }

  private buildGroup(group: FieldGroup, controlsByKey: Map<string, FieldControl>): FormGroup {
    const controls: Record<string, AbstractControl> = {};

    for (const child of group.children) {
      if (child.type === 'group') {
        controls[child.id] = this.buildGroup(child, controlsByKey);
      } else {
        const field = child as FieldControl;
        controls[field.key] = this.buildControl(field);
        controlsByKey.set(field.key, field);
      }
    }

    return new FormGroup(controls);
  }

  private buildControl(field: FieldControl): FormControl {
    const validators = this.buildValidators(field);
    const value = field.defaultValue ?? (field.type === 'checkbox' ? false : null);
    return new FormControl(value, { validators, nonNullable: false });
  }

  private buildValidators(field: FieldControl): ValidatorFn[] {
    const validators: ValidatorFn[] = [];

    if (field.required) {
      validators.push(field.type === 'checkbox' ? Validators.requiredTrue : Validators.required);
    }

    if (field.type === 'email') {
      validators.push(Validators.email);
    }

    const rules = field.validators;
    if (!rules) {
      return validators;
    }

    if (typeof rules.min === 'number') {
      validators.push(Validators.min(rules.min));
    }
    if (typeof rules.max === 'number') {
      validators.push(Validators.max(rules.max));
    }
    if (typeof rules.minLength === 'number') {
      validators.push(Validators.minLength(rules.minLength));
    }
    if (typeof rules.maxLength === 'number') {
      validators.push(Validators.maxLength(rules.maxLength));
    }
    if (typeof rules.pattern === 'string' && rules.pattern.trim()) {
      validators.push(Validators.pattern(rules.pattern));
    }

    return validators;
  }
}

