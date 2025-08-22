import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AnalysisRequest, AnalysisResult, PreprocessingOptions } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:8000'; // FastAPI server URL

  constructor(private http: HttpClient) {}

  preprocessFile(file: File, options: PreprocessingOptions): Observable<Blob> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('options', JSON.stringify(options));
    formData.append('userId', 'MasterTest');
    formData.append('sessionId', options.sessionId || crypto.randomUUID());

    return this.http.post(`${this.baseUrl}/preprocess`, formData, {
      responseType: 'blob'
    });
  }

  submitAnalysis(request: AnalysisRequest): Observable<AnalysisResult> {
    const formData = new FormData();
    
    // Transform the analysis options to ensure customSubsetSizes is properly formatted for the API
    const transformedAnalysisOptions = this.transformAnalysisOptionsForAPI(request.analysisOptions);
    
    // Handle file - either direct file or remote file reference
    if (request.file) {
      // Direct file upload
      formData.append('file', request.file, request.file.name);
    } else if (request.fileData.isRemote && request.fileData.remotePath) {
      // Remote file reference
      formData.append('remotePath', request.fileData.remotePath);
      formData.append('fileName', request.fileData.fileName);
    } else {
      throw new Error('No file or remote path provided');
    }
    
    formData.append('sessionId', request.sessionId);
    formData.append('userId', request.userId);
    formData.append('preprocessingOptions', JSON.stringify(request.preprocessingOptions));
    formData.append('analysisOptions', JSON.stringify(transformedAnalysisOptions));

    return this.http.post<AnalysisResult>(`${this.baseUrl}/analyze`, formData);
  }

  private transformAnalysisOptionsForAPI(options: any): any {
    const transformed = { ...options };
    
    // Transform RFE customSubsetSizes from string to number array
    // UI stores this as comma-separated string (e.g., "5,10,15,20")
    // API expects array of numbers (e.g., [5, 10, 15, 20])
    if (transformed.multivariateAnalysis?.rfe?.customSubsetSizes && 
        typeof transformed.multivariateAnalysis.rfe.customSubsetSizes === 'string') {
      const customSizes = transformed.multivariateAnalysis.rfe.customSubsetSizes.trim();
      if (customSizes) {
        try {
          // Convert comma-separated string to array of numbers
          transformed.multivariateAnalysis.rfe.customSubsetSizes = customSizes
            .split(',')
            .map((size: string) => parseInt(size.trim(), 10))
            .filter((size: number) => !isNaN(size) && size > 0);
        } catch (error) {
          console.warn('Failed to parse customSubsetSizes:', customSizes, error);
          // Keep as empty array if parsing fails
          transformed.multivariateAnalysis.rfe.customSubsetSizes = [];
        }
      } else {
        transformed.multivariateAnalysis.rfe.customSubsetSizes = [];
      }
    }
    
    return transformed;
  }

  getAnalysisStatus(analysisId: string): Observable<AnalysisResult> {
    return this.http.get<AnalysisResult>(`${this.baseUrl}/status/${analysisId}`);
  }

  getAnalysisResults(analysisId: string): Observable<AnalysisResult> {
    return this.http.get<AnalysisResult>(`${this.baseUrl}/results/${analysisId}`);
  }

  // Get list of previous analyses from local folders
  getPreviousAnalyses(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/analyses`);
  }

  // Test connectivity to FastAPI backend
  testConnection(): Observable<any> {
    return this.http.get(`${this.baseUrl}/test`);
  }

  // Test R integration
  testRIntegration(): Observable<any> {
    return this.http.get(`${this.baseUrl}/test_r`);
  }

  // Get available preprocessing options from user sessions
  getPreprocessingOptions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/preprocessing-options`);
  }

  // Get specific preprocessing options by ID (sessionId)
  getPreprocessingOptionById(sessionId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/preprocessing-options/${sessionId}`);
  }

  // Get available files from user sessions
  getSessionFiles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/session-files`);
  }

  // Get specific file from session (returns blob for download)
  getSessionFile(sessionId: string, filename: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/session-files/${sessionId}/${filename}`, {
      responseType: 'blob'
    });
  }
}
