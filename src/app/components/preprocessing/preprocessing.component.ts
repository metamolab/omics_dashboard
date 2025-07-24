import { Component, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileParserService } from '../../services/file-parser.service';
import { ApiService } from '../../services/api.service';
import { PreprocessingOptions, FilePreview, ColumnClassification } from '../../models/interfaces';

@Component({
  selector: 'app-preprocessing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-wrapper">
      <div class="page-header">
        <h1>Impostazioni Pre-processing</h1>
        <p>Configura come vuoi preparare i tuoi dati per l'analisi</p>

      <!-- File Preview Section -->
      @if (filePreview()) {
        <div class="preview-section">
          <h2>Anteprima del File</h2>
          <div class="file-info-bar">
            <span>File: {{ fileName }}</span>
            <span>Totale righe: {{ filePreview()!.totalRows }}</span>
            <span>Colonne: {{ filePreview()!.headers.length }}</span>
          </div>
          
          <div class="table-container">
            <table class="preview-table">
              <thead>
                <tr>
                  <th class="index-col">#</th>
                  @for (header of filePreview()!.headers; track $index) {
                    <th>
                      <div class="header-cell">
                        <span class="header-name">{{ header }}</span>
                        <span class="header-index">[{{ $index + 1 }}]</span>
                      </div>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of filePreview()!.rows; track $index) {
                  <tr>
                    <td class="index-col">{{ $index + 1 }}</td>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          
          @if (filePreview()!.totalRows > 10) {
            <p class="preview-note">Mostrando solo le prime 10 righe di {{ filePreview()!.totalRows }}</p>
          }
        </div>
      }

      <!-- Column Classification Section -->
      <div class="classification-section">
        <h2>Classificazione Colonne</h2>
        <p class="section-desc">Specifica il ruolo di ogni colonna usando nomi o indici (gli indici partono da 1)</p>
        
        <div class="classification-grid">
          <!-- ID Column -->
          <div class="classification-card">
            <h3>🔑 Colonna ID</h3>
            <p>Identificatore univoco (lascia vuoto per usare indici righe)</p>
            <input 
              type="text" 
              [(ngModel)]="columnInputs.id"
              placeholder="es: id, 1, customer_id (opzionale)"
              class="column-input"
              (input)="validateColumnInput()">
            @if (columnErrors.id) {
              <span class="error-text">{{ columnErrors.id }}</span>
            }
            <div class="selected-columns">
              @if (getSelectedColumn('id')) {
                <span class="column-chip">{{ getSelectedColumn('id') }}</span>
              } @else {
                <span class="column-chip default">Indici righe</span>
              }
            </div>
          </div>

          <!-- Outcome Column -->
          <div class="classification-card required">
            <h3>🎯 Outcome</h3>
            <p>Variabile dipendente/risultato (obbligatoria)</p>
            <input 
              type="text" 
              [(ngModel)]="columnInputs.outcome"
              placeholder="es: outcome, 5, result"
              class="column-input"
              [class.error]="columnErrors.outcome"
              (input)="validateColumnInput()">
            @if (columnErrors.outcome) {
              <span class="error-text">{{ columnErrors.outcome }}</span>
            }
            <div class="selected-columns">
              @if (getSelectedColumn('outcome')) {
                <span class="column-chip">{{ getSelectedColumn('outcome') }}</span>
              }
            </div>
          </div>

          <!-- Covariate Columns -->
          <div class="classification-card">
            <h3>📊 Covariate</h3>
            <p>Variabili indipendenti/predittori (opzionali)</p>
            <input 
              type="text" 
              [(ngModel)]="columnInputs.covariates"
              placeholder="es: age,income, 1-3, feature_*"
              class="column-input"
              (input)="validateColumnInput()">
            @if (columnErrors.covariates) {
              <span class="error-text">{{ columnErrors.covariates }}</span>
            }
            <div class="selected-columns">
              @for (col of getSelectedColumns('covariates'); track col) {
                <span class="column-chip">{{ col }}</span>
              }
              @if (getSelectedColumns('covariates').length === 0) {
                <span class="empty-text">Nessuna selezione</span>
              }
            </div>
          </div>

          <!-- Omics Data Columns -->
          <div class="classification-card required">
            <h3>🧬 Dati Omici</h3>
            <p>Dati genomici/proteomici (almeno 1 obbligatoria)</p>
            <input 
              type="text" 
              [(ngModel)]="columnInputs.omics"
              placeholder="es: gene_*, 10-50, expr_1,expr_2"
              class="column-input"
              [class.error]="columnErrors.omics"
              (input)="validateColumnInput()">
            @if (columnErrors.omics) {
              <span class="error-text">{{ columnErrors.omics }}</span>
            }
            <div class="selected-columns">
              @for (col of getSelectedColumns('omics').slice(0, 30); track col) {
                <span class="column-chip">{{ col }}</span>
              }
              @if (getSelectedColumns('omics').length > 30) {
                <span class="empty-text">...e altre {{ getSelectedColumns('omics').length - 30 }} colonne</span>
              }
              @if (getSelectedColumns('omics').length === 0) {
                <span class="empty-text">Seleziona almeno una colonna</span>
              }
            </div>
          </div>

          <!-- Categorical Variables -->
          <div class="classification-card full-width">
            <h3>📋 Variabili Categoriche/Ordinali</h3>
            <p>Seleziona quali delle colonne già classificate sono categoriche/ordinali</p>
            <div class="categorical-selection">
              @for (col of getAllClassifiedColumns(); track col.display) {
                <label class="categorical-label">
                  <input 
                    type="checkbox" 
                    [checked]="isCategorical(col.value)"
                    (change)="toggleCategorical(col.value)">
                  <span class="checkbox-custom"></span>
                  <span>{{ col.display }}</span>
                </label>
              }
              @if (getAllClassifiedColumns().length === 0) {
                <span class="empty-text">Classifica prima le colonne sopra</span>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Data Cleaning, Transformation, and Outlier Options -->
      <div class="options-container">
        <!-- Eliminazione Colonne con Dati Mancanti -->
        <div class="options-section">
          <h2>Eliminazione Colonne con Dati Mancanti</h2>
          <div class="missing-data-section">
            <div class="option-card">
              <label class="option-label">
                <input type="checkbox" [(ngModel)]="enableMissingDataRemoval" (change)="analyzeMissingData()">
                <span class="checkbox-custom"></span>
                <div class="option-content">
                  <h3>Elimina colonne con troppi dati mancanti</h3>
                  <p>Rimuovi automaticamente colonne che superano la soglia di dati mancanti</p>
                </div>
              </label>
            </div>
            
            @if (enableMissingDataRemoval) {
              <div class="threshold-section">
                <label for="missingThreshold" class="threshold-label">
                  Soglia percentuale di dati mancanti: {{ missingDataThreshold }}%
                </label>
                <input 
                  type="range" 
                  id="missingThreshold"
                  min="10" 
                  max="95" 
                  step="5"
                  [(ngModel)]="missingDataThreshold"
                  (input)="updateColumnsToRemove()"
                  class="threshold-slider">
                <div class="slider-labels">
                  <span>10%</span>
                  <span>50%</span>
                  <span>95%</span>
                </div>
              </div>

              @if (columnsToRemove.length > 0) {
                <div class="columns-to-remove">
                  <h4>Colonne che verranno eliminate ({{ columnsToRemove.length }}):</h4>
                  <div class="columns-list">
                    @for (col of columnsToRemove.slice(0, 10); track col.name) {
                      <div class="column-to-remove">
                        <span class="column-name">{{ col.name }}</span>
                        <span class="missing-percentage">{{ col.missingPercentage.toFixed(1) }}% mancante</span>
                      </div>
                    }
                    @if (columnsToRemove.length > 10) {
                      <div class="more-columns">
                        ...e altre {{ columnsToRemove.length - 10 }} colonne
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <div class="no-columns-message">
                  <p>Nessuna colonna verrà eliminata con la soglia del {{ missingDataThreshold }}%</p>
                </div>
              }

              @if (getMissingDataAnalysisCount() > 0) {
                <div class="missing-data-summary">
                  <h4>Riepilogo dati mancanti:</h4>
                  <div class="summary-stats">
                    <div class="stat">
                      <span class="stat-label">Colonne totali analizzate:</span>
                      <span class="stat-value">{{ getMissingDataAnalysisCount() }}</span>
                    </div>
                    <div class="stat">
                      <span class="stat-label">Colonne senza dati mancanti:</span>
                      <span class="stat-value">{{ getColumnsWithoutMissing() }}</span>
                    </div>
                    <div class="stat">
                      <span class="stat-label">Colonne con >{{ missingDataThreshold }}% mancanti:</span>
                      <span class="stat-value">{{ columnsToRemove.length }}</span>
                    </div>
                  </div>
                </div>
              }
            }
          </div>
        </div>
        <!-- Pulizia Dati -->
        <div class="options-section">
          <h2>Pulizia Dati</h2>
          <div class="options-grid">
            <div class="option-card">
              <label class="option-label">
                <input type="checkbox" [(ngModel)]="options.removeNullValues">
                <span class="checkbox-custom"></span>
                <div class="option-content">
                  <h3>Rimuovi valori nulli</h3>
                  <p>Elimina righe con valori mancanti</p>
                </div>
              </label>
            </div>
            <div class="fill-method-card">
              <label for="fillMethod">Metodo di riempimento NA</label>
              <select id="fillMethod" [(ngModel)]="options.fillMissingValues" class="select-input">
                <option value="none">Non riempire</option>
                <option value="mean">Media</option>
                <option value="median">Mediana</option>
                <option value="mode">Moda</option>
                <option value="forward">Forward fill</option>
                <option value="backward">Backward fill</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Trasformazioni -->
        <div class="options-section">
          <h2>Trasformazioni</h2>
          <div class="options-card">
            <label for="transformMethod">Metodo di trasformazione</label>
            <select id="transformMethod" [(ngModel)]="options.transformation" class="select-input">
              <option value="none">Nessuna trasformazione</option>
              <option value="scale">Scala (0-1)</option>
              <option value="center">Centra</option>
              <option value="standardize">Standardizza (z-score)</option>
              <option value="log">Log</option>
              <option value="log2">Log2</option>
              <option value="yeo-johnson">Yeo-Johnson</option>
            </select>
          </div>
        </div>

        <!-- Gestione Outlier -->
        <div class="options-section">
          <h2>Gestione Outlier</h2>
          <div class="options-grid">
            <div class="option-card">
              <label class="option-label">
                <input type="checkbox" [(ngModel)]="options.removeOutliers">
                <span class="checkbox-custom"></span>
                <div class="option-content">
                  <h3>Rimuovi outlier</h3>
                  <p>Elimina valori anomali usando metodi statistici</p>
                </div>
              </label>
            </div>
            <div class="outlier-method-card">
              <label for="outlierMethod">Metodo di rilevamento</label>
              <select id="outlierMethod" [(ngModel)]="options.outlierMethod" class="select-input">
                <option value="iqr">IQR (Interquartile Range)</option>
                <option value="zscore">Z-Score</option>
                <option value="isolation">Isolation Forest</option>
              </select>
            </div>
          </div>
        </div>
      </div>

        <!-- Action Buttons -->
        <div class="button-group">
          <button class="secondary-btn" (click)="goBack()">Indietro</button>
          <button class="primary-btn" [disabled]="!isValid() || processing()" (click)="processAndContinue()">
            @if (processing()) {
              <span class="spinner-small"></span>
              Elaborazione in corso...
            } @else {
              Continua all'analisi
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .content-wrapper { max-width: 100%; margin: 0 auto; }
    .page-header { margin-bottom: 32px; }
    .page-header h1 { margin: 0 0 8px 0; color: #0c4a6e; font-size: 28px; font-weight: 600; }
    .page-header p { margin: 0; color: #475569; font-size: 16px; }
    .preview-section, .classification-section, .options-container { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); border: 1px solid #bae6fd; margin-bottom: 24px; padding: 24px; }
    .file-info-bar { display: flex; gap: 24px; padding: 12px 16px; background: #f0f9ff; border-radius: 6px; margin-bottom: 16px; font-size: 14px; color: #475569; }
    .table-container { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px; }
    .preview-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .preview-table th { background: #f8fafc; padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; font-weight: 500; color: #0f172a; }
    .header-cell { display: flex; flex-direction: column; gap: 2px; }
    .header-name { font-weight: 600; }
    .header-index { font-size: 11px; color: #64748b; font-weight: normal; }
    .preview-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .preview-table tr:hover { background: #f8fafc; }
    .index-col { background: #f8fafc; font-weight: 500; color: #64748b; text-align: center; width: 50px; }
    .preview-note { margin: 12px 0 0 0; font-size: 13px; color: #64748b; text-align: center; }
    .classification-section h2, .options-section h2 { margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 500; }
    .section-desc { margin: 0 0 20px 0; color: #64748b; font-size: 14px; }
    .classification-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
    .classification-card, .option-card, .fill-method-card, .options-card { background: #f0f9ff; border-radius: 6px; padding: 20px; border: 1px solid #bae6fd; }
    .classification-card.required { border: 2px solid #60a5fa; background: #eff6ff; }
    .classification-card.full-width { grid-column: 1 / -1; }
    .classification-card h3, .option-content h3 { margin: 0 0 8px 0; color: #0f172a; font-size: 16px; font-weight: 500; }
    .classification-card p, .option-content p { margin: 0 0 12px 0; color: #64748b; font-size: 13px; }
    .column-input, .select-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 15px;
      background: white;
      color: #1e293b;
      transition: border-color 0.2s, box-shadow 0.2s;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      box-shadow: none;
      cursor: pointer;
      position: relative;
    }
    /* Make select-input labels bold and add spacing */
    .fill-method-card label,
    .options-card label[for="transformMethod"] {
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }
    .select-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
      background: #f0f9ff;
    }
    .select-input:hover {
      border-color: #60a5fa;
      background: #f0f9ff;
    }
    .select-input option {
      background: #f8fafc;
      color: #1e293b;
      font-size: 15px;
      padding: 10px 12px;
    }
    .select-input:disabled {
      background: #f1f5f9;
      color: #94a3b8;
      cursor: not-allowed;
    }
    .missing-data-section {
  .threshold-section {
    margin-top: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
    
    .threshold-label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #2c3e50;
    }
    
    .threshold-slider {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: #ddd;
      outline: none;
      margin: 0.5rem 0;
      
      &::-webkit-slider-thumb {
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #3498db;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      
      &::-moz-range-thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #3498db;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
    }
    
    .slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #666;
    }
  }
  
  .columns-to-remove {
    margin-top: 1rem;
    
    h4 {
      color: #e74c3c;
      margin-bottom: 0.5rem;
    }
    
    .columns-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 0.5rem;
      background: #fff;
      
      .column-to-remove {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.3rem 0;
        border-bottom: 1px solid #eee;
        
        &:last-child {
          border-bottom: none;
        }
        
        .column-name {
          font-family: 'Courier New', monospace;
          color: #2c3e50;
          font-size: 0.9rem;
        }
        
        .missing-percentage {
          font-size: 0.85rem;
          color: #e74c3c;
          font-weight: 500;
        }
      }
      
      .more-columns {
        text-align: center;
        color: #666;
        font-style: italic;
        padding: 0.5rem;
      }
    }
  }
  
  .no-columns-message {
    margin-top: 1rem;
    padding: 1rem;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 4px;
    color: #155724;
    
    p {
      margin: 0;
    }
  }
  
  .missing-data-summary {
    margin-top: 1rem;
    padding: 1rem;
    background: #e3f2fd;
    border-radius: 4px;
    
    h4 {
      margin-bottom: 0.5rem;
      color: #1976d2;
    }
    
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.5rem;
      
      .stat {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0;
        
        .stat-label {
          color: #555;
        }
        
        .stat-value {
          font-weight: 600;
          color: #1976d2;
        }
      }
    }
  }
}
    .column-input.error { border-color: #ef4444; }
    .error-text { display: block; color: #dc2626; font-size: 12px; margin-top: 4px; }
    .selected-columns { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; min-height: 32px; }
    .column-chip { background: #0284c7; color: white; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; }
    .column-chip.default { background: #64748b; }
    .empty-text { color: #94a3b8; font-size: 13px; font-style: italic; }
    .categorical-selection { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .categorical-label { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.2s; }
    .categorical-label input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; margin: 0; pointer-events: none; }
    .categorical-label:hover { background: #e0f2fe; }
    .options-container { padding: 32px; }
    .options-section { margin-bottom: 32px; }
    .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; align-items: stretch; }
    .option-label { display: flex; align-items: center; cursor: pointer; gap: 16px; }
    .option-label input[type="checkbox"] { display: none; }
    .checkbox-custom { width: 20px; height: 20px; border: 2px solid #93c5fd; border-radius: 4px; background: white; position: relative; flex-shrink: 0; transition: all 0.2s ease; }
    .option-label input[type="checkbox"]:checked + .checkbox-custom, .categorical-label input[type="checkbox"]:checked + .checkbox-custom { background: #0284c7; border-color: #0284c7; }
    .checkbox-custom::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 12px; opacity: 0; transition: opacity 0.2s; }
    .option-label input[type="checkbox"]:checked + .checkbox-custom::after, .categorical-label input[type="checkbox"]:checked + .checkbox-custom::after { opacity: 1; }
    .button-group { display: flex; gap: 16px; justify-content: flex-end; margin-top: 32px; }
    .primary-btn, .secondary-btn { padding: 12px 24px; border: none; border-radius: 6px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
    .secondary-btn { background: white; color: #334155; border: 1px solid #93c5fd; }
    .secondary-btn:hover { background: #f0f9ff; border-color: #60a5fa; }
    .primary-btn { background: #0284c7; color: white; }
    .primary-btn:hover:not(:disabled) { background: #0369a1; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2); }
    .primary-btn:disabled { background: #93c5fd; cursor: not-allowed; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class PreprocessingComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  sessionId: string = '';
  userId: string = '';

  missingDataThreshold = 50;
  enableMissingDataRemoval = false;
  columnsToRemove: { name: string, missingPercentage: number }[] = [];
  missingDataAnalysis: { [key: string]: number } = {};

  options: PreprocessingOptions = {
    columnClassification: {
      idColumn: null,
      outcomeColumn: '',
      covariateColumns: [],
      omicsColumns: [],
      categoricalColumns: []
    },
    removeNullValues: false,
    fillMissingValues: 'none',
    transformation: 'none',
    removeOutliers: false,
    outlierMethod: 'iqr',
    missingDataRemoval: {
      enabled: false,
      threshold: 50,
      columnsToRemove: []
    }
  };

  filePreview = signal<FilePreview | null>(null);
  fileName = '';
  processing = signal(false);
  
  columnInputs = {
    id: '',
    outcome: '',
    covariates: '',
    omics: ''
  };

  columnErrors: any = {
    id: '',
    outcome: '',
    covariates: '',
    omics: ''
  };


  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private navigationService: NavigationService,
    private fileParserService: FileParserService,
    private apiService: ApiService
  ) {}

  async ngOnInit() {
    // Check if file is uploaded
    const fileData = this.dataFlowService.fileData();
    if (!fileData) {
      this.navigationService.navigateToStep('upload');
      return;
    }

    this.fileName = fileData.fileName;

    // Genera un sessionId randomico se non già presente
    let sessionId = window.sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      window.sessionStorage.setItem('sessionId', sessionId);
    }
    this.sessionId = sessionId;

    // Setta userId come 'MasterTest' se non già presente
    let userId = window.sessionStorage.getItem('userId');
    if (!userId) {
      userId = 'MasterTest';
      window.sessionStorage.setItem('userId', userId);
    }
    this.userId = userId;
    this.options.sessionId = this.sessionId;

    // Load file preview
    try {
      const preview = await this.fileParserService.parseFile(fileData.file);
      this.filePreview.set(preview);
      
      // Update file data with preview
      this.dataFlowService.setFileData({
        ...fileData,
        preview,
        sessionId: this.sessionId,
        userId: this.userId
      });
    } catch (error) {
      console.error('Error parsing file:', error);
    }

    // Load existing options if available
    const savedOptions = this.dataFlowService.preprocessingOptions();
    if (savedOptions) {
      this.options = { ...savedOptions };
      // Restore column inputs
      if (savedOptions.columnClassification) {
        this.columnInputs.id = savedOptions.columnClassification.idColumn !== null ? 
          this.columnToString(savedOptions.columnClassification.idColumn) : '';
        this.columnInputs.outcome = this.columnToString(savedOptions.columnClassification.outcomeColumn);
        this.columnInputs.covariates = this.columnsToString(savedOptions.columnClassification.covariateColumns);
        this.columnInputs.omics = this.columnsToString(savedOptions.columnClassification.omicsColumns);
      }
    }
  }



  validateColumnInput() {
    const preview = this.filePreview();
    if (!preview) return;

    // Validate each input
    this.columnErrors.id = this.validateSingleColumn(this.columnInputs.id, preview.headers, false);
    this.columnErrors.outcome = this.validateSingleColumn(this.columnInputs.outcome, preview.headers, true);
    this.columnErrors.covariates = this.validateColumns(this.columnInputs.covariates, preview.headers, false);
    this.columnErrors.omics = this.validateColumns(this.columnInputs.omics, preview.headers, true);

    // Check for overlaps
    const allColumns = new Set<string | number>();
    const checkOverlap = (cols: (string | number)[], name: string) => {
      for (const col of cols) {
        if (allColumns.has(col)) {
          return `${name} contiene colonne già selezionate`;
        }
        allColumns.add(col);
      }
      return '';
    };

    // Update column classification
    const idCol = this.parseSingleColumn(this.columnInputs.id, preview.headers);
    const outcomeCol = this.parseSingleColumn(this.columnInputs.outcome, preview.headers);
    const covariateCols = this.parseColumnInput(this.columnInputs.covariates, preview.headers);
    const omicsCols = this.parseColumnInput(this.columnInputs.omics, preview.headers);

    // Check overlaps
    if (idCol !== null) {
      const overlap = checkOverlap([idCol], 'ID');
      if (overlap) this.columnErrors.id = overlap;
    }
    if (outcomeCol !== null) {
      const overlap = checkOverlap([outcomeCol], 'Outcome');
      if (overlap) this.columnErrors.outcome = overlap;
    }
    if (!this.columnErrors.covariates) {
      const overlap = checkOverlap(covariateCols, 'Covariate');
      if (overlap) this.columnErrors.covariates = overlap;
    }
    if (!this.columnErrors.omics) {
      const overlap = checkOverlap(omicsCols, 'Dati omici');
      if (overlap) this.columnErrors.omics = overlap;
    }

    // Update options
    this.options.columnClassification = {
      idColumn: idCol,
      outcomeColumn: outcomeCol !== null ? outcomeCol : '',
      covariateColumns: covariateCols,
      omicsColumns: omicsCols,
      categoricalColumns: this.options.columnClassification.categoricalColumns.filter(
        col => [...covariateCols, ...omicsCols, outcomeCol].some(c => c === col)
      )
    };
  }

  private validateSingleColumn(input: string, headers: string[], required: boolean): string {
    if (!input.trim()) {
      return required ? 'Campo obbligatorio' : '';
    }

    const col = this.parseSingleColumn(input, headers);
    if (col === null && input.trim()) {
      return 'Colonna non valida';
    }

    return '';
  }

  private validateColumns(input: string, headers: string[], required: boolean): string {
    if (!input.trim()) {
      return required ? 'Seleziona almeno una colonna' : '';
    }

    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    
    for (const part of parts) {
      if (part.includes('-')) {
        // Range validation (1-based indices)
        const [start, end] = part.split('-').map(p => p.trim());
        const startNum = parseInt(start);
        const endNum = parseInt(end);
        
        if (isNaN(startNum) || isNaN(endNum)) {
          return `Range non valido: ${part}`;
        }
        if (startNum < 1 || endNum > headers.length) {
          return `Indici fuori range: ${part} (1-${headers.length})`;
        }
        if (startNum > endNum) {
          return `Range non valido: ${part}`;
        }
      } else if (!isNaN(parseInt(part))) {
        // Index validation (1-based)
        const index = parseInt(part);
        if (index < 1 || index > headers.length) {
          return `Indice fuori range: ${part} (1-${headers.length})`;
        }
      } else {
        // Name validation
        if (!headers.includes(part)) {
          return `Colonna non trovata: ${part}`;
        }
      }
    }
    
    return '';
  }

  private parseSingleColumn(input: string, headers: string[]): string | number | null {
    if (!input.trim()) return null;

    const trimmed = input.trim();
    
    if (!isNaN(parseInt(trimmed))) {
      // Convert 1-based to 0-based index
      const index = parseInt(trimmed) - 1;
      if (index >= 0 && index < headers.length) {
        return index;
      }
    } else if (headers.includes(trimmed)) {
      return trimmed;
    }
    
    return null;
  }

  private parseColumnInput(input: string, headers: string[]): (string | number)[] {
    if (!input.trim()) return [];

    const result: (string | number)[] = [];
    const parts = input.split(',').map(p => p.trim()).filter(p => p);
    
    for (const part of parts) {
      if (part.includes('-')) {
        // Handle range (1-based)
        const [start, end] = part.split('-').map(p => parseInt(p.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start - 1; i <= end - 1 && i < headers.length; i++) {
            if (i >= 0) result.push(i);
          }
        }
      } else if (!isNaN(parseInt(part))) {
        // Handle index (1-based)
        const index = parseInt(part) - 1;
        if (index >= 0 && index < headers.length) {
          result.push(index);
        }
      } else {
        // Handle name
        if (headers.includes(part)) {
          result.push(part);
        }
      }
    }
    
    return [...new Set(result)]; // Remove duplicates
  }

  private columnToString(column: string | number | undefined): string {
    if (column === undefined || column === '') return '';
    if (typeof column === 'number') {
      return (column + 1).toString(); // Convert to 1-based
    }
    return column;
  }

  private columnsToString(columns: (string | number)[]): string {
    return columns.map(col => this.columnToString(col)).join(', ');
  }

  getSelectedColumn(type: 'id' | 'outcome'): string | null {
    const preview = this.filePreview();
    if (!preview) return null;

    const column = type === 'id' ? this.options.columnClassification.idColumn :
                  this.options.columnClassification.outcomeColumn;

    if (column === null || column === '') return null;

    if (typeof column === 'number') {
      return preview.headers[column] || `[${column + 1}]`;
    }
    return column;
  }

  getSelectedColumns(type: 'covariates' | 'omics'): string[] {
    const preview = this.filePreview();
    if (!preview) return [];

    const columns = type === 'covariates' ? this.options.columnClassification.covariateColumns :
                   this.options.columnClassification.omicsColumns;

    return columns.map(col => {
      if (typeof col === 'number') {
        return preview.headers[col] || `[${col + 1}]`;
      }
      return col;
    });
  }

  getAllClassifiedColumns(): { value: string | number, display: string }[] {
    const preview = this.filePreview();
    if (!preview) return [];

    const result: { value: string | number, display: string }[] = [];
    const classification = this.options.columnClassification;

    // Add outcome
    if (classification.outcomeColumn) {
      result.push({
        value: classification.outcomeColumn,
        display: this.getColumnDisplay(classification.outcomeColumn, preview.headers) + ' (Outcome)'
      });
    }

    // Add covariates
    classification.covariateColumns.forEach(col => {
      result.push({
        value: col,
        display: this.getColumnDisplay(col, preview.headers) + ' (Covariate)'
      });
    });

    // Add omics
    classification.omicsColumns.forEach(col => {
      result.push({
        value: col,
        display: this.getColumnDisplay(col, preview.headers) + ' (Omics)'
      });
    });

    return result;
  }

  private getColumnDisplay(col: string | number, headers: string[]): string {
    if (typeof col === 'number') {
      return headers[col] || `[${col + 1}]`;
    }
    return col;
  }

  isCategorical(column: string | number): boolean {
    return this.options.columnClassification.categoricalColumns.includes(column);
  }

  toggleCategorical(column: string | number) {
    const arr = this.options.columnClassification.categoricalColumns;
    if (arr.includes(column)) {
      this.options.columnClassification.categoricalColumns = arr.filter(c => c !== column);
    } else {
      this.options.columnClassification.categoricalColumns = [...arr, column];
    }
  }

  isValid(): boolean {
    // Check required fields
    const hasOutcome = this.options.columnClassification.outcomeColumn !== '' && 
                      this.options.columnClassification.outcomeColumn !== null;
    const hasOmics = this.options.columnClassification.omicsColumns.length > 0;
    
    // Check no errors
    const noErrors = !this.columnErrors.id && 
                    !this.columnErrors.outcome && 
                    !this.columnErrors.covariates && 
                    !this.columnErrors.omics;

    return hasOutcome && hasOmics && noErrors;
  }

  goBack() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.navigationService.navigateToStep('upload');
  }

  analyzeMissingData() {
    if (!this.enableMissingDataRemoval) {
      this.columnsToRemove = [];
      this.missingDataAnalysis = {};
      if (!this.options.missingDataRemoval) {
        this.options.missingDataRemoval = { enabled: false, threshold: this.missingDataThreshold, columnsToRemove: [] };
      } else {
        this.options.missingDataRemoval.enabled = false;
      }
      return;
    }

    const preview = this.filePreview();
    if (!preview) return;

    this.missingDataAnalysis = {};
    
    // Analyze only classified columns (covariates + omics)
    const allClassifiedColumns = this.getAllAnalyzableColumns();
    
    // For each column, calculate percentage of missing data
    allClassifiedColumns.forEach(colName => {
      let missingCount = 0;
      const totalRows = preview.rows.length;
      
      // Find column index
      const colIndex = preview.headers.indexOf(colName);
      if (colIndex === -1) return;
      
      // Count missing values in preview rows
      preview.rows.forEach(row => {
        const cellValue = row[colIndex];
        if (this.isMissingValue(cellValue)) {
          missingCount++;
        }
      });
      
      // Calculate percentage (estimate based on preview)
      const missingPercentage = totalRows > 0 ? (missingCount / totalRows) * 100 : 0;
      this.missingDataAnalysis[colName] = missingPercentage;
    });
    
    this.updateColumnsToRemove();
  }

  updateColumnsToRemove() {
    this.columnsToRemove = [];
    
    Object.entries(this.missingDataAnalysis).forEach(([colName, missingPercentage]) => {
      if (missingPercentage > this.missingDataThreshold) {
        this.columnsToRemove.push({
          name: colName,
          missingPercentage: missingPercentage
        });
      }
    });
    
    // Sort by missing percentage (descending)
    this.columnsToRemove.sort((a, b) => b.missingPercentage - a.missingPercentage);
    
    // Update options
    this.options.missingDataRemoval = {
      enabled: this.enableMissingDataRemoval,
      threshold: this.missingDataThreshold,
      columnsToRemove: this.columnsToRemove.map(col => col.name)
    };
  }

  getAllAnalyzableColumns(): string[] {
    const covariateColumns = this.getSelectedColumns('covariates')
      .filter(col => typeof col === 'string') as string[];
    const omicsColumns = this.getSelectedColumns('omics')
      .filter(col => typeof col === 'string') as string[];
    
    return [...covariateColumns, ...omicsColumns];
  }

   isMissingValue(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      return trimmed === '' || 
             trimmed === 'na' || 
             trimmed === 'nan' || 
             trimmed === 'null' || 
             trimmed === 'n/a' ||
             trimmed === '#n/a' ||
             trimmed === 'missing';
    }
    if (typeof value === 'number') {
      return isNaN(value);
    }
    return false;
  }

  getColumnsWithoutMissing(): number {
    return Object.values(this.missingDataAnalysis).filter(percentage => percentage === 0).length;
  }

  async processAndContinue() {
    if (!this.isValid() || this.processing()) return;

    const fileData = this.dataFlowService.fileData();
    if (!fileData) return;

    this.processing.set(true);

    try {
      // Send file for preprocessing
      const processedBlob = await this.apiService.preprocessFile(
        fileData.file,
        { ...this.options, sessionId: this.sessionId, userId: this.userId }
      ).toPromise();

      if (!processedBlob) {
        throw new Error('No processed file received');
      }

      // Create new File from blob
      const processedFile = new File(
        [processedBlob], 
        `processed_${fileData.fileName}`,
        { type: processedBlob.type }
      );

      // Update file data with processed file
      this.dataFlowService.setFileData({
        ...fileData,
        processedFile,
        sessionId: this.sessionId,
        userId: this.userId
      });

      // Save preprocessing options (propaga sessionId e userId)
      this.dataFlowService.setPreprocessingOptions({ ...this.options, sessionId: this.sessionId, userId: this.userId });
      this.navigationService.updateNavigationStatus();
      
      // Navigate to analysis
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.navigationService.navigateToStep('analysis');
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Errore durante l\'elaborazione del file. Riprova.');
    } finally {
      this.processing.set(false);
    }
  }

  getMissingDataAnalysisCount(): number {
    return Object.keys(this.missingDataAnalysis).length;
  }
}
