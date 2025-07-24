export interface FileData {
  file: File;
  fileName: string;
  fileSize: number;
  uploadDate: Date;
  preview?: FilePreview;
  processedFile?: File;
  sessionId?: string;
  userId?: string;
}

export interface FilePreview {
  headers: string[];
  rows: any[][];
  totalRows: number;
}

export interface ColumnClassification {
  idColumn: string | number | null;  // null means use row indices
  outcomeColumn: string | number | '';  // can be empty initially
  covariateColumns: (string | number)[];
  omicsColumns: (string | number)[];
  categoricalColumns: (string | number)[];
}

export interface PreprocessingOptions {
  removeNullValues: boolean;
  removeOutliers: boolean;
  transformation: string;
  fillMissingValues: string;
  columnClassification: ColumnClassification;
  customOptions?: any;
  sessionId?: string;
  userId?: string;
}

export interface AnalysisOptions {
  sessionId?: string;
  userId?: string;
  groupingMethod?: 'none' | 'tertiles' | 'threshold';
  thresholdValues?: number[];
  statisticalTests: string[];
  regressionAnalysis: boolean;
  clusteringMethod?: string;
  customAnalysis?: any;
}

export interface AnalysisRequest {
  sessionId: string;
  userId: string;
  file: File;
  preprocessingOptions: PreprocessingOptions;
  analysisOptions: AnalysisOptions;
}

export interface AnalysisResult {
  id: string;
  status: 'pending' | 'completed' | 'error';
  results?: any;
  error?: string;
  timestamp: Date;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  status: 'pending' | 'active' | 'completed' | 'disabled';
}
