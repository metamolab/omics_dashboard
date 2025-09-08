# preprocess.R

library(jsonlite)
library(readr)
library(dplyr)
library(tidyr)
library(VIM)
library(tools)

# Funzioni helper per gli outlier
remove_outliers_iqr_tidy <- function(df) {
  df %>%
    mutate(across(
      where(is.numeric),
      ~ {
        Q1 <- quantile(.x, 0.25, na.rm = TRUE)
        Q3 <- quantile(.x, 0.75, na.rm = TRUE)
        IQR_val <- Q3 - Q1
        lower <- Q1 - 1.5 * IQR_val
        upper <- Q3 + 1.5 * IQR_val
        replace(.x, .x < lower | .x > upper, NA)
      }
    ))
}

remove_outliers_zscore_tidy <- function(df, threshold = 3) {
  df %>%
    mutate(across(
      where(is.numeric),
      ~ {
        mu <- mean(.x, na.rm = TRUE)
        sigma <- sd(.x, na.rm = TRUE)
        z <- (.x - mu) / sigma
        replace(.x, abs(z) > threshold, NA)
      }
    ))
}

preprocess_data <- function(temp_file, options) {
  
  if (!is.null(options$columnClassification)) {
    classification <- options$columnClassification
    
    # Se non c'è colonna ID, aggiungi indici righe
    if (is.null(classification$idColumn)) {
      temp_file <- cbind(row_id = seq_len(nrow(temp_file)), temp_file)
    }
    
    # Identifica colonne per tipo (converti da 0 a 1)
    get_column_names <- function(cols) {
      if (is.null(cols) || length(cols) == 0) return(NULL)
      
      # Handle case where cols might be a list (from simplifyVector = FALSE), forse necessario con simplifyVector = FALSE
      if (is.list(cols)) {
        cols <- unlist(cols)
      }
      
      sapply(cols, function(col) {
        if (is.numeric(col)) {
          names(temp_file)[col + 1]
        } else {
          col
        }
      })
    }
    
    # Ottieni nomi colonne
    id_col <- if (!is.null(classification$idColumn)) {
      id_val <- if (is.list(classification$idColumn)) unlist(classification$idColumn) else classification$idColumn
      if (is.numeric(id_val)) {
        names(temp_file)[id_val + 1]
      } else {
        id_val
      }
    } else {
      "row_id"
    }
    
    outcome_col <- if (!is.null(classification$outcomeColumn)) {
      outcome_val <- if (is.list(classification$outcomeColumn)) unlist(classification$outcomeColumn) else classification$outcomeColumn
      if (is.numeric(outcome_val)) {
        names(temp_file)[outcome_val + 1]
      } else {
        outcome_val
      }
    } else {
      NULL
    }
    
    covariate_cols <- tryCatch({
      get_column_names(classification$covariateColumns)
    }, error = function(e) {
      return(NULL)
    })
    
    omics_cols <- tryCatch({
      get_column_names(classification$omicsColumns)
    }, error = function(e) {
      return(NULL)
    })
    
    categorical_cols <- tryCatch({
      get_column_names(classification$categoricalColumns)
    }, error = function(e) {
      return(NULL)
    })
    
    if(length(categorical_cols) == 0) {
      categorical_cols <- NULL
    }
    if(length(covariate_cols) == 0) {
      covariate_cols <- NULL
    }
    
  } 
  removed_cols <- NULL
  
  # Selezione delle colonne da mantenere
  
  temp_processed_file <- tryCatch({
    temp_file %>% 
      dplyr::select(any_of(c(id_col, outcome_col, covariate_cols, omics_cols))) %>%
      mutate(across(where(is.character), as.factor)) %>%
      mutate(across(any_of(c(id_col, categorical_cols)), as.factor))
  }, error = function(e) {
    stop(e$message)
  })
  
  # Rimozione colonne con troppi  NAs
  
  if(!is.null(options$missingDataRemoval) && !is.null(options$missingDataRemoval$enabled) && options$missingDataRemoval$enabled == TRUE) {
    freq_threshold <- as.numeric(options$missingDataRemoval$threshold)/100
    missing_freq <- colMeans(is.na(temp_processed_file))
    temp_processed_file <- temp_processed_file[, missing_freq <= freq_threshold]
    removed_cols <- names(missing_freq[missing_freq > freq_threshold])
  }
  
  # Rimozione outlier
  if(options$removeOutliers == TRUE) {
    temp_processed_file <- switch(options$outlierMethod,
                                  "iqr" = remove_outliers_iqr_tidy(temp_processed_file),
                                  "zscore" = remove_outliers_zscore_tidy(temp_processed_file, threshold = 3),
                                  "isolation" = temp_processed_file
    )
  }

  # Rimozione di tutti i casi con NAs (casi completi)
  if(options$removeNullValues == TRUE) {
    temp_processed_file <- temp_processed_file %>% filter(!if_any(everything(), is.na))
  } else {
    # Oppure imputare con media, mediana, knn5
    temp_processed_file <- switch(options$fillMissingValues,
                                   "none" = temp_processed_file,
                                   "mean" = temp_processed_file %>%
                                     mutate(across(where(is.numeric), ~ ifelse(is.na(.), mean(., na.rm = TRUE), .))),
                                   "median" = temp_processed_file %>% 
                                     mutate(across(where(is.numeric), ~ ifelse(is.na(.), median(., na.rm = TRUE), .))),
                                   "knn5" = kNN(temp_processed_file, k = 5, imp_var = FALSE)
    )
  }

  # Transformazione dati
  if(options$transformation != "none") {
    temp_processed_file <- switch(options$transformation,
        "center" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = TRUE, scale = FALSE)))),
        "scale" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = FALSE, scale = TRUE)))),
        "standardize" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ as.numeric(scale(., center = TRUE, scale = TRUE)))),
        "log" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ log(.x - min(.x, na.rm = TRUE) + 1))),
        "log2" = temp_processed_file %>% 
          mutate(across(where(is.numeric), ~ log2(.x - min(.x, na.rm = TRUE) + 1))),
        "yeo-johnson" = temp_processed_file
    )
  }

  preprocessing_info <- list(
    id_column = id_col,
    outcome_column = outcome_col,
    covariate_columns = covariate_cols,
    omics_columns = omics_cols,
    categorical_columns = categorical_cols,
    processed_date = Sys.Date(),
    n_rows = nrow(temp_processed_file),
    n_cols = ncol(temp_processed_file),
    removedNAs = options$removeNullValues,
    missingDataRemoval = options$missingDataRemoval$enabled,
    missingThreshold = ifelse(is.null(options$missingDataRemoval$threshold), NULL, options$missingDataRemoval$threshold),
    removedMissing = removed_cols,
    substNAs = options$fillMissingValues,
    transformation = options$transformation,
    removeOutliers = options$removeOutliers,
    outlierMethod = options$outlierMethod,
    analysisType = options$analysisType,
    sessionId = options$sessionId,
    userId = options$userId
  )
  
  return(list("temp_processed_file" = temp_processed_file, "preprocessing_info" = preprocessing_info))
}

