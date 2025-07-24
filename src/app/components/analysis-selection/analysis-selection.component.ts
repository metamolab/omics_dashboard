import { Component, signal, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileParserService } from '../../services/file-parser.service';
import { PlotlyService } from '../../services/plotly.service';
import { AnalysisOptions, FilePreview } from '../../models/interfaces';

@Component({
  selector: 'app-analysis-selection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-wrapper">
      <div class="page-header">
        <h1>Seleziona le Analisi</h1>
        <p>Scegli quali test e metodologie applicare ai tuoi dati preprocessati</p>
      </div>

      <!-- Preprocessed File Preview -->
      @if (filePreview()) {
        <div class="preview-section">
          <h2>Anteprima File Preprocessato</h2>
          <div class="file-info-bar">
            <span>File: processed_{{ originalFileName }}</span>
            <span>Righe: {{ filePreview()!.totalRows }}</span>
            <span>Colonne: {{ filePreview()!.headers.length }}</span>
            <span class="status-badge">✓ Preprocessato</span>
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
                        @if (isOutcomeColumn(header)) {
                          <span class="column-badge outcome">Outcome</span>
                        }
                        @if (isOmicsColumn(header)) {
                          <span class="column-badge omics">Omics</span>
                        }
                        @if (isCovariateColumn(header)) {
                          <span class="column-badge covariate">Covariate</span>
                        }
                        @if (isIdColumn(header)) {
                          <span class="column-badge id">ID</span>
                        }
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
                      <td>{{ formatCell(cell) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          
          @if (filePreview()!.totalRows > 5) {
            <p class="preview-note">Mostrando solo le prime 5 righe di {{ filePreview()!.totalRows }}</p>
          }
        </div>
      }

      <!-- Grouping Method Section -->
      <div class="grouping-section">
        <h2>Metodo di Raggruppamento</h2>
        <p class="section-desc">Scegli come raggruppare i dati per i test bivariati (non applicabile a correlazioni)</p>
        
        <div class="grouping-container">
          <div class="grouping-options">
            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="none"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Nessun Raggruppamento</h3>
                <p>Usa la variabile outcome così com'è (deve essere già categorica)</p>
              </div>
            </label>

            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="tertiles"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Divisione in Terzili</h3>
                <p>Dividi automaticamente l'outcome in tre gruppi uguali</p>
              </div>
            </label>

            <label class="radio-option">
              <input type="radio" 
                     name="grouping" 
                     value="threshold"
                     [(ngModel)]="options.groupingMethod"
                     (change)="onGroupingMethodChange()">
              <span class="radio-custom"></span>
              <div class="option-content">
                <h3>Soglie Personalizzate</h3>
                <p>Definisci i valori di cutoff per creare gruppi</p>
              </div>
            </label>
          </div>

          @if (options.groupingMethod === 'threshold') {
            <div class="threshold-input">
              <label>Valori Soglia (separati da virgola)</label>
              <input type="text" 
                     [(ngModel)]="thresholdInput"
                     placeholder="es: 0.5, 1.5 (crea 3 gruppi: <0.5, 0.5-1.5, >1.5)"
                     class="threshold-input-field"
                     (input)="validateThresholds()">
              @if (thresholdError) {
                <span class="error-text">{{ thresholdError }}</span>
              }
              @if (thresholdInfo) {
                <span class="info-text">{{ thresholdInfo }}</span>
              }
            </div>
          }

          <!-- Outcome Distribution Histogram -->
          @if (outcomeValues.length > 0) {
            <div class="outcome-histogram">
              <h3>Distribuzione Outcome</h3>
              <div #outcomeHistogram class="histogram-plot"></div>
            </div>
          }
        </div>
      </div>

      <div class="analysis-container">
        <!-- Statistical Tests Section -->
        <div class="analysis-section">
          <h2>Test Statistici Bivariati</h2>
          <p class="section-desc">Confronta i gruppi definiti sopra</p>
          
          <div class="test-category">
            <h3>Test Parametrici</h3>
            <div class="test-grid">
              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('student-t')"
                         (change)="toggleTest('student-t')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Student T-Test</h4>
                    <p>Per dati normali con varianze uguali</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('welch-t')"
                         (change)="toggleTest('welch-t')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Welch T-Test</h4>
                    <p>Per dati normali con varianze diverse</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('anova')"
                         (change)="toggleTest('anova')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>ANOVA</h4>
                    <p>Confronto tra più gruppi (varianze uguali)</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('welch-anova')"
                         (change)="toggleTest('welch-anova')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Welch ANOVA</h4>
                    <p>Confronto tra più gruppi (varianze diverse)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="test-category">
            <h3>Test Non Parametrici</h3>
            <div class="test-grid">
              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('wilcoxon')"
                         (change)="toggleTest('wilcoxon')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Wilcoxon Test</h4>
                    <p>Alternativa non parametrica al T-Test</p>
                  </div>
                </label>
              </div>

              <div class="test-card">
                <label class="test-label">
                  <input type="checkbox" 
                         [checked]="isTestSelected('kruskal-wallis')"
                         (change)="toggleTest('kruskal-wallis')">
                  <span class="checkbox-custom"></span>
                  <div class="test-content">
                    <h4>Kruskal-Wallis</h4>
                    <p>Alternativa non parametrica all'ANOVA</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Correlation Tests Section -->
        <div class="analysis-section">
          <h2>Test di Correlazione</h2>
          <p class="section-desc">Analizza le relazioni tra variabili continue</p>
          
          <div class="test-grid">
            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" 
                       [checked]="isTestSelected('pearson')"
                       (change)="toggleTest('pearson')">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Correlazione di Pearson</h4>
                  <p>Per relazioni lineari tra variabili normali</p>
                </div>
              </label>
            </div>

            <div class="test-card">
              <label class="test-label">
                <input type="checkbox" 
                       [checked]="isTestSelected('spearman')"
                       (change)="toggleTest('spearman')">
                <span class="checkbox-custom"></span>
                <div class="test-content">
                  <h4>Correlazione di Spearman</h4>
                  <p>Per relazioni monotone, non parametrica</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Additional Analyses -->
        <div class="analysis-section">
          <h2>Analisi Aggiuntive</h2>
          <div class="additional-grid">
            <div class="analysis-card">
              <label class="analysis-label">
                <input type="checkbox" [(ngModel)]="options.regressionAnalysis">
                <span class="checkbox-custom"></span>
                <div class="analysis-content">
                  <h3>Analisi di Regressione</h3>
                  <p>Modella le relazioni predittive</p>
                </div>
              </label>
            </div>

          </div>
        </div>

        <div class="button-group">
          <button class="secondary-btn" (click)="goBack()">Indietro</button>
          <button class="primary-btn" 
                  [disabled]="!isValid()"
                  (click)="submitAnalysis()">
            Avvia Analisi
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .info-text {
      display: block;
      color: #0284c7;
      font-size: 12px;
      margin-top: 4px;
    }
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
      margin: 0;
      color: #475569;
      font-size: 16px;
    }

    /* Preview Section */
    .preview-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .preview-section h2 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .file-info-bar {
      display: flex;
      gap: 24px;
      align-items: center;
      padding: 12px 16px;
      background: #f0f9ff;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #475569;
    }

    .status-badge {
      margin-left: auto;
      background: #10b981;
      color: white;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .table-container {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      max-height: 300px;
      overflow-y: auto;
    }

    .preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .preview-table th {
      background: #f8fafc;
      padding: 10px;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
      font-weight: 500;
      color: #0f172a;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .header-name {
      font-weight: 600;
    }

    .column-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 500;
    }

    .column-badge.outcome {
      background: #fbbf24;
      color: #78350f;
    }

    .column-badge.omics {
      background: #a78bfa;
      color: #2e1065;
    }

    .column-badge.covariate {
      background: #60a5fa;
      color: #1e3a8a;
    }

    .column-badge.id {
      background: #86efac;
      color: #14532d;
    }

    .preview-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
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

    /* Grouping Section */
    .grouping-section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .grouping-section h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .section-desc {
      margin: 0 0 20px 0;
      color: #64748b;
      font-size: 14px;
    }

    .grouping-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .radio-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #f0f9ff;
      border: 2px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .radio-option:hover {
      border-color: #60a5fa;
    }

    .radio-option input[type="radio"] {
      display: none;
    }

    .radio-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #93c5fd;
      border-radius: 50%;
      background: white;
      position: relative;
      flex-shrink: 0;
      margin-top: 2px;
      transition: all 0.2s;
    }

    .radio-option input[type="radio"]:checked + .radio-custom {
      border-color: #0284c7;
    }

    .radio-custom::after {
      content: '';
      position: absolute;
      width: 10px;
      height: 10px;
      background: #0284c7;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .radio-option input[type="radio"]:checked + .radio-custom::after {
      opacity: 1;
    }

    .radio-option input[type="radio"]:checked ~ .option-content h3 {
      color: #0284c7;
    }

    .option-content h3 {
      margin: 0 0 4px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .option-content p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }

    .threshold-input {
      margin-top: 16px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .threshold-input label {
      display: block;
      margin-bottom: 8px;
      color: #0f172a;
      font-weight: 500;
      font-size: 14px;
    }

    .threshold-input-field {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .threshold-input-field:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }

    /* Analysis Container */
    .analysis-container {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border: 1px solid #bae6fd;
    }

    .analysis-section {
      margin-bottom: 32px;
    }

    .analysis-section:last-of-type {
      margin-bottom: 0;
    }

    .analysis-section h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 20px;
      font-weight: 500;
    }

    .test-category {
      margin-bottom: 24px;
    }

    .test-category h3 {
      margin: 0 0 16px 0;
      color: #334155;
      font-size: 16px;
      font-weight: 500;
    }

    .test-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .test-card, .analysis-card {
      background: #f0f9ff;
      border-radius: 6px;
      padding: 20px;
      transition: all 0.2s;
      border: 1px solid #bae6fd;
    }

    .test-card:hover, .analysis-card:hover {
      border-color: #60a5fa;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .test-label, .analysis-label {
      display: flex;
      align-items: flex-start;
      cursor: pointer;
      gap: 16px;
    }

    .test-label input[type="checkbox"],
    .analysis-label input[type="checkbox"] {
      display: none;
    }

    .checkbox-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #93c5fd;
      border-radius: 4px;
      background: white;
      position: relative;
      flex-shrink: 0;
      transition: all 0.2s ease;
      margin-top: 2px;
    }

    .test-label input[type="checkbox"]:checked + .checkbox-custom,
    .analysis-label input[type="checkbox"]:checked + .checkbox-custom {
      background: #0284c7;
      border-color: #0284c7;
    }

    .checkbox-custom::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .test-label input[type="checkbox"]:checked + .checkbox-custom::after,
    .analysis-label input[type="checkbox"]:checked + .checkbox-custom::after {
      opacity: 1;
    }

    .test-content h4, .analysis-content h3 {
      margin: 0 0 4px 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 500;
    }

    .test-content p, .analysis-content p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }

    .info-text {
      display: block;
      color: #0284c7;
      font-size: 12px;
      margin-top: 4px;
    }

    .additional-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .analysis-card label {
      display: block;
      margin-bottom: 8px;
      color: #0f172a;
      font-weight: 500;
    }

    .select-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-size: 15px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s;
      color: #1e293b;
    }

    .select-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }

    .button-group {
      display: flex;
      gap: 16px;
      justify-content: flex-end;
      margin-top: 32px;
    }

    .primary-btn, .secondary-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .secondary-btn {
      background: white;
      color: #334155;
      border: 1px solid #93c5fd;
    }

    .secondary-btn:hover {
      background: #f0f9ff;
      border-color: #60a5fa;
    }

    .primary-btn {
      background: #0284c7;
      color: white;
    }

    .primary-btn:hover:not(:disabled) {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }

    .primary-btn:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }

    .error-text {
      display: block;
      color: #dc2626;
      font-size: 12px;
      margin-top: 4px;
    }
  `]
})
export class AnalysisSelectionComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('outcomeHistogram') outcomeHistogram?: ElementRef;

  // Test categories
  correlationTests = ['pearson', 'spearman'];
  bivariateTests = ['student-t', 'welch-t', 'wilcoxon', 'anova', 'welch-anova', 'kruskal-wallis'];

  statisticalTests = [
    { id: 'student-t', name: 'Student T-Test', description: 'Per dati normali con varianze uguali', category: 'parametric' },
    { id: 'welch-t', name: 'Welch T-Test', description: 'Per dati normali con varianze diverse', category: 'parametric' },
    { id: 'wilcoxon', name: 'Wilcoxon Test', description: 'Alternativa non parametrica al T-Test', category: 'nonparametric' },
    { id: 'anova', name: 'ANOVA', description: 'Confronto tra più gruppi (varianze uguali)', category: 'parametric' },
    { id: 'welch-anova', name: 'Welch ANOVA', description: 'Confronto tra più gruppi (varianze diverse)', category: 'parametric' },
    { id: 'kruskal-wallis', name: 'Kruskal-Wallis', description: 'Alternativa non parametrica all\'ANOVA', category: 'nonparametric' },
    { id: 'pearson', name: 'Pearson Correlation', description: 'Per relazioni lineari tra variabili normali', category: 'correlation' },
    { id: 'spearman', name: 'Spearman Correlation', description: 'Per relazioni monotone, non parametrica', category: 'correlation' }
  ];

 options: AnalysisOptions = {
    groupingMethod: 'none',
    thresholdValues: [],
    statisticalTests: [],
    regressionAnalysis: false
  };

  filePreview = signal<FilePreview | null>(null);
  originalFileName = '';
  thresholdInput = '';
  thresholdError = '';
  thresholdInfo = '';
  outcomeValues: number[] = [];
  tertiles: number[] = [];

  // Store preprocessing info
  preprocessingInfo: any = null;

  constructor(
    private router: Router,
    private dataFlowService: DataFlowService,
    private navigationService: NavigationService,
    private fileParserService: FileParserService,
    private plotlyService: PlotlyService
  ) {}

  async ngOnInit() {
    // Check prerequisites
    const fileData = this.dataFlowService.fileData();
    const preprocessingOptions = this.dataFlowService.preprocessingOptions();
    
    if (!fileData || !preprocessingOptions) {
      this.navigationService.navigateToStep('upload');
      return;
    }

    this.originalFileName = fileData.fileName;
    this.preprocessingInfo = preprocessingOptions;

    // Load preview of preprocessed file
    if (fileData.processedFile) {
      try {
        const preview = await this.fileParserService.parseFile(fileData.processedFile, 5);
        this.filePreview.set(preview);
        
        // Extract outcome values for histogram
        await this.extractOutcomeValues(fileData.processedFile);
      } catch (error) {
        console.error('Error parsing preprocessed file:', error);
      }
    }

    // Load existing options
    const savedOptions = this.dataFlowService.analysisOptions();
    if (savedOptions) {
      this.options = { ...savedOptions };
      if (this.options.thresholdValues && this.options.thresholdValues.length > 0) {
        this.thresholdInput = this.options.thresholdValues.join(', ');
      }
    }
  }

  ngAfterViewInit() {
    // Create histogram after view is initialized
    if (this.outcomeValues.length > 0) {
      setTimeout(() => this.createOutcomeHistogram(), 100);
    }
  }

  async extractOutcomeValues(file: File) {
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = this.parseCSVLine(lines[0]);
      
      // Find outcome column index
      const outcomeCol = this.preprocessingInfo?.columnClassification?.outcomeColumn;
      if (outcomeCol === undefined || outcomeCol === '') return;
      
      let outcomeIndex: number;
      if (typeof outcomeCol === 'number') {
        outcomeIndex = outcomeCol;
      } else {
        outcomeIndex = headers.indexOf(outcomeCol);
      }
      
      if (outcomeIndex === -1) return;
      
      // Extract outcome values
      this.outcomeValues = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const row = this.parseCSVLine(lines[i]);
          const value = parseFloat(row[outcomeIndex]);
          if (!isNaN(value)) {
            this.outcomeValues.push(value);
          }
        }
      }
      
      // Calculate tertiles
      if (this.outcomeValues.length > 0) {
        const sorted = [...this.outcomeValues].sort((a, b) => a - b);
        this.tertiles = [
          sorted[Math.floor(sorted.length / 3)],
          sorted[Math.floor(2 * sorted.length / 3)]
        ];
      }
    } catch (error) {
      console.error('Error extracting outcome values:', error);
    }
  }

  // Improved CSV parser: handles escaped quotes and commas inside quotes
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  }

  createOutcomeHistogram() {
    if (!this.outcomeHistogram?.nativeElement || this.outcomeValues.length === 0) return;

    const data = [{
      x: this.outcomeValues,
      type: 'histogram',
      nbinsx: 40,
      marker: {
        color: '#0284c7',
        opacity: 0.7
      },
      name: 'Outcome'
    }];

    const layout = {
      title: '',
      xaxis: { 
        title: 'Outcome',
        titlefont: { size: 14 }
      },
      yaxis: { 
        title: 'Frequenza',
        titlefont: { size: 14 }
      },
      margin: { t: 10, r: 20, b: 40, l: 50 },
      plot_bgcolor: '#f8fafc',
      paper_bgcolor: '#f8fafc',
      shapes: [] as any[],
      annotations: [] as any[]
    };

    // Add vertical lines for grouping
    if (this.options.groupingMethod === 'tertiles') {
      // Add tertile lines
      this.tertiles.forEach((value, index) => {
        layout.shapes.push({
          type: 'line',
          x0: value,
          x1: value,
          y0: 0,
          y1: 0.95,
          yref: 'paper',
          line: {
            color: '#ef4444',
            width: 2,
            dash: 'dashdot'
          }
        });
        layout.annotations.push({
          x: value,
          y: 1,
          yref: 'paper',
          text: `T${index + 1}: ${value.toFixed(3)}`,
          showarrow: false,
          font: {
            color: '#ef4444',
            size: 12
          }
        });
      });
    } else if (this.options.groupingMethod === 'threshold' && this.options.thresholdValues!.length > 0) {
      // Only show threshold lines within the min/max of the distribution
      const min = Math.min(...this.outcomeValues);
      const max = Math.max(...this.outcomeValues);
      const validThresholds = this.options.thresholdValues!.filter(v => v > min && v < max);
      validThresholds.forEach((value, index) => {
        layout.shapes.push({
          type: 'line',
          x0: value,
          x1: value,
          y0: 0,
          y1: 0.95,
          yref: 'paper',
          line: {
            color: '#10b981',
            width: 2,
            dash: 'dash'
          }
        });
        layout.annotations.push({
          x: value,
          y: 1.00,
          yref: 'paper',
          text: `S${index + 1}: ${value.toFixed(3)}`,
          showarrow: false,
          font: {
            color: '#10b981',
            size: 12
          }
        });
      });
    }

    const config = {
      responsive: true,
      displayModeBar: false
    };

    this.plotlyService.createPlot(this.outcomeHistogram.nativeElement, data, layout, config);
  }

  onGroupingMethodChange() {
    // Recreate histogram when grouping method changes
    if (this.outcomeValues.length > 0 && this.options.groupingMethod !== 'none') {
      setTimeout(() => this.createOutcomeHistogram(), 100);
    } else {

    }
  }

  // Generic column type checker
  private isColumnType(header: string, type: 'idColumn' | 'outcomeColumn' | 'omicsColumns' | 'covariateColumns'): boolean {
    const classification = this.preprocessingInfo?.columnClassification;
    if (!classification) return false;
    const headers = this.filePreview()?.headers || [];
    if (type === 'idColumn' || type === 'outcomeColumn') {
      const col = classification[type];
      if (col === null && header === 'row_id') return true;
      if (typeof col === 'number') {
        return col >= 0 && col < headers.length && headers[col] === header;
      }
      return col === header;
    } else {
      // omicsColumns or covariateColumns: support both index and name
      return (classification[type] as any[]).some((col: any) => {
        if (typeof col === 'string') {
          return col === header;
        } else if (typeof col === 'number') {
          return col >= 0 && col < headers.length && headers[col] === header;
        }
        return false;
      });
    }
  }

  isIdColumn(header: string): boolean {
    return this.isColumnType(header, 'idColumn');
  }
  isOutcomeColumn(header: string): boolean {
    return this.isColumnType(header, 'outcomeColumn');
  }
  isOmicsColumn(header: string): boolean {
    return this.isColumnType(header, 'omicsColumns');
  }
  isCovariateColumn(header: string): boolean {
    return this.isColumnType(header, 'covariateColumns');
  }

  formatCell(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      return value.toFixed(3);
    }
    return value.toString();
  }

  getColumnTypes(header: string): string[] {
    const types: string[] = [];
    if (this.isOutcomeColumn(header)) types.push('outcome');
    if (this.isOmicsColumn(header)) types.push('omics');
    if (this.isCovariateColumn(header)) types.push('covariate');
    if (this.isIdColumn(header)) types.push('id');
    return types;
  }

  validateThresholds() {
    this.thresholdError = '';
    this.thresholdInfo = '';
    if (!this.thresholdInput.trim()) {
      this.options.thresholdValues = [];
      this.createOutcomeHistogram(); // Update histogram
      return;
    }

    const values = this.thresholdInput.split(',').map(v => v.trim());
    const numbers: number[] = [];

    for (const value of values) {
      const num = parseFloat(value);
      if (isNaN(num)) {
        this.thresholdError = `Valore non valido: ${value}`;
        return;
      }
      numbers.push(num);
    }

    // Check if values are in ascending order (allow equality)
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] < numbers[i-1]) {
        this.thresholdError = 'I valori devono essere in ordine crescente o uguali';
        return;
      }
    }

    // Check if values are within the outcome distribution range
    if (this.outcomeValues.length > 0) {
      const min = Math.min(...this.outcomeValues);
      const max = Math.max(...this.outcomeValues);
      for (const num of numbers) {
        if (num <= min || num >= max) {
          this.thresholdError = `Tutti i valori devono essere compresi tra il minimo (${min}) e il massimo (${max}) della distribuzione.`;
          return;
        }
      }
    }

    // If there are coincident values, show info message
    const hasCoincident = numbers.length === 1 || numbers.some((v, i, arr) => i > 0 && v === arr[i-1]);
    if (hasCoincident) {
      this.thresholdInfo = 'Nota: con valori threshold coincidenti verranno creati solo due gruppi.';
    }

    this.options.thresholdValues = numbers;
    this.createOutcomeHistogram(); // Update histogram with new thresholds
  }

  isTestSelected(testId: string): boolean {
    return this.options.statisticalTests.includes(testId);
  }

  toggleTest(testId: string) {
    let newTests: string[];
    if (this.options.statisticalTests.includes(testId)) {
      newTests = this.options.statisticalTests.filter(t => t !== testId);
    } else {
      newTests = [...this.options.statisticalTests, testId];
    }
    this.options.statisticalTests = newTests;
  }

  isValid(): boolean {
    // Check if at least one test is selected
    const hasTests = this.options.statisticalTests.length > 0 ||
                    this.options.regressionAnalysis;

    // Check threshold validity if using threshold grouping
    if (this.options.groupingMethod === 'threshold') {
      // Also check that all threshold values are within the outcome range
      if (this.outcomeValues.length > 0 && this.options.thresholdValues && this.options.thresholdValues.length > 0) {
        const min = Math.min(...this.outcomeValues);
        const max = Math.max(...this.outcomeValues);
        const allInRange = this.options.thresholdValues.every(v => v > min && v < max);
        return hasTests && this.options.thresholdValues.length > 0 && !this.thresholdError && allInRange;
      }
      return false;
    }

    return hasTests;
  }

  goBack() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.navigationService.navigateToStep('preprocessing');
  }

  submitAnalysis() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Check if correlation tests are selected with grouping
    const hasCorrelations = this.options.statisticalTests.some(
      test => this.correlationTests.includes(test)
    );
    
    const hasBivariateTests = this.options.statisticalTests.some(
      test => this.bivariateTests.includes(test)
    );

    // Propaga sessionId in options
    const sessionId = window.sessionStorage.getItem('sessionId') || crypto.randomUUID();
    this.dataFlowService.setAnalysisOptions({ ...this.options, sessionId });
    this.navigationService.updateNavigationStatus();
    this.navigationService.navigateToStep('results');
  }

  ngOnDestroy() {
    // Clean up Plotly plot
    if (this.outcomeHistogram?.nativeElement) {
      this.plotlyService.purge(this.outcomeHistogram.nativeElement);
    }
  }
}