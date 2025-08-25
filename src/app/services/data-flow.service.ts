import { Injectable, signal, inject } from '@angular/core';
import { FileData, PreprocessingOptions, AnalysisOptions } from '../models/interfaces';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class DataFlowService {
  private sessionService = inject(SessionService);
  
  fileData = signal<FileData | null>(null);
  preprocessingOptions = signal<PreprocessingOptions | null>(null);
  analysisOptions = signal<AnalysisOptions | null>(null);
  analysisId = signal<string | null>(null);
  isRecoveryMode = signal<boolean>(false);

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

  setRecoveryMode(isRecovery: boolean) {
    this.isRecoveryMode.set(isRecovery);
  }

  resetData() {
    // console.log('[DATA_FLOW] Resetting all data and generating new session');
    
    // Reset all data signals
    this.fileData.set(null);
    this.preprocessingOptions.set(null);
    this.analysisOptions.set(null);
    this.analysisId.set(null);
    this.isRecoveryMode.set(false);
    
    // Generate a new session ID
    const newSessionId = this.sessionService.generateNewSession();
    // console.log('[DATA_FLOW] New session generated during reset:', newSessionId);
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