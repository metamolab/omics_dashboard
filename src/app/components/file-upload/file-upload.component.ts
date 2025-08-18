import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileData, FilePreview } from '../../models/interfaces';

// Define interfaces for remote files and preprocessing options
interface RemoteFile {
  id: string;
  name: string;
  size: number;
  lastModified: Date;
  path: string;
}

interface RemotePreprocessingOptions {
  id: string;
  name: string;
  description: string;
  options: any;
  createdDate: Date;
}

interface PreviousAnalysis {
  analysisId: string;
  name: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  createdDate: Date;
  completedDate?: Date;
  analysisType: string;
  datasetName: string;
  description?: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="upload-container">
      <div class="page-header">
        <h1>Selezione Origine Dati</h1>
        <p>Scegli la fonte dei tuoi dati o recupera un'analisi precedente</p>
      </div>

      <!-- Step 1: Choose Data Source -->
      @if (currentStep() === 'source-selection') {
        <div class="source-selection">
          <h2>Seleziona la Fonte dei Dati</h2>
          
          <div class="source-options">
            <!-- Option 1: Upload new file -->
            <div class="source-option" (click)="selectDataSource('upload')">
              <div class="option-icon">📤</div>
              <h3>Carica Nuovo File</h3>
              <p>Carica un file CSV, Excel o JSON dal tuo computer</p>
            </div>

            <!-- Option 2: Browse remote files -->
            <div class="source-option" (click)="selectDataSource('remote')">
              <div class="option-icon">🗂️</div>
              <h3>Seleziona File Esistente</h3>
              <p>Scegli un file già presente nel repository remoto</p>
            </div>

            <!-- Option 3: Recover previous analysis -->
            <div class="source-option" (click)="selectDataSource('recovery')">
              <div class="option-icon">🔄</div>
              <h3>Recupera Analisi Precedente</h3>
              <p>Continua o visualizza un'analisi già avviata o completata</p>
            </div>
          </div>
        </div>
      }

      <!-- Step 2a: Upload new file -->
      @if (currentStep() === 'upload') {
        <div class="upload-section">
          <div class="step-header">
            <button class="back-btn" (click)="goBack()">← Indietro</button>
            <h2>Carica il tuo File</h2>
          </div>

          <div class="upload-card">
            <div class="upload-area" 
                 [class.drag-over]="isDragOver()"
                 (dragover)="onDragOver($event)"
                 (dragleave)="onDragLeave($event)"
                 (drop)="onDrop($event)"
                 (click)="triggerFileInput()">
              
              <div class="upload-icon">📊</div>
              
              <p class="upload-text">
                Trascina qui il tuo file o 
                <span class="file-label">
                  clicca per selezionare
                    <input type="file" 
                         (change)="onFileSelected($event)"
                         accept=".csv,.xlsx,.xls,.json"
                         #fileInput
                         style="display: none;">
                </span>
                
              </p>

              <p class="file-types">Formati supportati: CSV, Excel, JSON</p>
            </div>

            @if (selectedFile()) {
              <div class="file-info">
                <div class="file-details">
                  <div class="file-text-content">
                    <span class="file-name">{{ selectedFile()!.fileName }}</span>
                    <span class="file-size">{{ formatFileSize(selectedFile()!.fileSize) }}</span>
                  </div>
                  <button class="remove-btn" (click)="removeFile()">✕</button>
                </div>
              </div>
            }

            <button class="continue-btn" 
                    [disabled]="!selectedFile()"
                    (click)="proceedToPreprocessingChoice()">
              Continua
            </button>
          </div>
        </div>
      }

