import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AnalysisRequest, AnalysisResult, PreprocessingOptions } from '../models/interfaces';
import { SessionService } from './session.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:8000'; // FastAPI server URL
  
  // Authentication state
  private username: string | null = null;
  private accessToken: string | null = null;

  constructor(
    private http: HttpClient,
    private sessionService: SessionService
  ) {}

  // File upload preprocessing - DISABLED
  // Preprocess files (allows files from repository, blocks direct uploads)
  preprocessFile(file: File, options: PreprocessingOptions): Observable<Blob> {
    // For now, allow all preprocessing since we've disabled direct upload in the UI
    // The file upload component already prevents direct uploads
    // This method is only called for files selected from the repository
    
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('options', JSON.stringify(options));
    formData.append('userId', this.sessionService.getUserId());
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
          // console.warn('Failed to parse customSubsetSizes:', customSizes, error);
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

  // Get available files from repository (my_files directory)
  getSessionFiles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/session-files`);
  }

  // Get specific file from repository or sessions (returns blob for download)
  getSessionFile(sessionId: string, filename: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/session-files/${sessionId}/${filename}`, {
      responseType: 'blob'
    });
  }

  // Authentication API - Login to Cineca
  login(username: string, password: string, otp: string = '000000'): Observable<any> {
    const loginUrl = 'https://omics.test.cineca.it/api/v1/iam/login';
    const loginData = {
      username: username,
      password: password,
      otp: otp
    };

    return this.http.post(loginUrl, loginData, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    }).pipe(
      tap((response: any) => {
        // Save authentication data from successful login
        if (response && response.access_token) {
          this.username = username;
          this.accessToken = response.access_token;
          
          // Update session service with the authenticated username as userId
          this.sessionService.updateUserId(username);
          
          console.log('Authentication data saved:', { 
            username: this.username, 
            hasToken: !!this.accessToken,
            sessionUserId: this.sessionService.getUserId()
          });
        }
      })
    );
  }

  // Authentication API - Get status from Cineca
  getStatus(): Observable<any> {
    const statusUrl = 'https://omics.test.cineca.it/api/v1/iam/status';
    
    const headers: any = {
      'Accept': 'application/json'
    };
    
    // Add Authorization header if we have an access token
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    return this.http.post(statusUrl, '', {
      headers: headers
    });
  }

  // Authentication API - Get users from Cineca
  getUsers(): Observable<any> {
    const usersUrl = 'https://omics.test.cineca.it/api/v1/iam/users/';
    
    const headers: any = {
      'Accept': 'application/json'
    };
    
    // Add Authorization header if we have an access token
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    return this.http.get(usersUrl, {
      headers: headers
    });
  }

  // Graph API - Get uploaded files from Cineca
  getUploadedFiles(): Observable<any> {
    const uploadedFilesUrl = 'https://omics.test.cineca.it/api/v1/graph/files/uploaded';
    
    const headers: any = {
      'Accept': 'application/json'
    };
    
    // Add Authorization header if we have an access token
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    return this.http.get(uploadedFilesUrl, {
      headers: headers
    });
  }

  // Authentication getters
  getUsername(): string | null {
    return this.username;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!(this.username && this.accessToken);
  }

  // Clear authentication data
  logout(): void {
    this.username = null;
    this.accessToken = null;
    console.log('Authentication data cleared');
  }
}
