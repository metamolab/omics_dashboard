import { Component, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileParserService } from '../../services/file-parser.service';
import { ApiService } from '../../services/api.service';
import { SessionService } from '../../services/session.service';
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
        
        <!-- Recovery Mode Banner -->
        @if (dataFlowService.isRecoveryMode()) {
          <div class="recovery-mode-banner">
            <div class="banner-content">
              <h4>🔄 Modalità Recupero Analisi Attivata</h4>
              <p>Stai recuperando un'analisi esistente. Le opzioni di pre-processing sono state caricate dal file salvato.</p>
              <div class="banner-actions">
                <button class="secondary-btn" (click)="exitRecoveryMode()">
                  ✏️ Modifica Pre-processing
                </button>
                <button class="primary-btn" (click)="continueWithRecovery()">
                  ➡️ Continua con Analisi Esistente
                </button>
              </div>
            </div>
          </div>
        }
      </div>

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
            <p>Dati omici da includere (almeno 1 obbligatoria)</p>
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
            <p>{{ getCategoricalSectionDescription() }}</p>
            
            <!-- Show analysis type indicator -->
            @if (getAnalysisType() === 'classification') {
              <div class="analysis-type-indicator classification">
                
                <div class="indicator-content">
                  <h4>Analisi di Classificazione Rilevata</h4>
                  <p>La variabile outcome è marcata come categorica. Verranno mostrati test statistici e metodi appropriati per l'analisi di classificazione.</p>
                </div>
              </div>
            } @else {
              <div class="analysis-type-indicator regression">
                <div class="indicator-content">
                  <h4>Analisi di Regressione</h4>
                  <p>La variabile outcome è continua. Verranno mostrati test statistici e metodi appropriati per l'analisi di regressione.</p>
                </div>
              </div>
            }

            <!-- Helpful hint for classification -->
            @if (getAnalysisType() === 'regression' && options.columnClassification.outcomeColumn) {
              <div class="classification-hint">
                <div class="hint-content">
                  <h4>💡 Vuoi fare un'analisi di classificazione?</h4>
                  <p>Se la tua variabile outcome è categorica (es: malattia/sano, gruppo A/B/C), seleziona la casella "{{ getSelectedColumn('outcome') }} (Outcome)" qui sotto per attivare l'analisi di classificazione.</p>
                </div>
              </div>
            }

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

        <!-- Pulizia Dati -->
        <div class="options-section">
          <h2>Pulizia Dati</h2>
          <div class="options-grid">
            <div class="option-card">
              <label class="option-label">
                <input type="checkbox"
                  [(ngModel)]="options.removeNullValues"
                  [disabled]="options.fillMissingValues !== 'none'"
                  (change)="onRemoveNullValuesChange()">
                <span class="checkbox-custom"></span>
                <div class="option-content">
                  <h3>Rimuovi valori nulli</h3>
                  <p>Elimina righe con valori mancanti</p>
                </div>
              </label>
            </div>
            <div class="fill-method-card">
              <label for="fillMethod">Metodo di riempimento NA</label>
              <select id="fillMethod"
                [(ngModel)]="options.fillMissingValues"
                class="select-input"
                [disabled]="options.removeNullValues"
                (change)="onFillMissingValuesChange()">
                <option value="none">Non riempire</option>
                <option value="mean">Media</option>
                <option value="median">Mediana</option>
                <option value="knn5">KNN 5</option>
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
              <option value="scale">Scala</option>
              <option value="center">Centra</option>
              <option value="standardize">Standardizza</option>
              <option value="log">Log</option>
              <option value="log2">Log2</option>
              <option value="yeo-johnson">Yeo-Johnson</option>
            </select>
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
  `,

  styles: [`
    /* Layout & Structure */
    .content-wrapper {
      max-width: 100%;
      margin: 0 auto;
    }
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
      margin: 10px auto;
      color: #475569;
      font-size: 16px;
    }
    
    /* Recovery Mode Banner */
    .recovery-mode-banner {
      background: linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%);
      border: 2px solid #0284c7;
      border-radius: 12px;
      padding: 20px;
      margin: 16px 0 24px 0;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);
    }
    
    .banner-content h4 {
      margin: 0 0 8px 0;
      color: #0c4a6e;
      font-size: 18px;
      font-weight: 600;
    }
    
    .banner-content p {
      margin: 0 0 16px 0;
      color: #0369a1;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .banner-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .banner-actions .secondary-btn,
    .banner-actions .primary-btn {
      padding: 8px 16px;
      font-size: 14px;
    }
    .preview-section,
    .classification-section,
    .options-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
      margin-bottom: 24px;
      padding: 24px;
    }
    .file-info-bar {
      display: flex;
      gap: 24px;
      padding: 12px 16px;
      background: #f0f9ff;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #475569;
    }
    .table-container {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }
    .preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .preview-table th {
      background: #f8fafc;
      padding: 12px;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
      font-weight: 500;
      color: #0f172a;
    }
    .header-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .header-name {
      font-weight: 600;
    }
    .header-index {
      font-size: 11px;
      color: #64748b;
      font-weight: normal;
    }
    .preview-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .preview-table tr:hover {
      background: #f8fafc;
    }
    .index-col {
      background: #f8fafc;
      font-weight: 500;
      color: #64748b;
      text-align: center;
      width: 50px;
    }
    .preview-note {
      margin: 12px 0 0 0;
      font-size: 13px;
      color: #64748b;
      text-align: center;
    }
    .classification-section h2,
    .options-section h2 {
      margin: 0 0 20px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }
    .section-desc {
      margin: 0 0 20px 0;
      color: #64748b;
      font-size: 14px;
    }
    .classification-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }
    .classification-card,
    .option-card,
    .fill-method-card,
    .outlier-method-card,
    .options-card {
      background: #f0f9ff;
      border-radius: 6px;
      padding: 20px;
      border: 1px solid #bae6fd;
    }
    .classification-card.required {
      border: 2px solid #60a5fa;
      background: #eff6ff;
    }
    .classification-card.full-width {
      grid-column: 1 / -1;
    }
    .classification-card h3,
    .option-content h3 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }
    .classification-card p,
    .option-content p {
      margin: 0 0 12px 0;
      color: #64748b;
      font-size: 13px;
    }
    .column-input,
    .select-input {
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
    .outlier-method-card label,
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
    
    /* Classification Hint Styles */
    .classification-hint {
      background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
      border: 2px solid #fb923c;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    
    .hint-content h4 {
      margin: 0 0 8px 0;
      color: #9a3412;
      font-size: 16px;
      font-weight: 600;
    }
    
    .hint-content p {
      margin: 0;
      color: #c2410c;
      font-size: 14px;
      line-height: 1.4;
    }
    
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
    public dataFlowService: DataFlowService,
    private navigationService: NavigationService,
    private fileParserService: FileParserService,
    private apiService: ApiService,
    private sessionService: SessionService
  ) {}

  async ngOnInit() {
    // Check if file is uploaded
    const fileData = this.dataFlowService.fileData();
    if (!fileData) {
      this.navigationService.navigateToStep('upload');
      return;
    }

    this.fileName = fileData.fileName;

    // Use the centralized session service for consistent session management
    this.sessionId = this.sessionService.getSessionId();
    // console.log('[PREPROCESSING] Using session service - sessionId:', this.sessionId);

    // Setta userId come 'MasterTest' se non già presente
    let userId = window.sessionStorage.getItem('userId');
    if (!userId) {
      userId = 'MasterTest';
      window.sessionStorage.setItem('userId', userId);
    }
    this.userId = userId;
    this.options.sessionId = this.sessionId;
    this.options.userId = this.userId;

    // Load file preview
    try {
      let preview;
      if (fileData.file) {
        // For new uploaded files, parse the file
        preview = await this.fileParserService.parseFile(fileData.file);
        this.filePreview.set(preview);
      } else if (fileData.isRemote && fileData.preview) {
        // For remote files, use existing preview if available
        preview = fileData.preview;
        this.filePreview.set(preview);
      } else if (fileData.isRemote && fileData.remotePath) {
        // For remote files without preview, fetch the file from the API and parse it
        console.log('[PREPROCESSING] Fetching remote file for preview:', fileData.remotePath);
        
        try {
          // Extract sessionId and filename from the remote path
          // NEW: Handle my_files directory format: "my_files/filename" or "my_files\filename"
          // LEGACY: Handle user_sessions format: "user_sessions\{sessionId}\{filename}" (Windows) or "user_sessions/{sessionId}/{filename}" (Unix)
          console.log('[PREPROCESSING] Original remotePath:', fileData.remotePath);
          
          // Normalize path separators to work with both Windows and Unix paths
          const normalizedPath = fileData.remotePath.replace(/\\/g, '/');
          const pathParts = normalizedPath.split('/').filter(part => part.length > 0);
          console.log('[PREPROCESSING] Normalized path:', normalizedPath);
          console.log('[PREPROCESSING] Path parts:', pathParts);
          
          let sessionId = '';
          let filename = '';
          
          // Check if this is a my_files path
          const myFilesIndex = pathParts.findIndex(part => part === 'my_files');
          if (myFilesIndex !== -1) {
            // Handle my_files directory format
            sessionId = 'my_files';
            filename = pathParts[pathParts.length - 1]; // Last part is the filename
            console.log('[PREPROCESSING] Detected my_files format:', { sessionId, filename });
          } else {
            // LEGACY: Handle user_sessions format for compatibility
            const userSessionsIndex = pathParts.findIndex(part => part === 'user_sessions');
            if (userSessionsIndex !== -1 && userSessionsIndex < pathParts.length - 2) {
              sessionId = pathParts[userSessionsIndex + 1]; // Next part after "user_sessions"
              filename = pathParts[pathParts.length - 1]; // Last part is the filename
              console.log('[PREPROCESSING] Detected user_sessions format:', { sessionId, filename });
            } else {
              // Fallback: assume last two parts are sessionId and filename
              if (pathParts.length >= 2) {
                sessionId = pathParts[pathParts.length - 2];
                filename = pathParts[pathParts.length - 1];
                console.log('[PREPROCESSING] Using fallback format:', { sessionId, filename });
              }
            }
          }
          
          console.log('[PREPROCESSING] Final extracted values:', { sessionId, filename });
          
          if (!sessionId || !filename) {
            console.error('[PREPROCESSING] Failed to extract sessionId and filename. PathParts:', pathParts);
            throw new Error('Could not extract sessionId and filename from remotePath');
          }
          
          // Fetch the file blob from the API
          const fileBlob = await this.apiService.getSessionFile(sessionId, filename).toPromise();
          
          if (fileBlob) {
            // Convert blob to File object for parsing
            const file = new File([fileBlob], filename, { type: fileBlob.type });
            
            // Parse the file to create preview
            preview = await this.fileParserService.parseFile(file);
            this.filePreview.set(preview);
            
            console.log('[PREPROCESSING] Successfully created preview for remote file');
          }
        } catch (error) {
          console.error('[PREPROCESSING] Error fetching remote file for preview:', error);
          // Continue without preview - not critical for functionality
        }
      }
      
      // Update file data with preview and session info
      this.dataFlowService.setFileData({
        ...fileData,
        preview,
        sessionId: this.sessionId,
        userId: this.userId
      });
    } catch (error) {
      console.error('Error loading file preview:', error);
      // For remote files, this is not critical - we can proceed without preview
      if (!fileData.isRemote) {
        // For new uploads, preview is more important
        alert('Errore nel caricamento dell\'anteprima del file. Alcune funzionalità potrebbero non essere disponibili.');
      }
    }

    // Load existing options if available
    const savedOptions = this.dataFlowService.preprocessingOptions();
    if (savedOptions) {
      this.options = { ...savedOptions };
      
      // Restore missing data removal settings if they exist
      if (savedOptions.missingDataRemoval) {
        this.enableMissingDataRemoval = savedOptions.missingDataRemoval.enabled;
        this.missingDataThreshold = savedOptions.missingDataRemoval.threshold;
      }
      
      // Restore column inputs if classification exists
      if (savedOptions.columnClassification) {
        this.columnInputs.id = savedOptions.columnClassification.idColumn !== null ? 
          this.columnToString(savedOptions.columnClassification.idColumn) : '';
        this.columnInputs.outcome = this.columnToString(savedOptions.columnClassification.outcomeColumn);
        this.columnInputs.covariates = this.columnsToString(savedOptions.columnClassification.covariateColumns);
        this.columnInputs.omics = this.columnsToString(savedOptions.columnClassification.omicsColumns);
        
        // Trigger validation after restoring inputs
        setTimeout(() => {
          this.validateColumnInput();
        }, 100);
      }
    }

    // For remote files, we might want to analyze missing data if we have the preview
    if (fileData.isRemote && this.enableMissingDataRemoval && this.filePreview()) {
      setTimeout(() => {
        this.analyzeMissingData();
      }, 200);
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

    // Parse all columns to their normalized forms (names)
    const idCol = this.parseSingleColumn(this.columnInputs.id, preview.headers);
    const outcomeCol = this.parseSingleColumn(this.columnInputs.outcome, preview.headers);
    const covariateCols = this.parseColumnInput(this.columnInputs.covariates, preview.headers);
    const omicsCols = this.parseColumnInput(this.columnInputs.omics, preview.headers);

    // Normalize all columns to names for comparison
    const normalizeColumn = (col: string | number): string => {
      if (typeof col === 'number') {
        return preview.headers[col] || '';
      }
      return col;
    };

    // Convert all parsed columns to names
    const normalizedColumns = {
      id: idCol !== null ? normalizeColumn(idCol) : null,
      outcome: outcomeCol !== null ? normalizeColumn(outcomeCol) : null,
      covariates: covariateCols.map(normalizeColumn).filter(name => name !== ''),
      omics: omicsCols.map(normalizeColumn).filter(name => name !== '')
    };

    // Check for overlaps between all categories
    const allUsedColumns = new Set<string>();
    const overlaps: { [key: string]: string } = {};

    // Helper function to check and add columns
    const checkAndAddColumns = (columns: string[], categoryName: string, errorKey: string) => {
      for (const col of columns) {
        if (allUsedColumns.has(col)) {
          overlaps[errorKey] = `La colonna "${col}" è già utilizzata in un'altra categoria`;
        } else {
          allUsedColumns.add(col);
        }
      }
    };

    // Check ID column first
    if (normalizedColumns.id) {
      allUsedColumns.add(normalizedColumns.id);
    }

    // Check outcome column
    if (normalizedColumns.outcome) {
      if (allUsedColumns.has(normalizedColumns.outcome)) {
        overlaps['outcome'] = `La colonna "${normalizedColumns.outcome}" è già utilizzata come ID`;
      } else {
        allUsedColumns.add(normalizedColumns.outcome);
      }
    }

    // Check covariate columns
    checkAndAddColumns(normalizedColumns.covariates, 'Covariate', 'covariates');

    // Check omics columns
    checkAndAddColumns(normalizedColumns.omics, 'Omics', 'omics');

    // Apply overlap errors (only if no other validation errors exist)
    if (!this.columnErrors.id && overlaps['id']) this.columnErrors.id = overlaps['id'];
    if (!this.columnErrors.outcome && overlaps['outcome']) this.columnErrors.outcome = overlaps['outcome'];
    if (!this.columnErrors.covariates && overlaps['covariates']) this.columnErrors.covariates = overlaps['covariates'];
    if (!this.columnErrors.omics && overlaps['omics']) this.columnErrors.omics = overlaps['omics'];

    // Update options - always store column names instead of indices
    const headers = this.filePreview()?.headers || [];
    
    // Convert all columns to names for reliable matching in preprocessed files
    const convertToName = (col: string | number): string => {
      if (typeof col === 'number') {
        return headers[col] || '';
      }
      return col;
    };

    // Filter out null values and convert to names
    const allSelectedCols = [
      ...covariateCols, 
      ...omicsCols, 
      ...(outcomeCol !== null ? [outcomeCol] : [])
    ];

    this.options.columnClassification = {
      idColumn: idCol !== null ? convertToName(idCol) : null,
      outcomeColumn: outcomeCol !== null ? convertToName(outcomeCol) : '',
      covariateColumns: covariateCols.map(convertToName).filter(name => name !== ''),
      omicsColumns: omicsCols.map(convertToName).filter(name => name !== ''),
      categoricalColumns: this.options.columnClassification.categoricalColumns.filter(
        col => allSelectedCols.some(c => convertToName(c) === (typeof col === 'number' ? headers[col] : col))
      ).map(col => typeof col === 'number' ? headers[col] : col).filter(name => name !== '')
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

    // Add covariates ONLY (NO omics)
    classification.covariateColumns.forEach(col => {
      result.push({
        value: col,
        display: this.getColumnDisplay(col, preview.headers) + ' (Covariate)'
      });
    });

    // Omics columns are intentionally excluded from categorical/ordinal selection

    return result;
  }

  private getColumnDisplay(col: string | number, headers: string[]): string {
    if (typeof col === 'number') {
      return headers[col] || `[${col + 1}]`;
    }
    return col;
  }

  isCategorical(column: string | number): boolean {
    // Convert column to name if it's a number
    const headers = this.filePreview()?.headers || [];
    const columnName = typeof column === 'number' ? headers[column] : column;
    return this.options.columnClassification.categoricalColumns.includes(columnName);
  }

  toggleCategorical(column: string | number) {
    // Convert column to name if it's a number
    const headers = this.filePreview()?.headers || [];
    const columnName = typeof column === 'number' ? headers[column] : column;
    
    const arr = this.options.columnClassification.categoricalColumns;
    if (arr.includes(columnName)) {
      this.options.columnClassification.categoricalColumns = arr.filter(c => c !== columnName);
    } else {
      this.options.columnClassification.categoricalColumns = [...arr, columnName];
    }
  }

  isValid(): boolean {
    // For remote files that already have preprocessing options, we should be more lenient
    const fileData = this.dataFlowService.fileData();
    const isRemoteFile = fileData?.isRemote || false;
    
    // Check required fields
    const hasOutcome = this.options.columnClassification.outcomeColumn !== '' && 
                      this.options.columnClassification.outcomeColumn !== null;
    const hasOmics = this.options.columnClassification.omicsColumns.length > 0;
    
    // For remote files, we might not have run validation yet, so check if we have the basic structure
    if (isRemoteFile && hasOutcome && hasOmics) {
      // For existing analyses, trust the saved options even if validation hasn't run
      return true;
    }
    
    // For new files, check validation errors
    const noErrors = !this.columnErrors.id && 
                    !this.columnErrors.outcome && 
                    !this.columnErrors.covariates && 
                    !this.columnErrors.omics;

    return hasOutcome && hasOmics && noErrors;
  }

  // Add computed property for outcome type
  get outcomeType(): 'continuous' | 'categorical' | 'auto-detect' {
    const outcomeCol = this.options.columnClassification.outcomeColumn;
    if (!outcomeCol) return 'continuous';

    // Check if outcome is marked as categorical
    const outcomeName = typeof outcomeCol === 'number' ? 
      (this.filePreview()?.headers || [])[outcomeCol] : outcomeCol;
    
    // console.log('Checking outcome type:');
    // console.log('- Outcome column:', outcomeCol);
    // console.log('- Outcome name:', outcomeName);
    // console.log('- Categorical columns:', this.options.columnClassification.categoricalColumns);
    // console.log('- Is outcome in categorical list:', this.options.columnClassification.categoricalColumns.includes(outcomeName));
    
    if (this.options.columnClassification.categoricalColumns.includes(outcomeName)) {
      return 'categorical';
    }
    
    return 'continuous';
  }

  // Add method to get analysis type
  getAnalysisType(): 'regression' | 'classification' {
    return this.outcomeType === 'categorical' ? 'classification' : 'regression';
  }

  // Update the categorical selection section description
  getCategoricalSectionDescription(): string {
    const analysisType = this.getAnalysisType();
    if (analysisType === 'classification') {
      return 'Seleziona quali delle colonne già classificate sono categoriche/ordinali. La variabile outcome è marcata come categorica, quindi verrà eseguita un\'analisi di classificazione.';
    }
    return 'Seleziona quali delle colonne già classificate sono categoriche/ordinali';
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

    console.log('[PREPROCESSING] processAndContinue called with fileData:', {
      fileName: fileData.fileName,
      isRemote: fileData.isRemote,
      hasFile: !!fileData.file,
      hasProcessedFile: !!fileData.processedFile,
      hasRemotePath: !!fileData.remotePath
    });

    this.processing.set(true);

    try {
      // Check if this is recovery mode - only skip preprocessing if we're recovering an existing analysis
      const isRecoveryMode = this.dataFlowService.isRecoveryMode();
      
      if (isRecoveryMode && (fileData.isRemote || fileData.processedFile)) {
        console.log('[PREPROCESSING] Skipping API preprocessing for recovery mode');
        
        // For recovery mode, skip API preprocessing and just update the preprocessing options
        const preprocessingOptions = { 
          ...this.options, 
          columnClassification: {
            ...this.options.columnClassification,
            outcomeType: this.outcomeType
          },
          sessionId: this.sessionId, 
          userId: this.userId 
        };

        console.log('[PREPROCESSING] Saving preprocessing options for recovery:', preprocessingOptions);

        // Save preprocessing options
        this.dataFlowService.setPreprocessingOptions(preprocessingOptions);
        this.navigationService.updateNavigationStatus();
        
        // Navigate to analysis
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.navigationService.navigateToStep('analysis');
        return;
      }

      console.log('[PREPROCESSING] Proceeding with API preprocessing for new file');

      // For remote files that are not in recovery mode, fetch the file and apply new preprocessing
      if (fileData.isRemote && !fileData.file && !isRecoveryMode) {
        console.log('[PREPROCESSING] Fetching remote file for new preprocessing');
        
        try {
          // Extract sessionId and filename from the remote path
          const pathParts = fileData.remotePath?.split('/').filter(part => part.length > 0) || [];
          const normalizedPath = fileData.remotePath?.replace(/\\/g, '/') || '';
          const normalizedParts = normalizedPath.split('/').filter(part => part.length > 0);
          
          let sessionId = '';
          let filename = '';
          
          // Check if this is a my_files path
          const myFilesIndex = normalizedParts.findIndex(part => part === 'my_files');
          if (myFilesIndex !== -1) {
            // Handle my_files directory format
            sessionId = 'my_files';
            filename = normalizedParts[normalizedParts.length - 1];
          } else {
            // LEGACY: Handle user_sessions format for compatibility
            const userSessionsIndex = normalizedParts.findIndex(part => part === 'user_sessions');
            if (userSessionsIndex !== -1 && userSessionsIndex < normalizedParts.length - 2) {
              sessionId = normalizedParts[userSessionsIndex + 1];
              filename = normalizedParts[normalizedParts.length - 1];
            } else if (normalizedParts.length >= 2) {
              sessionId = normalizedParts[normalizedParts.length - 2];
              filename = normalizedParts[normalizedParts.length - 1];
            }
          }
          
          if (!sessionId || !filename) {
            throw new Error('Could not extract sessionId and filename from remotePath');
          }
          
          console.log('[PREPROCESSING] Fetching remote file:', { sessionId, filename });
          
          // Fetch the file blob from the API
          const fileBlob = await this.apiService.getSessionFile(sessionId, filename).toPromise();
          
          if (!fileBlob) {
            throw new Error('Failed to fetch remote file');
          }
          
          // Convert blob to File object for preprocessing
          const file = new File([fileBlob], filename, { type: fileBlob.type });
          
          console.log('[PREPROCESSING] Applying new preprocessing to fetched remote file');
          
          // Proceed with API preprocessing using the fetched file
          const preprocessingOptions = { 
            ...this.options, 
            columnClassification: {
              ...this.options.columnClassification,
              outcomeType: this.outcomeType
            },
            sessionId: this.sessionId, 
            userId: this.userId 
          };
          
          const processedBlob = await this.apiService.preprocessFile(
            file,
            preprocessingOptions
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

          // Update file data with both original fetched file and processed file
          // Clear remote status since we now have the actual files
          this.dataFlowService.setFileData({
            ...fileData,
            file, // Store the fetched original file
            processedFile,
            isRemote: false, // Clear remote status since we have the actual files
            remotePath: undefined, // Clear remote path
            sessionId: this.sessionId,
            userId: this.userId
          });

          // Save preprocessing options
          this.dataFlowService.setPreprocessingOptions(preprocessingOptions);
          this.navigationService.updateNavigationStatus();
          
          // Navigate to analysis
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this.navigationService.navigateToStep('analysis');
          return;
          
        } catch (error) {
          console.error('[PREPROCESSING] Error fetching and preprocessing remote file:', error);
          alert('Errore nel recupero e preprocessamento del file remoto. Riprova.');
          this.processing.set(false);
          return;
        }
      }

      // For new file uploads, proceed with API preprocessing
      if (!fileData.file) {
        throw new Error('No file available for preprocessing');
      }

      // Send file for preprocessing with outcome type
      const preprocessingOptions = { 
        ...this.options, 
        columnClassification: {
          ...this.options.columnClassification,
          outcomeType: this.outcomeType
        },
        sessionId: this.sessionId, 
        userId: this.userId 
      };
      
      const processedBlob = await this.apiService.preprocessFile(
        fileData.file,
        preprocessingOptions
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

      // Save preprocessing options with outcome type included
      this.dataFlowService.setPreprocessingOptions(preprocessingOptions);
      this.navigationService.updateNavigationStatus();
      
      // Navigate to analysis
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.navigationService.navigateToStep('analysis');
    } catch (error) {
      // console.error('Error processing file:', error);
      alert('Errore durante l\'elaborazione del file. Riprova.');
    } finally {
      this.processing.set(false);
    }
  }


  getMissingDataAnalysisCount(): number {
    return Object.keys(this.missingDataAnalysis).length;
  }

  // Exit recovery mode and allow new preprocessing
  exitRecoveryMode() {
    const confirmExit = confirm(
      'Vuoi uscire dalla modalità recupero e modificare le opzioni di pre-processing? ' +
      'Questo richiederà di ricaricare il file originale.'
    );
    
    if (confirmExit) {
      // Exit recovery mode
      this.dataFlowService.setRecoveryMode(false);
      
      // Clear current file data and preprocessing options
      this.dataFlowService.setFileData(null);
      this.dataFlowService.setPreprocessingOptions(null);
      
      // Navigate back to upload to select the original file
      this.navigationService.navigateToStep('upload');
    }
  }

  // Continue with the existing analysis in recovery mode
  continueWithRecovery() {
    // Save current preprocessing options and proceed to analysis
    const preprocessingOptions = { 
      ...this.options, 
      columnClassification: {
        ...this.options.columnClassification,
        outcomeType: this.outcomeType
      },
      sessionId: this.sessionId, 
      userId: this.userId 
    };

    this.dataFlowService.setPreprocessingOptions(preprocessingOptions);
    this.navigationService.updateNavigationStatus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.navigationService.navigateToStep('analysis');
  }

  // Gestione mutua esclusione tra rimozione valori nulli e riempimento NA
  onRemoveNullValuesChange() {
    if (this.options.removeNullValues) {
      this.options.fillMissingValues = 'none';
    }
  }

  onFillMissingValuesChange() {
    if (this.options.fillMissingValues !== 'none') {
      this.options.removeNullValues = false;
    }
  }
}
