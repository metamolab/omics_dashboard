import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataFlowService } from '../../services/data-flow.service';
import { NavigationService } from '../../services/navigation.service';
import { FileData } from '../../models/interfaces';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="content-wrapper">
      <div class="page-header">
        <h1>Carica il tuo file di dati</h1>
        <p>Seleziona un file CSV, Excel o JSON da analizzare</p>
      </div>

      <div class="upload-card">
        <div class="upload-area" 
             [class.drag-over]="isDragOver()"
             (dragover)="onDragOver($event)"
             (dragleave)="onDragLeave($event)"
             (drop)="onDrop($event)">
          
          <div class="upload-icon">📊</div>
          
          <p class="upload-text">
            Trascina qui il tuo file o 
            <label class="file-label">
              <input type="file" 
                     (change)="onFileSelected($event)"
                     accept=".csv,.xlsx,.xls,.json"
                     #fileInput>
              clicca per selezionare
            </label>
          </p>
          
          <p class="file-types">Formati supportati: CSV, Excel, JSON</p>
        </div>

        @if (selectedFile()) {
          <div class="file-info">
            <div class="file-details">
              <span class="file-name">{{ selectedFile()!.fileName }}</span>
              <span class="file-size">{{ formatFileSize(selectedFile()!.fileSize) }}</span>
            </div>
            <button class="remove-btn" (click)="removeFile()">✕</button>
          </div>
        }

        <button class="continue-btn" 
                [disabled]="!selectedFile()"
                (click)="continueToPreprocessing()">
          Continua
        </button>
      </div>
    </div>
  `,
  styles: [`
    .content-wrapper {
      max-width: 700px;
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

    .upload-card {
      background: white;
      border-radius: 8px;
      padding: 32px;
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
      margin-bottom: 16px;
      opacity: 0.6;
    }

    .upload-text {
      color: #475569;
      margin-bottom: 8px;
      font-size: 16px;
    }

    .file-label {
      color: #0284c7;
      cursor: pointer;
      font-weight: 500;
      text-decoration: none;
      border-bottom: 1px solid #0284c7;
    }

    .file-label:hover {
      color: #0369a1;
      border-bottom-color: #0369a1;
    }

    input[type="file"] {
      display: none;
    }

    .file-types {
      font-size: 14px;
      color: #64748b;
      margin: 0;
    }

    .file-info {
      margin-top: 24px;
      padding: 16px;
      background: #e0f2fe;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #bae6fd;
    }

    .file-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .file-name {
      font-weight: 500;
      color: #0f172a;
      font-size: 15px;
    }

    .file-size {
      font-size: 13px;
      color: #475569;
    }

    .remove-btn {
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 20px;
      padding: 4px 8px;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .remove-btn:hover {
      color: #dc2626;
      background-color: #fecaca;
    }

    .continue-btn {
      width: 100%;
      padding: 14px 24px;
      margin-top: 24px;
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .continue-btn:hover:not(:disabled) {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
    }

    .continue-btn:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }
  `]
})
export class FileUploadComponent implements OnInit {
  selectedFile = signal<FileData | null>(null);
  isDragOver = signal(false);

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
    }
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
