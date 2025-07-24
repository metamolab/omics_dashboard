import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { PreprocessingComponent } from './components/preprocessing/preprocessing.component';
import { AnalysisSelectionComponent } from './components/analysis-selection/analysis-selection.component';
import { ResultsComponent } from './components/results/results.component';

export const routes: Routes = [
  {
    path: 'dashboard',
    component: DashboardComponent,
    children: [
      { path: 'upload', component: FileUploadComponent },
      { path: 'preprocessing', component: PreprocessingComponent },
      { path: 'analysis', component: AnalysisSelectionComponent },
      { path: 'results', component: ResultsComponent },
      { path: '', redirectTo: 'upload', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: '/dashboard/upload', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard/upload' }
];
