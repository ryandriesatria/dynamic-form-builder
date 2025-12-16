import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-preview',
  standalone: true,
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewComponent { }
