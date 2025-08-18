import { Injectable, signal } from '@angular/core';
import { FileData, PreprocessingOptions, AnalysisOptions } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class DataFlowService {
  fileData = signal<FileData | null>(null);
  preprocessingOptions = signal<PreprocessingOptions | null>(null);
  analysisOptions = signal<AnalysisOptions | null>(null);
  analysisId = signal<string | null>(null);

  setFileData(data: FileData | null) {
    this.fileData.set(data);
  }

  setPreprocessingOptions(options: PreprocessingOptions | any) {
    this.preprocessingOptions.set(options);
  }

  setAnalysisOptions(options: AnalysisOptions) {
    this.analysisOptions.set(options);
  }

  setAnalysisId(id: string | null) {
    this.analysisId.set(id);
  }

  resetData() {
    this.fileData.set(null);
    this.preprocessingOptions.set(null);
    this.analysisOptions.set(null);
    this.analysisId.set(null);
  }

  isStepCompleted(step: string): boolean {
    switch (step) {
      case 'upload':
        return this.fileData() !== null;
      case 'preprocessing':
        return this.preprocessingOptions() !== null;
      case 'analysis':
        return this.analysisOptions() !== null;
      default:
        return false;
    }
  }
}