      <!-- Step 2b: Browse remote files -->
      @if (currentStep() === 'remote-browse') {
        <div class="remote-section">
          <div class="step-header">
            <button class="back-btn" (click)="goBack()">← Indietro</button>
            <h2>Seleziona File Esistente</h2>
          </div>

          <div class="remote-card">
            @if (isLoadingRemoteFiles()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <p>Caricamento file remoti...</p>
              </div>
            } @else if (remoteFilesError()) {
              <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>{{ remoteFilesError() }}</p>
                <button class="retry-btn" (click)="loadRemoteFiles()">Riprova</button>
              </div>
            } @else {
              <div class="file-browser">
                <div class="browser-header">
                  <h3>File Disponibili</h3>
                  <button class="refresh-btn" (click)="loadRemoteFiles()">🔄 Aggiorna</button>
                </div>
                
                @if (remoteFiles().length === 0) {
                  <div class="empty-state">
                    <p>Nessun file trovato nel repository remoto</p>
                  </div>
                } @else {
                  <div class="file-list">
                    @for (file of remoteFiles(); track file.id) {
                      <div class="remote-file-item" 
                           [class.selected]="selectedRemoteFile()?.id === file.id"
                           (click)="selectRemoteFile(file)">
                        <div class="file-icon">📄</div>
                        <div class="file-details">
                          <span class="file-name">{{ file.name }}</span>
                          <span class="file-meta">{{ formatFileSize(file.size) }} • {{ formatDate(file.lastModified) }}</span>
                        </div>
                        @if (selectedRemoteFile()?.id === file.id) {
                          <div class="selected-indicator">✓</div>
                        }
                      </div>
                    }
                  </div>
                }

                <button class="continue-btn" 
                        [disabled]="!selectedRemoteFile()"
                        (click)="proceedToPreprocessingChoice()">
                  Continua con File Selezionato
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Step 3: Choose preprocessing approach -->
      @if (currentStep() === 'preprocessing-choice') {
        <div class="preprocessing-section">
          <div class="step-header">
            <button class="back-btn" (click)="goBack()">← Indietro</button>
            <h2>Scelta Preprocessing</h2>
          </div>

          <div class="preprocessing-card">
            <div class="selected-file-info">
              <h3>File Selezionato:</h3>
              <div class="file-summary">
                @if (selectedFile()) {
                  <span class="file-name">{{ selectedFile()!.fileName }}</span>
                  <span class="file-size">({{ formatFileSize(selectedFile()!.fileSize) }})</span>
                } @else if (selectedRemoteFile()) {
                  <span class="file-name">{{ selectedRemoteFile()!.name }}</span>
                  <span class="file-size">({{ formatFileSize(selectedRemoteFile()!.size) }})</span>
                }
              </div>
            </div>

            <div class="preprocessing-options">
              <h3>Come vuoi procedere con il preprocessing?</h3>
              
              <div class="preprocessing-choices">
                <!-- Option 1: New preprocessing -->
                <div class="preprocessing-option" (click)="selectPreprocessingChoice('new')">
                  <div class="option-icon">🔧</div>
                  <h4>Nuovo Preprocessing</h4>
                  <p>Configura nuove opzioni di preprocessing per questo file</p>
                </div>

                <!-- Option 2: Use existing preprocessing -->
                <div class="preprocessing-option" (click)="selectPreprocessingChoice('existing')">
                  <div class="option-icon">📋</div>
                  <h4>Usa Preprocessing Esistente</h4>
                  <p>Utilizza opzioni di preprocessing già salvate nel repository</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Step 4: Browse existing preprocessing options -->
      @if (currentStep() === 'existing-preprocessing') {
        <div class="existing-preprocessing-section">
          <div class="step-header">
            <button class="back-btn" (click)="goBack()">← Indietro</button>
            <h2>Seleziona Preprocessing Esistente</h2>
          </div>

          <div class="preprocessing-card">
            @if (isLoadingPreprocessingOptions()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <p>Caricamento opzioni di preprocessing...</p>
              </div>
            } @else if (preprocessingOptionsError()) {
              <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>{{ preprocessingOptionsError() }}</p>
                <button class="retry-btn" (click)="loadPreprocessingOptions()">Riprova</button>
              </div>
            } @else {
              <div class="preprocessing-browser">
                <div class="browser-header">
                  <h3>Opzioni di Preprocessing Disponibili</h3>
                  <button class="refresh-btn" (click)="loadPreprocessingOptions()">🔄 Aggiorna</button>
                </div>
                
                @if (availablePreprocessingOptions().length === 0) {
                  <div class="empty-state">
                    <p>Nessuna opzione di preprocessing trovata</p>
                    <button class="new-preprocessing-btn" (click)="selectPreprocessingChoice('new')">
                      Crea Nuovo Preprocessing
                    </button>
                  </div>
                } @else {
                  <div class="preprocessing-list">
                    @for (option of availablePreprocessingOptions(); track option.id) {
                      <div class="preprocessing-item" 
                           [class.selected]="selectedPreprocessingOption()?.id === option.id"
                           (click)="selectPreprocessingOption(option)">
                        <div class="option-icon">📋</div>
                        <div class="option-details">
                          <span class="option-name">{{ option.name }}</span>
                          <span class="option-description">{{ option.description }}</span>
                          <span class="option-meta">Creato: {{ formatDate(option.createdDate) }}</span>
                        </div>
                        @if (selectedPreprocessingOption()?.id === option.id) {
                          <div class="selected-indicator">✓</div>
                        }
                      </div>
                    }
                  </div>
                }

                <button class="continue-btn" 
                        [disabled]="!selectedPreprocessingOption()"
                        (click)="continueWithExistingPreprocessing()">
                  Continua con Preprocessing Selezionato
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Step 2c: Recover previous analysis -->
      @if (currentStep() === 'analysis-recovery') {
        <div class="analysis-recovery-section">
          <div class="step-header">
            <button class="back-btn" (click)="goBack()">← Indietro</button>
            <h2>Recupera Analisi Precedente</h2>
          </div>

          <div class="recovery-card">
            @if (isLoadingAnalyses()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <p>Caricamento analisi precedenti...</p>
              </div>
            } @else if (analysesError()) {
              <div class="error-state">
                <div class="error-icon">⚠️</div>
                <p>{{ analysesError() }}</p>
                <button class="retry-btn" (click)="loadPreviousAnalyses()">Riprova</button>
              </div>
            } @else {
              <div class="analysis-browser">
                <div class="browser-header">
                  <h3>Analisi Disponibili</h3>
                  <button class="refresh-btn" (click)="loadPreviousAnalyses()">🔄 Aggiorna</button>
                </div>
                
                @if (previousAnalyses().length === 0) {
                  <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>Nessuna analisi precedente trovata</p>
                    <p class="empty-subtitle">Avvia la tua prima analisi caricando un file</p>
                  </div>
                } @else {
                  <div class="analysis-list">
                    @for (analysis of previousAnalyses(); track analysis.analysisId) {
                      <div class="analysis-item" 
                           [class.selected]="selectedAnalysis()?.analysisId === analysis.analysisId"
                           (click)="selectAnalysis(analysis)">
                        <div class="analysis-icon">
                          @switch (analysis.status) {
                            @case ('completed') { <span class="status-icon completed">✓</span> }
                            @case ('running') { <span class="status-icon running">⏳</span> }
                            @case ('pending') { <span class="status-icon pending">⏸️</span> }
                            @case ('failed') { <span class="status-icon failed">❌</span> }
                          }
                        </div>
                        <div class="analysis-details">
                          <div class="analysis-header">
                            <span class="analysis-name">{{ analysis.name }}</span>
                            <span class="analysis-status" [class]="analysis.status">{{ getStatusLabel(analysis.status) }}</span>
                          </div>
                          <div class="analysis-meta">
                            <span class="analysis-id">ID: {{ analysis.analysisId }}</span>
                            <span class="analysis-type">{{ analysis.analysisType }}</span>
                          </div>
                          <span class="dataset-name">Dataset: {{ analysis.datasetName }}</span>
                          @if (analysis.description) {
                            <span class="analysis-description">{{ analysis.description }}</span>
                          }
                          <div class="analysis-dates">
                            <span class="created-date">Creato: {{ formatDate(analysis.createdDate) }}</span>
                            @if (analysis.completedDate) {
                              <span class="completed-date">Completato: {{ formatDate(analysis.completedDate) }}</span>
                            }
                          </div>
                        </div>
                        @if (selectedAnalysis()?.analysisId === analysis.analysisId) {
                          <div class="selected-indicator">✓</div>
                        }
                      </div>
                    }
                  </div>
                }

                <button class="continue-btn" 
                        [disabled]="!selectedAnalysis()"
                        (click)="continueWithAnalysisRecovery()">
                  @if (selectedAnalysis()?.status === 'completed') {
                    Visualizza Risultati Analisi
                  } @else {
                    Continua Analisi
                  }
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .upload-container {
      max-width: 100%;
      margin: 0 auto;
    }

    /* Page Header - consistent with other components */
    .page-header {
      margin-bottom: 32px;
    }

    .page-header h1 {
      margin: 0 0 8px 0;
      color: #0c4a6e;
      font-size: 28px;
      font-weight: 600;
    }

    .page-header p {
      margin: 0;
      color: #475569;
      font-size: 16px;
    }

    /* Step Header with back button */
    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .step-header h3 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .step-header button {
      background: white;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      color: #334155;
    }

    .step-header button:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    /* Source Selection Section */
    .source-selection {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .source-selection h3 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .source-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .source-option {
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      min-height: 160px;
      justify-content: center;
    }

    .source-option:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      background: #e0f2fe;
    }

    .source-option mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #0284c7;
      margin-bottom: 8px;
    }

    .source-option span {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }

    .source-option small {
      font-size: 14px;
      color: #64748b;
      text-align: center;
      line-height: 1.4;
    }

    /* Upload Section */
    .upload-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    /* Remote Section */
    .remote-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .upload-zone {
      border: 2px dashed #93c5fd;
      border-radius: 8px;
      padding: 48px 24px;
      text-align: center;
      transition: all 0.2s ease;
      background-color: #f0f9ff;
      cursor: pointer;
    }

    .upload-zone:hover {
      border-color: #60a5fa;
      background-color: #e0f2fe;
    }

    .upload-zone.drag-over {
      border-color: #0284c7;
      background: #bfdbfe;
    }

    .upload-icon {
      font-size: 48px;
      color: #0284c7;
      margin-bottom: 16px;
    }

    .upload-text {
      color: #475569;
      margin-bottom: 8px;
      font-size: 16px;
    }

    .upload-hint {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }

    /* File Info Display */
    .file-info {
      margin-top: 24px;
    }

    .file-details {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      background: #e0f2fe;
      border-radius: 6px;
      border: 1px solid #bae6fd;
      margin-bottom: 0px;
      width: 100%;
    }

    .file-details .file-text-content {
      display: flex;
      gap: 6px;
      flex-grow: 1;
      align-items: flex-start;
    }

    .file-details mat-icon {
      color: #0284c7;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .file-details h4 {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .file-details p {
      margin: 4px 0 0 0;
      color: #64748b;
      font-size: 14px;
    }

    /* File Preview */
    .file-preview {
      margin-top: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
    }

    .file-preview h4 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .preview-table {
      overflow-x: auto;
    }

    .preview-table table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .preview-table th {
      background: #f1f5f9;
      padding: 8px 12px;
      text-align: left;
      font-weight: 500;
      color: #334155;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }

    .preview-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
      color: #475569;
    }

    .preview-info {
      margin: 12px 0 0 0;
      font-size: 13px;
      color: #64748b;
      text-align: center;
      font-style: italic;
    }

    /* Remote Browse Section */
    .remote-browse-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .loading-state, .error-state, .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #64748b;
    }

    .loading-state mat-spinner {
      margin: 0 auto 16px auto;
    }

    .error-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }

    .error-state p {
      margin: 0 0 16px 0;
      font-size: 16px;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      color: #94a3b8;
    }

    /* Remote Files List */
    .remote-files-list {
      margin-top: 16px;
    }

    .remote-file-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }

    .remote-file-item:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transform: translateY(-1px);
    }

    .remote-file-item.selected {
      border-color: #0284c7;
      background: #e0f2fe;
      box-shadow: 0 0 0 1px #0284c7;
    }

    .file-icon mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #0284c7;
      flex-shrink: 0;
    }

    .file-info {
      flex-grow: 1;
      display: flex;
      gap: 6px;
      min-width: 0;
    }

    .file-info h4 {
      margin: 0 0 4px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .file-info small {
      color: #94a3b8;
      font-size: 12px;
    }

    .selected-indicator {
      color: #0284c7;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    /* Preprocessing Choice Section */
    .preprocessing-choice-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .file-summary {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #bae6fd;
    }

    .selected-file-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #0f172a;
      font-weight: 500;
    }

    .selected-file-info mat-icon {
      color: #0284c7;
    }

    .preprocessing-options h4 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .option-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .option-card {
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
    }

    .option-card:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      background: #e0f2fe;
    }

    .option-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .option-header mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .option-header h5 {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .option-card p {
      margin: 0 0 12px 0;
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
    }

    .option-benefits {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .option-benefits small {
      color: #475569;
      font-size: 12px;
    }

    /* Existing Preprocessing Section */
    .existing-preprocessing-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .preprocessing-options-list {
      margin-top: 16px;
    }

    .preprocessing-option-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 16px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }

    .preprocessing-option-item:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .preprocessing-option-item.selected {
      border-color: #0284c7;
      background: #e0f2fe;
    }

    .preprocessing-option-content {
      flex-grow: 1;
    }

    .preprocessing-option-content h5 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .preprocessing-option-content p {
      margin: 0 0 8px 0;
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
    }

    .preprocessing-option-meta {
      color: #94a3b8;
      font-size: 12px;
    }

    /* Action Buttons */
    .action-buttons {
      display: flex;
      gap: 16px;
      justify-content: flex-end;
      margin-top: 24px;
    }

    .action-buttons button {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-buttons button[mat-button] {
      background: white;
      color: #334155;
      border: 1px solid #93c5fd;
    }

    .action-buttons button[mat-button]:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    .action-buttons button[mat-raised-button] {
      background: #0284c7;
      color: white;
    }

    .action-buttons button[mat-raised-button]:hover:not(:disabled) {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }

    .action-buttons button:disabled {
      background: #93c5fd;
      cursor: not-allowed;
      opacity: 0.6;
    }

    /* Specific Button Styles */
    .back-btn {
      background: white;
      color: #334155;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 100px;
      justify-content: center;
    }

    .back-btn:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    .continue-btn {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      color: white;
      border: none;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      margin-top: 24px;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .continue-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #0369a1, #075985);
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
      transform: translateY(-2px);
    }

    .continue-btn:disabled {
      background: #94a3b8;
      cursor: not-allowed;
      opacity: 0.6;
      box-shadow: none;
      transform: none;
    }

    .retry-btn, .refresh-btn {
      background: white;
      color: #0284c7;
      border: 1px solid #93c5fd;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .retry-btn:hover, .refresh-btn:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    .new-preprocessing-btn {
      background: #0284c7;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 16px;
    }

    .new-preprocessing-btn:hover {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }

    .remove-btn {
      background: white;
      border: 1px solid #fca5a5;
      color: #dc2626;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .remove-btn:hover {
      background: #fef2f2;
      border-color: #f87171;
    }

    /* Upload specific styles */
    .upload-card, .remote-card, .preprocessing-card {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .upload-area {
      border: 2px dashed #93c5fd;
      border-radius: 8px;
      padding: 48px 24px;
      text-align: center;
      transition: all 0.2s ease;
      background-color: #f0f9ff;
      cursor: pointer;
      margin-bottom: 24px;
      min-height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .upload-area:hover {
      border-color: #60a5fa;
      background-color: #e0f2fe;
    }

    .upload-area.drag-over {
      border-color: #0284c7;
      background: #bfdbfe;
    }

    .upload-icon {
      font-size: 48px;
      margin-bottom: 8px;
      display: block;
      color: #0284c7;
    }

    .upload-text {
      color: #475569;
      margin-bottom: 4px;
      font-size: 16px;
      line-height: 1.5;
    }

    .file-label {
      color: #0284c7;
      cursor: pointer;
      font-weight: 500;
      text-decoration: underline;
      transition: color 0.2s;
    }

    .file-label:hover {
      color: #0369a1;
    }

    .file-types {
      font-size: 14px;
      color: #64748b;
      margin: 0;
      font-style: italic;
    }

    .file-info {
      margin-top: 0;
      padding: 20px;
      background: #e0f2fe;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #bae6fd;
      margin-bottom: 16px;
    }

    .file-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 16px;
    }

    .file-size {
      color: #64748b;
    }

    /* Source selection styles */
    .source-selection h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .source-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .source-option {
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .source-option:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      background: #e0f2fe;
    }

    .option-icon {
      font-size: 48px;
      margin-bottom: 16px;
      display: block;
    }

    .source-option h3 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
    }

    .source-option p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
    }

    /* Step headers */
    .step-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    .step-header h2 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
      flex-grow: 1;
    }

    /* Loading, error and empty states */
    .loading-state, .error-state, .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top: 4px solid #0284c7;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
      display: block;
    }

