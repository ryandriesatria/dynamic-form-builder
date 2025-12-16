import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-builder',
  standalone: true,
  templateUrl: './builder.component.html',
  styleUrls: ['./builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuilderComponent {
  protected readonly placeholderFields = signal([
    { label: 'Name', type: 'Text input' },
    { label: 'Email', type: 'Email input' },
    { label: 'Message', type: 'Textarea' }
  ]);
}
