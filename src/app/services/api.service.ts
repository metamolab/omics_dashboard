import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AnalysisRequest, AnalysisResult, PreprocessingOptions } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:3000/api'; // Modifica con il tuo endpoint

  constructor(private http: HttpClient) {}

  preprocessFile(file: File, options: PreprocessingOptions): Observable<Blob> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('options', JSON.stringify(options));

    return this.http.post(`${this.baseUrl}/preprocess`, formData, {
      responseType: 'blob'
    });
  }

  submitAnalysis(request: AnalysisRequest): Observable<AnalysisResult> {
    const formData = new FormData();
    formData.append('analysisOptions', JSON.stringify(request.analysisOptions));

    return this.http.post<AnalysisResult>(`${this.baseUrl}/analyze`, formData);
  }

  getAnalysisStatus(analysisId: string): Observable<string> {
    return this.http.get(`${this.baseUrl}/status/${analysisId}`, { responseType: 'text' });
  }

  getAnalysisResults(analysisId: string): Observable<AnalysisResult> {
    return this.http.get<AnalysisResult>(`${this.baseUrl}/results/${analysisId}`);
  }
}
