import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldGroup, FormSchema } from '../models/form-schema.model';
import { FormRuntimeService } from './form-runtime.service';

describe('FormRuntimeService', () => {
  let service: FormRuntimeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule]
    });
    service = TestBed.inject(FormRuntimeService);
  });

  it('builds a nested FormGroup matching schema keys', () => {
    const schema: FormSchema = {
      id: 'form-1',
      name: 'Test',
      version: '1.0.0',
      root: {
        id: 'group-root',
        type: 'group',
        label: 'Root',
        children: [
          {
            id: 'group-a',
            type: 'group',
            label: 'Section A',
            children: [
              {
                id: 'field-1',
                type: 'text',
                key: 'firstName',
                label: 'First name',
                required: true
              }
            ]
          },
          {
            id: 'field-2',
            type: 'email',
            key: 'email',
            label: 'Email'
          }
        ]
      }
    };

    const { form, controlsByKey } = service.build(schema);

    expect(form.get('email')).toBeTruthy();
    expect(form.get(['group-a', 'firstName'])).toBeTruthy();
    expect(controlsByKey.has('email')).toBeTrue();
    expect(controlsByKey.has('firstName')).toBeTrue();
  });

  it('applies validators correctly (required, minLength, pattern)', () => {
    const schema: FormSchema = {
      id: 'form-2',
      name: 'Test',
      version: '1.0.0',
      root: {
        id: 'group-root',
        type: 'group',
        label: 'Root',
        children: [
          {
            id: 'field-username',
            type: 'text',
            key: 'username',
            label: 'Username',
            required: true,
            validators: { minLength: 3, pattern: '^[a-z]+$' }
          }
        ]
      }
    };

    const { form } = service.build(schema);
    const control = form.get('username');
    expect(control).toBeTruthy();

    control?.setValue('');
    control?.markAsTouched();
    control?.updateValueAndValidity();
    expect(control?.hasError('required')).toBeTrue();

    control?.setValue('AB');
    control?.updateValueAndValidity();
    expect(control?.hasError('minlength')).toBeTrue();
    expect(control?.hasError('pattern')).toBeTrue();

    control?.setValue('abcd');
    control?.updateValueAndValidity();
    expect(control?.valid).toBeTrue();
  });

  it('uses requiredTrue for required checkboxes', () => {
    const schema: FormSchema = {
      id: 'form-3',
      name: 'Test',
      version: '1.0.0',
      root: {
        id: 'group-root',
        type: 'group',
        label: 'Root',
        children: [
          {
            id: 'field-terms',
            type: 'checkbox',
            key: 'acceptTerms',
            label: 'Accept terms',
            required: true,
            defaultValue: false
          }
        ]
      }
    };

    const { form } = service.build(schema);
    const control = form.get('acceptTerms');
    expect(control?.value).toBeFalse();

    control?.setValue(false);
    control?.updateValueAndValidity();
    expect(control?.hasError('required')).toBeTrue();

    control?.setValue(true);
    control?.updateValueAndValidity();
    expect(control?.valid).toBeTrue();
  });

  it('supports deep nesting (3+ levels)', () => {
    const deepGroup: FieldGroup = {
      id: 'group-level-1',
      type: 'group',
      label: 'L1',
      children: [
        {
          id: 'group-level-2',
          type: 'group',
          label: 'L2',
          children: [
            {
              id: 'group-level-3',
              type: 'group',
              label: 'L3',
              children: [
                {
                  id: 'field-deep',
                  type: 'number',
                  key: 'deep.value',
                  label: 'Deep value',
                  validators: { min: 2, max: 5 }
                }
              ]
            }
          ]
        }
      ]
    };

    const schema: FormSchema = {
      id: 'form-4',
      name: 'Deep',
      version: '1.0.0',
      root: { id: 'group-root', type: 'group', label: 'Root', children: [deepGroup] }
    };

    const { form } = service.build(schema);
    const control = form.get(['group-level-1', 'group-level-2', 'group-level-3', 'deep.value']);
    expect(control).toBeTruthy();

    control?.setValue(1);
    control?.updateValueAndValidity();
    expect(control?.hasError('min')).toBeTrue();

    control?.setValue(6);
    control?.updateValueAndValidity();
    expect(control?.hasError('max')).toBeTrue();

    control?.setValue(3);
    control?.updateValueAndValidity();
    expect(control?.valid).toBeTrue();
  });
});