# Ottieni gli args (dall'API)
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  stop("No arguments provided")
}

# Ottieni gli args 
if (file.exists(args[1])) {
  # Read from file (new method)
  input_data <- fromJSON(args[1], simplifyVector = FALSE)
} else {
  # Parse from command line string (fallback)
  input_data <- fromJSON(args[1], simplifyVector = FALSE)
}

input_file <- input_data$input_file
output_dir <- input_data$output_dir
options <- input_data$options

# Initialize result variable
result <- NULL

result <- tryCatch({
  # Leggi il file di input in base al tipo (rimuovere e tenere solo CSV?)
  file_ext <- tolower(tools::file_ext(input_file))
  
  if (file_ext %in% c("csv")) {
    data <- read_csv(input_file, show_col_types = FALSE)
  } else if (file_ext %in% c("txt", "tsv")) {
    data <- read_tsv(input_file, show_col_types = FALSE)
  } else {
    stop(paste("Unsupported file format:", file_ext))
  }
  
  # Applica il preprocessing usando la funzione principale
  preprocessing_result <- preprocess_data(data, options)
  processed_data <- preprocessing_result$temp_processed_file
  preprocessing_info <- preprocessing_result$preprocessing_info
  
  # Ensure output directory exists
  if (!dir.exists(output_dir)) {
    dir.create(output_dir, recursive = TRUE)
  }
  
  # Salva un processed data
  output_file <- file.path(output_dir, "processed_data.csv")
  write_csv(processed_data, output_file)
  
  # Return success result
  list(
    success = TRUE,
    message = "Data preprocessing completato con successo",
    processed_file_path = output_file,
    processed_rows = nrow(processed_data),
    processed_columns = ncol(processed_data),
    preprocessing_summary = list(
      original_dimensions = paste(nrow(data), "x", ncol(data)),
      processed_dimensions = paste(nrow(processed_data), "x", ncol(processed_data)),
      missing_values_handled = options$fillMissingValues,
      transformation_applied = options$transformation,
      outliers_removed = options$removeOutliers,
      columns_removed_missing = length(preprocessing_info$removedMissing %||% c()),
      id_column = preprocessing_info$id_column,
      outcome_column = preprocessing_info$outcome_column,
      covariate_columns = length(preprocessing_info$covariate_columns %||% c()),
      omics_columns = length(preprocessing_info$omics_columns %||% c())
    )
  )
  
}, error = function(e) {
  list(
    success = FALSE,
    message = paste("Preprocessing fallito:", e$message),
    processed_file_path = NULL,
    error = e$message
  )
})

# Output JSON result
cat(toJSON(result, auto_unbox = TRUE, pretty = FALSE))
