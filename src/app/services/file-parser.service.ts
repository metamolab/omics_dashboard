import { Injectable } from '@angular/core';
import { FilePreview } from '../models/interfaces';

@Injectable({
  providedIn: 'root'
})
export class FileParserService {
  
  async parseFile(file: File, maxRows: number = 10): Promise<FilePreview> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'csv':
        return this.parseCSV(file, maxRows);
      case 'json':
        return this.parseJSON(file, maxRows);
      case 'xlsx':
      case 'xls':
        return this.parseExcel(file, maxRows);
      default:
        throw new Error('Formato file non supportato');
    }
  }

  private async parseCSV(file: File, maxRows: number): Promise<FilePreview> {
    const text = await file.text();
    const lines = text.trim().split('\n');
    
    if (lines.length === 0) {
      throw new Error('File CSV vuoto');
    }

    // Parse headers
    const headers = this.parseCSVLine(lines[0]);
    
    // Parse rows
    const rows: any[][] = [];
    for (let i = 1; i < Math.min(lines.length, maxRows + 1); i++) {
      if (lines[i].trim()) {
        rows.push(this.parseCSVLine(lines[i]));
      }
    }

    return {
      headers,
      rows,
      totalRows: lines.length - 1
    };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private async parseJSON(file: File, maxRows: number): Promise<FilePreview> {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!Array.isArray(data)) {
      throw new Error('Il file JSON deve contenere un array di oggetti');
    }
    
    if (data.length === 0) {
      throw new Error('File JSON vuoto');
    }

    const headers = Object.keys(data[0]);
    const rows = data.slice(0, maxRows).map(obj => 
      headers.map(header => obj[header]?.toString() || '')
    );

    return {
      headers,
      rows,
      totalRows: data.length
    };
  }

  private async parseExcel(file: File, maxRows: number): Promise<FilePreview> {
    // Per Excel, avresti bisogno di una libreria come SheetJS
    // Per ora restituisco un placeholder
    throw new Error('Parsing Excel richiede configurazione aggiuntiva. Usa CSV o JSON per ora.');
  }
}
