import { Routes } from '@angular/router';
import { BuilderComponent } from './pages/builder/builder.component';
import { PreviewComponent } from './pages/preview/preview.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'builder',
    pathMatch: 'full'
  },
  {
    path: 'builder',
    component: BuilderComponent,
    title: 'Form Builder'
  },
  {
    path: 'preview',
    component: PreviewComponent,
    title: 'Form Preview'
  },
  {
    path: '**',
    redirectTo: 'builder'
  }
];