    /* File browser */
    .file-browser, .preprocessing-browser {
      margin-top: 16px;
    }

    .browser-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }

    .browser-header h3 {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    /* Remote file items */
    .file-list {
      margin-bottom: 20px;
    }

    .remote-file-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 8px;
    }

    .remote-file-item:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .remote-file-item.selected {
      border-color: #0284c7;
      background: #e0f2fe;
    }

    .file-icon {
      font-size: 24px;
      width: 32px;
      text-align: center;
    }

    .file-details {
      flex-grow: 1;
      display: flex;
      gap: 2px;
    }

    .file-meta {
      font-size: 12px;
      color: #94a3b8;
    }

    .selected-indicator {
      color: #0284c7;
      font-size: 18px;
      font-weight: bold;
    }

    /* Preprocessing sections */
    .selected-file-info {
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #bae6fd;
      margin-bottom: 20px;
    }

    .selected-file-info h3 {
      margin: 0 0 0 0;
      color: #0f172a;
      font-size: 14px;
      font-weight: 500;
    }

    .file-summary {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .preprocessing-options h3 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .preprocessing-choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }

    .preprocessing-option {
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .preprocessing-option:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      background: #e0f2fe;
    }

    .preprocessing-option h4 {
      margin: 8px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 600;
    }

    .preprocessing-option p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
    }

    /* Preprocessing list items */
    .preprocessing-list {
      margin-bottom: 20px;
    }

    .preprocessing-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 12px;
    }

    .preprocessing-item:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .preprocessing-item.selected {
      border-color: #0284c7;
      background: #e0f2fe;
    }

    .option-details {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .option-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 15px;
    }

    .option-description {
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
    }

    .option-meta {
      color: #94a3b8;
      font-size: 12px;
    }

    /* Analysis Recovery Section */
    .analysis-recovery-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .recovery-card {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .analysis-browser {
      margin-top: 16px;
    }

    .analysis-list {
      margin-bottom: 20px;
    }

    .analysis-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 16px;
    }

    .analysis-item:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transform: translateY(-1px);
    }

    .analysis-item.selected {
      border-color: #0284c7;
      background: #e0f2fe;
      box-shadow: 0 0 0 1px #0284c7;
    }

    .analysis-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border: 2px solid #bae6fd;
    }

    .status-icon {
      font-size: 20px;
      font-weight: bold;
    }

    .status-icon.completed {
      color: #059669;
    }

    .status-icon.running {
      color: #0284c7;
    }

    .status-icon.pending {
      color: #f59e0b;
    }

    .status-icon.failed {
      color: #dc2626;
    }

    .analysis-details {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .analysis-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .analysis-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 16px;
    }

    .analysis-status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .analysis-status.completed {
      background: #d1fae5;
      color: #059669;
    }

    .analysis-status.running {
      background: #dbeafe;
      color: #0284c7;
    }

    .analysis-status.pending {
      background: #fef3c7;
      color: #f59e0b;
    }

    .analysis-status.failed {
      background: #fecaca;
      color: #dc2626;
    }

    .analysis-meta {
      display: flex;
      gap: 16px;
      margin-bottom: 4px;
    }

    .analysis-id {
      color: #64748b;
      font-size: 13px;
      font-family: monospace;
    }

    .analysis-type {
      color: #0284c7;
      font-size: 13px;
      font-weight: 500;
    }

    .dataset-name {
      color: #475569;
      font-size: 14px;
      font-style: italic;
    }

    .analysis-description {
      color: #64748b;
      font-size: 14px;
      line-height: 1.4;
      margin-top: 4px;
    }

    .analysis-dates {
      display: flex;
      gap: 16px;
      margin-top: 8px;
    }

    .created-date, .completed-date {
      color: #94a3b8;
      font-size: 12px;
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-subtitle {
      color: #94a3b8;
      font-size: 14px;
      margin-top: 8px;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .source-options {
        grid-template-columns: 1fr;
      }

      .option-cards {
        grid-template-columns: 1fr;
      }

      .action-buttons {
        justify-content: stretch;
        flex-direction: column;
      }

      .file-details {
        align-items: flex-start;
        flex-direction: none;
        gap: 8px;
      }
    }
  `]
})
export class FileUploadComponent implements OnInit {
  // Existing properties
  selectedFile = signal<FileData | null>(null);
  isDragOver = signal(false);

  // New properties for multi-step flow
  currentStep = signal<'source-selection' | 'upload' | 'remote-browse' | 'analysis-recovery' | 'preprocessing-choice' | 'existing-preprocessing'>('source-selection');
  dataSource = signal<'upload' | 'remote' | 'recovery' | null>(null);
  
  // Remote files properties
  remoteFiles = signal<RemoteFile[]>([]);
  selectedRemoteFile = signal<RemoteFile | null>(null);
  isLoadingRemoteFiles = signal(false);
  remoteFilesError = signal<string | null>(null);
  
  // Preprocessing options properties
  availablePreprocessingOptions = signal<RemotePreprocessingOptions[]>([]);
  selectedPreprocessingOption = signal<RemotePreprocessingOptions | null>(null);
  isLoadingPreprocessingOptions = signal(false);
  preprocessingOptionsError = signal<string | null>(null);
  
  // Previous analyses properties
  previousAnalyses = signal<PreviousAnalysis[]>([]);
  selectedAnalysis = signal<PreviousAnalysis | null>(null);
  isLoadingAnalyses = signal(false);
  analysesError = signal<string | null>(null);
  
  // Navigation history for back button
  private stepHistory: string[] = [];

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private navigationService: NavigationService
  ) {}

  ngOnInit() {
    // Load existing file data if returning to this step
    const existingFile = this.dataFlowService.fileData();
    if (existingFile) {
      this.selectedFile.set(existingFile);
      // If we have existing data, skip to preprocessing choice
      this.currentStep.set('preprocessing-choice');
      this.dataSource.set('upload');
    }
  }

  // Step navigation methods
  selectDataSource(source: 'upload' | 'remote' | 'recovery') {
    this.dataSource.set(source);
    this.stepHistory.push('source-selection');
    
    if (source === 'upload') {
      this.currentStep.set('upload');
    } else if (source === 'remote') {
      this.currentStep.set('remote-browse');
      this.loadRemoteFiles();
    } else if (source === 'recovery') {
      this.currentStep.set('analysis-recovery');
      this.loadPreviousAnalyses();
    }
  }

  goBack() {
    const previousStep = this.stepHistory.pop();
    if (previousStep) {
      this.currentStep.set(previousStep as any);
    } else {
      this.currentStep.set('source-selection');
    }
    
    // Clear selections when going back
    if (this.currentStep() === 'source-selection') {
      this.selectedFile.set(null);
      this.selectedRemoteFile.set(null);
      this.selectedAnalysis.set(null);
      this.dataSource.set(null);
    }
  }

  proceedToPreprocessingChoice() {
    this.stepHistory.push(this.currentStep());
    this.currentStep.set('preprocessing-choice');
  }

  selectPreprocessingChoice(choice: 'new' | 'existing') {
    if (choice === 'new') {
      this.continueToPreprocessing();
    } else {
      this.stepHistory.push('preprocessing-choice');
      this.currentStep.set('existing-preprocessing');
      this.loadPreprocessingOptions();
    }
  }

  // Remote files methods
  async loadRemoteFiles() {
    this.isLoadingRemoteFiles.set(true);
    this.remoteFilesError.set(null);
    
    try {
      // TODO: Replace with actual API call
      // const files = await this.apiService.getRemoteFiles();
      
      // Mock data for now
      const mockFiles: RemoteFile[] = [
        {
          id: '1',
          name: 'dataset_1.csv',
          size: 1024000,
          lastModified: new Date('2024-01-15'),
          path: '/remote/dataset_1.csv'
        },
        {
          id: '2', 
          name: 'experiment_data.xlsx',
          size: 2048000,
          lastModified: new Date('2024-01-20'),
          path: '/remote/experiment_data.xlsx'
        },
        {
          id: '3',
          name: 'sample_analysis.json',
          size: 512000,
          lastModified: new Date('2024-01-25'),
          path: '/remote/sample_analysis.json'
        }
      ];
      
      // Simulate API delay
      setTimeout(() => {
        this.remoteFiles.set(mockFiles);
        this.isLoadingRemoteFiles.set(false);
      }, 1000);
      
    } catch (error: any) {
      this.remoteFilesError.set(error.message || 'Errore nel caricamento dei file remoti');
      this.isLoadingRemoteFiles.set(false);
    }
  }

  selectRemoteFile(file: RemoteFile) {
    this.selectedRemoteFile.set(file);
    
    // Create a FileData object for compatibility with existing flow
    const fileData: FileData = {
      file: null as any, // Will be loaded from remote
      fileName: file.name,
      fileSize: file.size,
      uploadDate: new Date(),
      remotePath: file.path,
      isRemote: true
    };
    
    this.dataFlowService.setFileData(fileData);
    this.navigationService.updateNavigationStatus();
  }

  // Preprocessing options methods
  async loadPreprocessingOptions() {
    this.isLoadingPreprocessingOptions.set(true);
    this.preprocessingOptionsError.set(null);
    
    try {
      // TODO: Replace with actual API call
      // const options = await this.apiService.getPreprocessingOptions();
      
      // Mock data for now
      const mockOptions: RemotePreprocessingOptions[] = [
        {
          id: '1',
          name: 'Standard Omics Preprocessing',
          description: 'Normalizzazione log2, rimozione valori mancanti, scaling standard',
          options: {
            normalization: 'log2',
            missingValues: 'remove',
            scaling: 'standard'
          },
          createdDate: new Date('2024-01-10')
        },
        {
          id: '2',
          name: 'Robust Preprocessing',
          description: 'Normalizzazione robusta, imputazione mediana, scaling robusto',
          options: {
            normalization: 'robust',
            missingValues: 'median_imputation',
            scaling: 'robust'
          },
          createdDate: new Date('2024-01-18')
        }
      ];
      
      // Simulate API delay
      setTimeout(() => {
        this.availablePreprocessingOptions.set(mockOptions);
        this.isLoadingPreprocessingOptions.set(false);
      }, 800);
      
    } catch (error: any) {
      this.preprocessingOptionsError.set(error.message || 'Errore nel caricamento delle opzioni di preprocessing');
      this.isLoadingPreprocessingOptions.set(false);
    }
  }

  selectPreprocessingOption(option: RemotePreprocessingOptions) {
    this.selectedPreprocessingOption.set(option);
  }

  continueWithExistingPreprocessing() {
    if (this.selectedPreprocessingOption()) {
      // Set the preprocessing options in the data flow service
      this.dataFlowService.setPreprocessingOptions(this.selectedPreprocessingOption()!.options);
      // Skip preprocessing step and go directly to analysis selection
      this.navigationService.navigateToStep('analysis');
    }
  }

  // Analysis recovery methods
  async loadPreviousAnalyses() {
    this.isLoadingAnalyses.set(true);
    this.analysesError.set(null);
    
    try {
      // TODO: Replace with actual API call
      // const analyses = await this.apiService.getPreviousAnalyses();
      
      // Mock data for now
      const mockAnalyses: PreviousAnalysis[] = [
        {
          analysisId: 'analysis_2024_001',
          name: 'Proteomics Study - Control vs Treatment',
          status: 'completed',
          createdDate: new Date('2024-01-15T10:30:00'),
          completedDate: new Date('2024-01-15T14:45:00'),
          analysisType: 'Differential Expression',
          datasetName: 'proteomics_control_treatment.csv',
          description: 'Analisi differenziale proteomica tra controllo e trattamento'
        },
        {
          analysisId: 'analysis_2024_002',
          name: 'Metabolomics Time Series',
          status: 'running',
          createdDate: new Date('2024-01-20T09:15:00'),
          analysisType: 'Time Series Analysis',
          datasetName: 'metabolomics_timeseries.xlsx',
          description: 'Studio longitudinale del metaboloma'
        },
        {
          analysisId: 'analysis_2024_003',
          name: 'Multi-omics Integration',
          status: 'pending',
          createdDate: new Date('2024-01-25T16:20:00'),
          analysisType: 'Multi-omics',
          datasetName: 'multiomics_dataset.json',
          description: 'Integrazione di dati proteomici e metabolomici'
        },
        {
          analysisId: 'analysis_2024_004',
          name: 'Biomarker Discovery',
          status: 'failed',
          createdDate: new Date('2024-01-28T11:00:00'),
          analysisType: 'Feature Selection',
          datasetName: 'biomarker_discovery.csv',
          description: 'Identificazione di biomarcatori potenziali'
        }
      ];
      
      // Simulate API delay
      setTimeout(() => {
        this.previousAnalyses.set(mockAnalyses);
        this.isLoadingAnalyses.set(false);
      }, 1200);
      
    } catch (error: any) {
      this.analysesError.set(error.message || 'Errore nel caricamento delle analisi precedenti');
      this.isLoadingAnalyses.set(false);
    }
  }

  selectAnalysis(analysis: PreviousAnalysis) {
    this.selectedAnalysis.set(analysis);
  }

  continueWithAnalysisRecovery() {
    if (this.selectedAnalysis()) {
      const analysis = this.selectedAnalysis()!;
      
      // Set the analysis ID in the data flow service
      this.dataFlowService.setAnalysisId(analysis.analysisId);
      
      if (analysis.status === 'completed') {
        // Navigate directly to results
        this.navigationService.navigateToStep('results');
      } else {
        // Navigate to appropriate step based on analysis status
        // For running/pending analyses, we might want to go to a monitoring view
        // or continue the analysis workflow
        this.navigationService.navigateToStep('analysis');
      }
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed':
        return 'Completata';
      case 'running':
        return 'In Esecuzione';
      case 'pending':
        return 'In Attesa';
      case 'failed':
        return 'Fallita';
      default:
        return 'Sconosciuto';
    }
  }

  // Utility methods
  formatDate(date: Date): string {
    return date.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getFileIcon(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'csv':
        return 'grid_on';
      case 'xlsx':
      case 'xls':
        return 'table_chart';
      case 'json':
        return 'data_object';
      default:
        return 'description';
    }
  }

  triggerFileInput() {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.processFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      this.processFile(event.dataTransfer.files[0]);
    }
  }

  private processFile(file: File) {
    const fileData: FileData = {
      file: file,
      fileName: file.name,
      fileSize: file.size,
      uploadDate: new Date()
    };
    
    this.selectedFile.set(fileData);
    this.dataFlowService.setFileData(fileData);
    this.navigationService.updateNavigationStatus();
  }

  removeFile() {
    this.selectedFile.set(null);
    this.dataFlowService.setFileData(null as any);
    this.navigationService.updateNavigationStatus();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  continueToPreprocessing() {
    if (this.selectedFile()) {
      this.navigationService.navigateToStep('preprocessing');
    }
  }
}
