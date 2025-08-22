# analysis.R
# Main analysis script for omics data

library(jsonlite)
library(readr)
library(dplyr)
library(tidyr)
library(purrr)
library(broom)
library(rstatix)
library(glmnet)
library(caret)
library(randomForest)
library(doParallel)
library(Boruta)

# Initialize logging system
log_file <- NULL

# Function to initialize logging
init_logging <- function(output_dir, analysis_id) {
  # Ensure output directory exists
  if (!dir.exists(output_dir)) {
    dir.create(output_dir, recursive = TRUE)
  }
  
  log_file_path <- file.path(output_dir, paste0("analysis_", analysis_id, "_", 
                                                format(Sys.time(), "%Y%m%d_%H%M%S"), ".log"))
  log_file <<- log_file_path
  
  # Create log file and write header
  cat("=== OMICS ANALYSIS LOG ===\n", file = log_file, append = FALSE)
  cat(paste("Analysis ID:", analysis_id, "\n"), file = log_file, append = TRUE)
  cat(paste("Start Time:", Sys.time(), "\n"), file = log_file, append = TRUE)
  cat(paste("R Version:", R.version.string, "\n"), file = log_file, append = TRUE)
  cat("===========================\n\n", file = log_file, append = TRUE)
  
  return(log_file_path)
}

# Function to write log messages
write_log <- function(message, level = "INFO") {
  if (!is.null(log_file)) {
    timestamp <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
    log_entry <- paste0("[", timestamp, "] [", level, "] ", message, "\n")
    cat(log_entry, file = log_file, append = TRUE)
  }
  # Note: Removed console output to avoid interfering with JSON output to stdout
}

# Function to log function entry/exit
log_function <- function(func_name, action = "ENTER", details = "") {
  if (action == "ENTER") {
    write_log(paste("ENTERING function:", func_name, details), "DEBUG")
  } else if (action == "EXIT") {
    write_log(paste("EXITING function:", func_name, details), "DEBUG")
  }
}

# Function to log data dimensions and summary
log_data_info <- function(data, data_name) {
  write_log(paste("Data info for", data_name, ":"))
  write_log(paste("  Dimensions:", nrow(data), "rows x", ncol(data), "columns"))
  write_log(paste("  Column names:", paste(names(data)[1:min(10, ncol(data))], collapse = ", "), 
                   if(ncol(data) > 10) "..." else ""))
  
  # Check for missing values
  missing_counts <- sapply(data, function(x) sum(is.na(x)))
  total_missing <- sum(missing_counts)
  if (total_missing > 0) {
    write_log(paste("  Missing values: Total =", total_missing), "WARN")
    high_missing <- missing_counts[missing_counts > nrow(data) * 0.1]
    if (length(high_missing) > 0) {
      write_log(paste("  Columns with >10% missing:", paste(names(high_missing), collapse = ", ")), "WARN")
    }
  } else {
    write_log("  No missing values detected")
  }
}

# Helper functions for analysis
do_student_t_test <- function(data, group_var, groups, omics_vars) {
  log_function("do_student_t_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Student's t-test on", length(omics_vars), "variables"))
  write_log(paste("Groups:", paste(groups, collapse = ", ")))
  
  results <- data %>%
    select(!!sym(group_var), all_of(omics_vars)) %>%
    dplyr::filter(!!sym(group_var) %in% c("1t", "3t")) %>% 
    pivot_longer(-!!sym(group_var), names_to = "Variable", values_to = "value") %>%
    group_by(Variable) %>%
    nest() %>%
    mutate(
      t_test = map(data, ~ t.test(value ~ !!sym(group_var), data = .x, var.equal = TRUE)),
      tidy = map(t_test, broom::tidy)
    ) %>%
    unnest(tidy) %>%
    select(Variable, estimate, estimate1, estimate2, statistic, p.value, parameter, conf.low, conf.high) %>% 
    rename("pValue" = "p.value")
  
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("Student's t-test completed:", nrow(results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  
  log_function("do_student_t_test", "EXIT")
  results
}

do_welch_t_test <- function(data, group_var, groups, omics_vars) {
  log_function("do_welch_t_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Welch's t-test on", length(omics_vars), "variables"))
  write_log(paste("Groups:", paste(groups, collapse = ", ")))
  
  results <- data %>%
    select(!!sym(group_var), all_of(omics_vars)) %>%
    dplyr::filter(!!sym(group_var) %in% groups) %>% 
    pivot_longer(-!!sym(group_var), names_to = "Variable", values_to = "value") %>%
    group_by(Variable) %>%
    nest() %>%
    mutate(
      t_test = map(data, ~ t.test(value ~ !!sym(group_var), data = .x, var.equal = FALSE)),
      tidy = map(t_test, broom::tidy)
    ) %>%
    unnest(tidy) %>%
    select(Variable, estimate, estimate1, estimate2, statistic, p.value, parameter, conf.low, conf.high) %>% 
    rename("pValue" = "p.value") 
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("Welch's t-test completed:", nrow(results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  
  log_function("do_welch_t_test", "EXIT")
  results
}

do_wilcoxon_test <- function(data, group_var, groups, omics_vars) {
  log_function("do_wilcoxon_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Wilcoxon test on", length(omics_vars), "variables"))
  write_log("Using exact = FALSE to avoid ties warning")
  
  results <- data %>%
    select(!!sym(group_var), all_of(omics_vars)) %>%
    dplyr::filter(!!sym(group_var) %in% c("1t", "3t")) %>% 
    pivot_longer(-!!sym(group_var), names_to = "Variable", values_to = "value") %>%
    group_by(Variable) %>%
    nest() %>%
    mutate(
      test = map(data, ~ wilcox.test(value ~ !!sym(group_var), data = .x, exact = FALSE)),
      tidy = map(test, broom::tidy),
      median_diff = map_dbl(data, ~ {
        g1 <- .x %>% filter(!!sym(group_var) == "1t") %>% pull(value)
        g2 <- .x %>% filter(!!sym(group_var) == "3t") %>% pull(value)
        median(g2, na.rm = TRUE) - median(g1, na.rm = TRUE)
      })
    ) %>%
    unnest(tidy) %>%
    select(Variable, statistic, p.value, alternative, median_diff) %>% 
    rename("pValue" = "p.value", "estimate" = "median_diff") 
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("Wilcoxon test completed:", nrow(results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  
  log_function("do_wilcoxon_test", "EXIT")
  results
}

do_anova_test <- function(data, omics_vars) {
  log_function("do_anova_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running ANOVA tests on", length(omics_vars), "variables"))
  write_log("Including Games-Howell post-hoc tests")
  
  anova_results <- NULL
  posthoc_results <- NULL
  
  for(var in omics_vars) {
    form <- paste0(var, " ~ group")
    results <- rstatix::anova_test(as.formula(form), data = data) %>% 
      as_tibble() %>% 
      dplyr::select(-c("DFn", "DFd", "Effect", "p<.05")) %>% 
      dplyr::mutate("Variable" = var, .before = 1) %>% 
      dplyr::rename("pValue" = "p")
    gh_test <- data %>% games_howell_test(as.formula(form)) %>% rename("Variable" = ".y.")
    anova_results <- bind_rows(anova_results, results)
    posthoc_results <- bind_rows(posthoc_results, gh_test)
  }
  
  anova_results$fdr <- p.adjust(anova_results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(anova_results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(anova_results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("ANOVA tests completed:", nrow(anova_results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  write_log(paste("Post-hoc comparisons:", nrow(posthoc_results)))
  
  log_function("do_anova_test", "EXIT")
  return(list("results" = anova_results, "posthoc_results" = posthoc_results))
}

do_welch_anova_test <- function(data, omics_vars) {
  log_function("do_welch_anova_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Welch ANOVA tests on", length(omics_vars), "variables"))
  write_log("Including Games-Howell post-hoc tests")
  
  anova_results <- NULL
  posthoc_results <- NULL
  
  for(var in omics_vars) {
    form <- paste0(var, " ~ group")
    results <- welch_anova_test(as.formula(form), data = data) %>% 
      as_tibble() %>% 
      dplyr::select(-c("DFn", "DFd", "method", ".y.")) %>% 
      dplyr::mutate("Variable" = var, .before = 1) %>% 
      dplyr::rename("pValue" = "p")
    gh_test <- data %>% games_howell_test(as.formula(form)) %>% rename("Variable" = ".y.")
    anova_results <- bind_rows(anova_results, results)
    posthoc_results <- bind_rows(posthoc_results, gh_test)
  }
  
  anova_results$fdr <- p.adjust(anova_results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(anova_results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(anova_results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("Welch ANOVA tests completed:", nrow(anova_results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  write_log(paste("Post-hoc comparisons:", nrow(posthoc_results)))
  
  log_function("do_welch_anova_test", "EXIT")
  return(list("results" = anova_results, "posthoc_results" = posthoc_results))
}

do_kw_test <- function(data, omics_vars) {
  log_function("do_kw_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Kruskal-Wallis tests on", length(omics_vars), "variables"))
  write_log("Including Dunn's post-hoc tests")
  
  kw_results <- NULL
  posthoc_results <- NULL
  
  for(var in omics_vars) {
    form <- paste0(var, " ~ group")
    results <- kruskal_test(as.formula(form), data = data) %>% 
      as_tibble() %>% 
      dplyr::select(-c("df", "method", ".y.")) %>% 
      dplyr::mutate("Variable" = var, .before = 1) %>% 
      dplyr::rename("pValue" = "p")
    dunn_results <- data %>% dunn_test(as.formula(form)) %>% rename("Variable" = ".y.")
    kw_results <- bind_rows(kw_results, results)
    posthoc_results <- bind_rows(posthoc_results, dunn_results)
  }
  
  kw_results$fdr <- p.adjust(kw_results$pValue, method = "fdr")
  
  # Log results summary
  sig_count <- sum(kw_results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(kw_results$fdr < 0.05, na.rm = TRUE)
  write_log(paste("Kruskal-Wallis tests completed:", nrow(kw_results), "tests performed"))
  write_log(paste("Significant results (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  write_log(paste("Post-hoc comparisons:", nrow(posthoc_results)))
  
  log_function("do_kw_test", "EXIT")
  return(list("results" = kw_results, "posthoc_results" = posthoc_results))
}

do_pearson_test <- function(data, outcome, omics_vars) {
  log_function("do_pearson_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Pearson correlation tests on", length(omics_vars), "variables"))
  write_log(paste("Outcome variable:", outcome))
  
  pearson_results <- NULL
  
  for(var in omics_vars) {
    results <- cor_test(outcome, var, data = data, method = "pearson") %>% 
      dplyr::select(-c("var1", "statistic", "conf.low", "conf.high", "method")) %>% 
      dplyr::rename("Variable" = "var2") %>% 
      dplyr::rename("pValue" = "p")
    pearson_results <- bind_rows(pearson_results, results)
  }
  
  pearson_results$fdr <- p.adjust(pearson_results$pValue, method = "fdr")

  # Log results summary
  sig_count <- sum(pearson_results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(pearson_results$fdr < 0.05, na.rm = TRUE)
  strong_corr <- sum(abs(pearson_results$cor) > 0.5, na.rm = TRUE)
  write_log(paste("Pearson correlation completed:", nrow(pearson_results), "tests performed"))
  write_log(paste("Significant correlations (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  write_log(paste("Strong correlations (|r| > 0.5):", strong_corr))
  
  log_function("do_pearson_test", "EXIT")
  return(list("results" = pearson_results))
}

do_spearman_test <- function(data, outcome, omics_vars) {
  log_function("do_spearman_test", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running Spearman correlation tests on", length(omics_vars), "variables"))
  write_log(paste("Outcome variable:", outcome))
  
  spearman_results <- NULL
  
  for(var in omics_vars) {
    results <- cor_test(outcome, var, data = data, method = "spearman") %>% 
      dplyr::select(-c("var1", "statistic", "method")) %>% 
      dplyr::rename("Variable" = "var2") %>% 
      dplyr::rename("pValue" = "p")
    spearman_results <- bind_rows(spearman_results, results)
  }

  spearman_results$fdr <- p.adjust(spearman_results$pValue, method = "fdr")

  # Log results summary
  sig_count <- sum(spearman_results$pValue < 0.05, na.rm = TRUE)
  fdr_sig_count <- sum(spearman_results$fdr < 0.05, na.rm = TRUE)
  strong_corr <- sum(abs(spearman_results$cor) > 0.5, na.rm = TRUE)
  write_log(paste("Spearman correlation completed:", nrow(spearman_results), "tests performed"))
  write_log(paste("Significant correlations (p < 0.05):", sig_count))
  write_log(paste("FDR significant results (FDR < 0.05):", fdr_sig_count))
  write_log(paste("Strong correlations (|rho| > 0.5):", strong_corr))
  
  log_function("do_spearman_test", "EXIT")
  return(list("results" = spearman_results))
}

do_lr <- function(data, outcome, covariates, omics_vars, remove_infl) {
  log_function("do_lr", "ENTER", paste("- Variables:", length(omics_vars)))
  
  write_log(paste("Running linear regression on", length(omics_vars), "variables"))
  write_log(paste("Outcome variable:", outcome))
  write_log(paste("Covariates:", if(is.null(covariates)) "None" else paste(covariates, collapse = ", ")))
  write_log(paste("Remove influential observations:", remove_infl))
  
  results <- NULL
  remove_infl_results <- NULL
  total_influential <- 0
  
  for(var in omics_vars) {
    form <- paste0(outcome, " ~ ", paste0(c(covariates, var), collapse = " + "))
    model <- lm(as.formula(form), data = data)
    
    results <- bind_rows(results, tidy(model) %>% 
                        dplyr::filter(term == var) %>% 
                        rename("Variable" = "term"))
    
    if(remove_infl == TRUE) {
      cds <- cooks.distance(model)
      thr_cd <- 5*(mean(cds))
      infl_points <- tibble(obs_id = seq_along(cds), cd = cds, influential = cd > thr_cd, 
                           leverage = hatvalues(model), rstandard = rstandard(model))
      
      influential_count <- sum(infl_points$influential)
      total_influential <- total_influential + influential_count
      
      remove_infl_data <- data[as.numeric(dplyr::filter(infl_points, influential == FALSE) %>% pull(obs_id)),]
      
      remove_infl_model <- lm(as.formula(form), data = remove_infl_data)
      remove_infl_results <- bind_rows(remove_infl_results, tidy(remove_infl_model) %>% 
                                      dplyr::filter(term == var) %>% 
                                      mutate("removed_influentials" = influential_count) %>% 
                                      rename("Variable" = "term"))
    }
  }
  

  
  # Log results summary
  sig_count <- sum(results$p.value < 0.05, na.rm = TRUE)
  write_log(paste("Linear regression completed:", nrow(results), "models fitted"))
  write_log(paste("Significant coefficients (p < 0.05):", sig_count))

  if(remove_infl) {
    write_log(paste("Total influential observations removed:", total_influential))
    sig_count_clean <- sum(remove_infl_results$p.value < 0.05, na.rm = TRUE)
    write_log(paste("Significant coefficients after removing influential obs:", sig_count_clean))

  }
  
  log_function("do_lr", "EXIT")
  return(list("results" = results, "removed_influentials_results" = remove_infl_results))
}

prepare_mv_dataset <- function(data, id_column, group_column, covariates, remove_cov) {
  log_function("prepare_mv_dataset", "ENTER")
  
  write_log(paste("Preparing multivariate dataset from", nrow(data), "×", ncol(data), "input"))
  write_log(paste("Removing columns:", id_column, ",", group_column))

  dt <- data %>% dplyr::select(-any_of(c(id_column, group_column)))

  if(remove_cov == TRUE & !is.null(covariates)) {
    write_log(paste("Removing covariates:", paste(covariates, collapse = ", ")))
    dt <- dt %>% dplyr::select(!any_of(covariates))
  } else if(!is.null(covariates)) {
    write_log(paste("Keeping covariates:", paste(covariates, collapse = ", ")))
  } else {
    write_log("No covariates to process")
  }
  
  write_log(paste("Final dataset dimensions:", nrow(dt), "×", ncol(dt)))
  log_function("prepare_mv_dataset", "EXIT")
  return(dt)
}

simple_caret_summary <- function(data, lev = NULL, model = NULL) {
  tryCatch({
    obs <- as.numeric(data$obs)
    pred <- as.numeric(data$pred)
    
    # Remove NAs
    complete_idx <- complete.cases(obs, pred)
    obs <- obs[complete_idx]
    pred <- pred[complete_idx]
    
    if(length(obs) < 2) {
      return(c(RMSE = 0, Rsquared = 0, MAE = 0))
    }
    
    # Calculate metrics
    rmse <- sqrt(mean((obs - pred)^2))
    mae <- mean(abs(obs - pred))
    
    # R-squared
    ss_res <- sum((obs - pred)^2)
    ss_tot <- sum((obs - mean(obs))^2)
    
    if(ss_tot == 0) {
      rsq <- 0
    } else {
      rsq <- 1 - (ss_res / ss_tot)
      rsq <- max(0, rsq)
    }
    
    return(c(RMSE = rmse, Rsquared = rsq, MAE = mae))
    
  }, error = function(e) {
    return(c(RMSE = 0, Rsquared = 0, MAE = 0))
  })
}

do_ridge <- function(data, outcome, lambdasel, lbdmin, lbdmax, lbdstep, lbdrule, metric) {
  log_function("do_ridge", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Ridge regression with cross-validation")
  write_log(paste("Lambda selection:", lambdasel))
  write_log(paste("Metric for optimization:", metric))
  write_log(paste("Selection rule:", lbdrule))
  
  form <- paste0(outcome, " ~ .")
  
  if(metric == "rmse") {
    metric <- "RMSE"
  } else {
    metric <- "Rsquared"
  }
  
  if(lbdrule == "min" || lbdrule == "max") {
    lbdrule <- "best"
  } else {
    lbdrule <- "oneSE"
  }
  
  train_control <- trainControl(
    method = "cv",
    number = 10,
    verboseIter = FALSE,
    summaryFunction = simple_caret_summary,
    savePredictions = TRUE, 
    allowParallel = FALSE, 
    selectionFunction = lbdrule
  )
  
  if(lambdasel == "automatic") {
    lambda_grid <- expand.grid(
      alpha = 0, 
      lambda = 10^seq(-2, 2, length = 50)
    )
    write_log("Using automatic lambda grid: 50 values from 10^-2 to 10^2")
  } else {
    lambda_grid <- expand.grid(
      alpha = 0,
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
    write_log(paste("Using custom lambda grid:", nrow(lambda_grid), "values"))
  }
  
  set.seed(1234)
  write_log("Starting Ridge regression cross-validation...")
  ridge_model <- train(
    as.formula(form),
    data = data, 
    method = "glmnet",
    trControl = train_control,
    tuneGrid = lambda_grid,
    standardize = TRUE,
    metric = metric, 
    preProcess = c("center", "scale", "nzv")
  )
  
  chosen_lambda <- ridge_model$bestTune$lambda
  chosen_metric <- ridge_model$results %>% dplyr::filter(lambda == chosen_lambda) %>% pull(!!sym(metric))
  
  coef_matrix <- coef(ridge_model$finalModel, s = chosen_lambda)
  coef_table <- tibble(
    Variable = rownames(coef_matrix),
    Coefficient = as.vector(coef_matrix)
  ) %>% 
  dplyr::filter(Variable != "(Intercept)") %>% 
  mutate(abs_coeff = abs(Coefficient), 
         importance = (abs_coeff/max(abs_coeff))*100,
         sign = sign(Coefficient)) %>% 
  dplyr::select(-abs_coeff)
  
  coefs_lambdas <- as.matrix(coef(ridge_model$finalModel)) %>% 
    as_tibble(rownames = "Variable") %>% 
    pivot_longer(-Variable, names_to = "lambda_index", values_to = "coefficient") %>% 
    mutate(lambda_index = as.numeric(gsub("s", "", lambda_index)),
           lambda = ridge_model$finalModel$lambda[lambda_index+1],
           log_lambda = log10(lambda)) %>%
    dplyr::filter(Variable != "(Intercept)")
  
  # Log results summary
  non_zero_coef <- sum(abs(coef_table$Coefficient) > 1e-6)
  write_log(paste("Ridge regression completed"))
  write_log(paste("Optimal lambda:", round(chosen_lambda, 6)))
  write_log(paste("Best", metric, ":", round(chosen_metric, 4)))
  write_log(paste("Non-zero coefficients:", non_zero_coef, "out of", nrow(coef_table)))
  
  log_function("do_ridge", "EXIT")
  return(list("chosen_lambda" = chosen_lambda, "best_metric" = chosen_metric, "coef_table" = coef_table, 
              "metric_lambda" = ridge_model$results, "coefs_lambda"= coefs_lambdas))
}

do_lasso <- function(data, outcome, lambdasel, lbdmin, lbdmax, lbdstep, lbdrule, metric) {
  log_function("do_lasso", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Lasso regression with cross-validation")
  write_log(paste("Lambda selection:", lambdasel))
  write_log(paste("Metric for optimization:", metric))
  write_log(paste("Selection rule:", lbdrule))
  
  form <- paste0(outcome, " ~ .")
  
  if(lbdrule == "min" || lbdrule == "max") {
    lbdrule <- "best"
  } else {
    lbdrule <- "oneSE"
  }
  
  if(metric == "rmse") {
    metric <- "RMSE"
  } else {
    metric <- "Rsquared"
  }
  
  if(lambdasel == "automatic") {
    lambda_grid <- expand.grid(
      alpha = 1, 
      lambda = 10^seq(-2, 2, length = 50)
    )
    write_log("Using automatic lambda grid: 50 values from 10^-2 to 10^2")
  } else {
    lambda_grid <- expand.grid(
      alpha = 1,
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
    write_log(paste("Using custom lambda grid:", nrow(lambda_grid), "values"))
  }
  
  train_control <- trainControl(
    method = "cv",
    number = 10,
    verboseIter = FALSE,
    summaryFunction = simple_caret_summary,
    savePredictions = TRUE, 
    allowParallel = FALSE, 
    selectionFunction = lbdrule
  )
  
  set.seed(1234)
  write_log("Starting Lasso regression cross-validation...")
  lasso_model <- train(
    as.formula(form),
    data = data, 
    method = "glmnet",
    trControl = train_control,
    tuneGrid = lambda_grid,
    standardize = TRUE,
    metric = metric, 
    preProcess = c("center", "scale", "nzv")
  )
  
  chosen_lambda <- lasso_model$bestTune$lambda
  chosen_metric <- lasso_model$results %>% dplyr::filter(lambda == chosen_lambda) %>% pull(!!sym(metric))
  
  coef_matrix <- coef(lasso_model$finalModel, s = chosen_lambda)
  coef_table <- tibble(
    Variable = rownames(coef_matrix),
    Coefficient = as.vector(coef_matrix)
  ) %>% 
  dplyr::filter(Variable != "(Intercept)") %>% 
  mutate(abs_coeff = abs(Coefficient), 
         importance = (abs_coeff/max(abs_coeff))*100,
         sign = sign(Coefficient)) %>% 
  dplyr::select(-abs_coeff)
  
  coefs_lambdas <- as.matrix(coef(lasso_model$finalModel)) %>% 
    as_tibble(rownames = "Variable") %>% 
    pivot_longer(-Variable, names_to = "lambda_index", values_to = "coefficient") %>% 
    mutate(lambda_index = as.numeric(gsub("s", "", lambda_index)),
           lambda = lasso_model$finalModel$lambda[lambda_index+1],
           log_lambda = log10(lambda)) %>%
    dplyr::filter(Variable != "(Intercept)")
  
  # Log results summary
  selected_vars <- sum(abs(coef_table$Coefficient) > 1e-6)
  write_log(paste("Lasso regression completed"))
  write_log(paste("Optimal lambda:", round(chosen_lambda, 6)))
  write_log(paste("Best", metric, ":", round(chosen_metric, 4)))
  write_log(paste("Selected variables:", selected_vars, "out of", nrow(coef_table)))
  
  log_function("do_lasso", "EXIT")
  return(list("chosen_lambda" = chosen_lambda, "best_metric" = chosen_metric, "coef_table" = coef_table, 
              "metric_lambda" = lasso_model$results, "coefs_lambda"= coefs_lambdas))
}

do_enet <- function(data, outcome, lambdasel, lbdmin, lbdmax, lbdstep, lbdrule, metric) {
  log_function("do_enet", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Elastic Net regression with cross-validation")
  write_log(paste("Lambda selection:", lambdasel))
  write_log(paste("Metric for optimization:", metric))
  write_log(paste("Selection rule:", lbdrule))
  
  form <- paste0(outcome, " ~ .")
  
  if(metric == "rmse") {
    metric <- "RMSE"
  } else {
    metric <- "Rsquared"
  }
  
  if(lbdrule == "min" || lbdrule == "max") {
    lbdrule <- "best"
  } else {
    lbdrule <- "oneSE"
  }
  
  train_control <- trainControl(
    method = "cv",
    number = 10,
    verboseIter = FALSE,
    summaryFunction = simple_caret_summary,
    savePredictions = TRUE, 
    allowParallel = FALSE, 
    selectionFunction = lbdrule
  )
  
  if(lambdasel == "automatic") {
    lambda_grid <- expand.grid(
      alpha = seq(0.1, 1, by = 0.1), 
      lambda = 10^seq(-2, 2, length = 50)
    )
    write_log("Using automatic grid: 10 alpha values × 50 lambda values")
  } else {
    lambda_grid <- expand.grid(
      alpha = seq(0.1, 1, by = 0.1), 
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
    write_log(paste("Using custom grid:", nrow(lambda_grid), "parameter combinations"))
  }
  
  set.seed(1234)
  write_log("Starting Elastic Net cross-validation...")
  enet_model <- train(
    as.formula(form),
    data = data, 
    method = "glmnet",
    trControl = train_control,
    tuneGrid = lambda_grid,
    standardize = TRUE,
    metric = metric, 
    preProcess = c("center", "scale", "nzv")
  )
  
  chosen_lambda <- enet_model$bestTune$lambda
  chosen_alpha <- enet_model$bestTune$alpha
  chosen_metric <- enet_model$results %>% 
    dplyr::filter(lambda == chosen_lambda) %>% 
    dplyr::filter(alpha == chosen_alpha) %>% 
    pull(!!sym(metric))
  
  coef_matrix <- coef(enet_model$finalModel, s = chosen_lambda)
  coef_table <- tibble(
    Variable = rownames(coef_matrix),
    Coefficient = as.vector(coef_matrix)
  ) %>% 
  dplyr::filter(Variable != "(Intercept)") %>% 
  mutate(abs_coeff = abs(Coefficient), 
         importance = (abs_coeff/max(abs_coeff))*100,
         sign = sign(Coefficient)) %>% 
  dplyr::select(-abs_coeff)
  
  coefs_lambdas <- as.matrix(coef(enet_model$finalModel)) %>% 
    as_tibble(rownames = "Variable") %>% 
    pivot_longer(-Variable, names_to = "lambda_index", values_to = "coefficient") %>% 
    mutate(lambda_index = as.numeric(gsub("s", "", lambda_index)),
           lambda = enet_model$finalModel$lambda[lambda_index+1],
           log_lambda = log10(lambda)) %>%
    dplyr::filter(Variable != "(Intercept)")
  
  # Log results summary
  selected_vars <- sum(abs(coef_table$Coefficient) > 1e-6)
  write_log(paste("Elastic Net regression completed"))
  write_log(paste("Optimal lambda:", round(chosen_lambda, 6)))
  write_log(paste("Optimal alpha:", round(chosen_alpha, 3)))
  write_log(paste("Best", metric, ":", round(chosen_metric, 4)))
  write_log(paste("Selected variables:", selected_vars, "out of", nrow(coef_table)))
  
  log_function("do_enet", "EXIT")
  return(list("chosen_lambda" = chosen_lambda, "chosen_alpha" = chosen_alpha, "best_metric" = chosen_metric, 
              "coef_table" = coef_table, "metric_lambda" = enet_model$results, "coefs_lambda"= coefs_lambdas))
}

do_rf <- function(data, outcome, my_ntree, mtry_opt, my_mtry) {
  log_function("do_rf", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Random Forest with cross-validation")
  write_log(paste("Number of trees:", my_ntree))
  write_log(paste("mtry optimization:", mtry_opt))
  
  form <- paste0(outcome, " ~ .")
  
  train_control <- trainControl(
    method = "cv",
    number = 10,
    savePredictions = TRUE,
    allowParallel = TRUE
  )
  
  if(mtry_opt == "automatic") {
    my_mtry <- max(floor((ncol(data)-1)/3), 1)
    grid <- expand.grid(mtry = my_mtry)
    tl <- NULL
    write_log(paste("Using automatic mtry:", my_mtry))
  } else if(mtry_opt == "tuning") {
    grid <- NULL
    tl <- 10
    write_log("Using mtry tuning with 10 different values")
  } else {
    grid <- expand.grid(mtry = my_mtry)
    tl <- NULL
    write_log(paste("Using fixed mtry:", my_mtry))
  }
  
  set.seed(1234)
  write_log("Starting Random Forest cross-validation...")
  rf_caret <- train(
    as.formula(form),
    data = data,
    method = "rf",
    trControl = train_control,
    ntree = my_ntree,
    tuneGrid = grid,
    tuneLength = tl,
    metric = "RMSE",
    preProcess = c("center", "scale", "nzv")
  )
  
  importance <- dplyr::inner_join(
    varImp(rf_caret, scale = FALSE)$importance %>% 
      as_tibble(rownames = "Variable") %>% 
      rename("%IncMSE" = "Overall"), 
    varImp(rf_caret, scale = TRUE)$importance %>% 
      as_tibble(rownames = "Variable") %>% 
      rename("Importance" = "Overall"), 
    by = "Variable"
  )
  
  chosen_mtry <- rf_caret$bestTune$mtry
  chosen_metric <- rf_caret$results %>% dplyr::filter(mtry == chosen_mtry) %>% pull(RMSE)
  
  # Log results summary
  top_vars <- head(importance[order(-importance$Importance), ], 5)
  write_log(paste("Random Forest completed"))
  write_log(paste("Optimal mtry:", chosen_mtry))
  write_log(paste("Best RMSE:", round(chosen_metric, 4)))
  write_log(paste("Top 5 important variables:", paste(top_vars$Variable, collapse = ", ")))
  
  log_function("do_rf", "EXIT")
  return(list("results" = importance, "chosen_mtry" = chosen_mtry, "best_metric" = chosen_metric, 
              "mtry_tuning" = rf_caret$results, "ntree" = my_ntree))
}

do_boruta <- function(data, outcome, my_ntree, max_runs, mtry_opt, my_mtry, rft) {
  log_function("do_boruta", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Boruta feature selection")
  write_log(paste("Number of trees:", my_ntree))
  write_log(paste("Maximum runs:", max_runs))
  write_log(paste("Rough fix tentative features:", rft))
  
  form <- paste0(outcome, " ~ .")
  
  if(mtry_opt == "automatic") {
    my_mtry <- max(floor((ncol(data)-1)/3), 1)
    write_log(paste("Using automatic mtry:", my_mtry))
  } else {
    write_log(paste("Using fixed mtry:", my_mtry))
  }
  
  set.seed(1234)
  write_log("Starting Boruta feature selection...")
  boruta <- Boruta(as.formula(form), data = data, 
                   ntree = my_ntree, maxRuns = max_runs, doTrace = 0)
  
  if(rft == TRUE) {
    write_log("Applying TentativeRoughFix to resolve tentative features")
    boruta <- TentativeRoughFix(boruta)
  }
  
  results <- attStats(boruta) %>% as_tibble(rownames = "Variable")
  selected_vars <- getSelectedAttributes(boruta) 
  
  # Extract iteration information
  iterations_completed <- boruta$timeTaken
  max_runs_performed <- max_runs
  
  # Log results summary
  confirmed <- sum(results$decision == "Confirmed", na.rm = TRUE)
  rejected <- sum(results$decision == "Rejected", na.rm = TRUE)
  tentative <- sum(results$decision == "Tentative", na.rm = TRUE)
  write_log(paste("Boruta feature selection completed"))
  write_log(paste("Confirmed features:", confirmed))
  write_log(paste("Rejected features:", rejected))
  write_log(paste("Tentative features:", tentative))
  write_log(paste("Selected variables:", length(selected_vars)))
  write_log(paste("Iterations completed:", length(boruta$timeTaken)))
  
  if(length(selected_vars) > 0) {
    write_log(paste("Top selected features:", paste(head(selected_vars, 5), collapse = ", ")))
  }
  
  log_function("do_boruta", "EXIT")
  return(list("results" = results, "selected_vars" = selected_vars, 
              "iterations" = length(boruta$timeTaken), "maxRuns" = max_runs))
}

do_rfe <- function(data, outcome, subset_selection, my_subset_size, metric) {
  log_function("do_rfe", "ENTER", paste("- Features:", ncol(data)-1))
  
  write_log("Running Recursive Feature Elimination (RFE)")
  write_log(paste("Subset selection method:", subset_selection))
  write_log(paste("Metric for optimization:", metric))
  
  # ENHANCED DIAGNOSTICS: Log input parameters
  write_log(paste("Input data dimensions:", nrow(data), "rows x", ncol(data), "columns"))
  write_log(paste("Outcome variable:", outcome))
  write_log(paste("Original subset_selection:", subset_selection))
  write_log(paste("Original my_subset_size type:", class(my_subset_size)))
  write_log(paste("Original my_subset_size length:", length(my_subset_size)))
  write_log(paste("Original my_subset_size values:", paste(my_subset_size, collapse = ", ")))
  
  # Check if outcome exists in data
  if (!outcome %in% names(data)) {
    error_msg <- paste("Outcome variable", outcome, "not found in data. Available columns:", paste(names(data), collapse = ", "))
    write_log(error_msg, "ERROR")
    stop(error_msg)
  }
  
  form <- paste0(outcome, " ~ .")
  write_log(paste("Formula:", form))
  
  # ENHANCED DIAGNOSTICS: Validate and process subset sizes
  if(subset_selection == "automatic") {
    max_features <- ncol(data) - 1  # Exclude outcome column
    write_log(paste("Maximum available features for automatic selection:", max_features))
    
    if (max_features < 5) {
      write_log("Too few features for automatic subset selection, using all available features", "WARN")
      my_subset_size <- max_features
    } else {
      my_subset_size <- exp(seq(log(5), log(max_features), length.out = 10))
      my_subset_size <- round(my_subset_size / 5) * 5
      my_subset_size <- unique(my_subset_size)
      # Ensure we don't exceed available features
      my_subset_size <- my_subset_size[my_subset_size <= max_features]
      # Ensure at least one size
      if (length(my_subset_size) == 0) {
        my_subset_size <- min(5, max_features)
      }
    }
    write_log(paste("Using automatic subset sizes:", paste(my_subset_size, collapse = ", ")))
  } else {
    # ENHANCED DIAGNOSTICS: Validate custom subset sizes
    write_log("Processing custom subset sizes...")
    
    # Handle various input formats
    if (is.null(my_subset_size)) {
      write_log("Custom subset sizes is NULL, using automatic", "WARN")
      subset_selection <- "automatic"
      max_features <- ncol(data) - 1
      my_subset_size <- min(5, max_features)
    } else if (is.character(my_subset_size)) {
      write_log("Converting custom subset sizes from character format")
      my_subset_size <- as.numeric(trimws(strsplit(my_subset_size, ",")[[1]]))
    } else if (is.list(my_subset_size)) {
      write_log("Converting custom subset sizes from list format")
      my_subset_size <- as.numeric(unlist(my_subset_size))
    }
    
    # Remove NA values and ensure numeric
    my_subset_size <- my_subset_size[!is.na(my_subset_size)]
    my_subset_size <- as.integer(my_subset_size)
    
    # Validate ranges
    max_features <- ncol(data) - 1
    my_subset_size <- my_subset_size[my_subset_size > 0 & my_subset_size <= max_features]
    
    if (length(my_subset_size) == 0) {
      write_log("No valid custom subset sizes found, using automatic", "WARN")
      my_subset_size <- min(5, max_features)
    }
    
    # Remove duplicates and sort
    my_subset_size <- sort(unique(my_subset_size))
    
    write_log(paste("Final custom subset sizes:", paste(my_subset_size, collapse = ", ")))
  }
  
  # ENHANCED DIAGNOSTICS: Validate metric
  original_metric <- metric
  if(metric == "rmse") {
    metric <- "RMSE"
  } else if(metric == "rsquared") {
    metric <- "Rsquared"
  } else {
    # Default to Rsquared if unknown metric
    write_log(paste("Unknown metric:", original_metric, "defaulting to Rsquared"), "WARN")
    metric <- "Rsquared"
  }
  write_log(paste("Final metric:", metric))
  
  # ENHANCED DIAGNOSTICS: Check data quality before RFE
  outcome_values <- data[[outcome]]
  write_log(paste("Outcome variable summary:"))
  write_log(paste("  Class:", class(outcome_values)))
  write_log(paste("  Length:", length(outcome_values)))
  write_log(paste("  Unique values:", length(unique(outcome_values))))
  write_log(paste("  Missing values:", sum(is.na(outcome_values))))
  
  if (is.factor(outcome_values) || is.character(outcome_values)) {
    write_log(paste("  Levels:", paste(unique(outcome_values), collapse = ", ")))
  } else {
    write_log(paste("  Range:", min(outcome_values, na.rm = TRUE), "to", max(outcome_values, na.rm = TRUE)))
  }
  
  # Check for constant or near-constant predictors
  predictor_cols <- setdiff(names(data), outcome)
  write_log(paste("Number of predictor variables:", length(predictor_cols)))
  
  constant_vars <- sapply(data[predictor_cols], function(x) {
    if (is.numeric(x)) {
      var(x, na.rm = TRUE) == 0 || is.na(var(x, na.rm = TRUE))
    } else {
      length(unique(x[!is.na(x)])) <= 1
    }
  })
  
  if (any(constant_vars)) {
    constant_var_names <- names(constant_vars)[constant_vars]
    write_log(paste("Warning: Constant variables detected:", paste(constant_var_names, collapse = ", ")), "WARN")
  }
  
  rfe_control <- rfeControl(functions = rfFuncs,
                            method = "cv", 
                            number = 10,
                            verbose = FALSE,
                            saveDetails = TRUE,
                            returnResamp = "all")
  
  write_log(paste("RFE control settings:"))
  write_log(paste("  Method: cv"))
  write_log(paste("  Number of folds: 10"))
  write_log(paste("  Functions: rfFuncs"))
  
  set.seed(1234)
  write_log("Starting RFE cross-validation...")
  write_log(paste("Testing subset sizes:", paste(my_subset_size, collapse = ", ")))
  
  # ENHANCED DIAGNOSTICS: Wrap RFE in try-catch
  tryCatch({
    rfe_results <- rfe(as.formula(form), data = data, 
                       sizes = my_subset_size, metric = metric,
                       rfeControl = rfe_control,
                       preProcess = c("center", "scale", "nzv"))
    
    write_log("RFE execution completed successfully")
  }, error = function(e) {
    error_msg <- paste("RFE execution failed:", e$message)
    write_log(error_msg, "ERROR")
    write_log(paste("Error details:", toString(e)), "ERROR")
    stop(error_msg)
  })
  
  # ENHANCED DIAGNOSTICS: Validate results
  if (is.null(rfe_results)) {
    error_msg <- "RFE returned NULL results"
    write_log(error_msg, "ERROR")
    stop(error_msg)
  }
  
  selected_vars <- rfe_results$optVariables
  selected_size <- rfe_results$optsize
  
  write_log(paste("RFE results structure:"))
  write_log(paste("  Optimal size:", selected_size))
  write_log(paste("  Number of selected variables:", length(selected_vars)))
  
  if (is.null(selected_vars) || length(selected_vars) == 0) {
    write_log("Warning: No variables selected by RFE", "WARN")
    selected_vars <- character(0)
    selected_size <- 0
    best_metric <- NA
    optimization <- data.frame()
    importance <- data.frame(Variable = character(0), importance = numeric(0))
  } else {
    tryCatch({
      best_metric <- rfe_results$results %>% dplyr::filter(Variables == selected_size) %>% pull(!!sym(metric))
      optimization <- rfe_results$results
      
      importance <- varImp(rfe_results$fit, scale = TRUE) %>% 
        as_tibble(rownames = "Variable") %>% 
        rename("importance" = "Overall")
      
      write_log(paste("Best", metric, ":", round(best_metric, 4)))
      
    }, error = function(e) {
      write_log(paste("Error extracting RFE results:", e$message), "ERROR")
      best_metric <- NA
      optimization <- data.frame()
      importance <- data.frame(Variable = character(0), importance = numeric(0))
    })
  }
  
  # Log results summary
  write_log(paste("RFE completed"))
  write_log(paste("Optimal subset size:", selected_size))
  write_log(paste("Selected variables:", length(selected_vars)))
  
  if(length(selected_vars) > 0) {
    write_log(paste("Top selected features:", paste(head(selected_vars, 5), collapse = ", ")))
  }
  
  log_function("do_rfe", "EXIT")
  return(list("selected_vars" = selected_vars, "selected_size" = selected_size, "best_metric" = best_metric, 
              "optimization" = optimization, "results" = importance))
}

# Main analysis function
main_analysis <- function(input_file, preprocessing_options, analysis_options, analysis_id) {
  log_function("main_analysis", "ENTER", paste("- Analysis ID:", analysis_id))
  
  write_log("=== STARTING MAIN ANALYSIS ===")
  write_log(paste("Input file:", input_file))
  write_log(paste("Analysis ID:", analysis_id))
  
  # Read the input file
  write_log("Reading input data file...")
  file_ext <- tolower(tools::file_ext(input_file))
  write_log(paste("File extension:", file_ext))
  
  if (file_ext %in% c("csv")) {
    dataset <- read_csv(input_file, show_col_types = FALSE)
    write_log("Data loaded using read_csv")
  } else if (file_ext %in% c("txt", "tsv")) {
    dataset <- read_tsv(input_file, show_col_types = FALSE)
    write_log("Data loaded using read_tsv")
  } else {
    write_log(paste("Unsupported file format:", file_ext), "ERROR")
    stop(paste("Unsupported file format:", file_ext))
  }
  
  # Log initial data information
  log_data_info(dataset, "input_dataset")
  
  # Get column classifications
  column_classification <- preprocessing_options$columnClassification
  write_log("Processing column classifications...")
  
  # Handle column identification
  if (!is.null(column_classification$idColumn)) {
    if (is.numeric(column_classification$idColumn)) {
      id_col <- names(dataset)[column_classification$idColumn + 1]
    } else {
      id_col <- column_classification$idColumn
    }
  } else {
    id_col <- names(dataset)[1]  # Use first column as default
  }
  write_log(paste("ID column:", id_col))
  
  if (is.numeric(column_classification$outcomeColumn)) {
    outcome_col <- names(dataset)[column_classification$outcomeColumn + 1]
  } else {
    outcome_col <- column_classification$outcomeColumn
  }
  write_log(paste("Outcome column:", outcome_col))
  
  # Handle covariates and omics columns
  get_column_names <- function(cols) {
    if (length(cols) == 0) return(NULL)
    sapply(cols, function(col) {
      if (is.numeric(col)) {
        names(dataset)[col + 1]
      } else {
        col
      }
    })
  }
  
  covariate_cols <- get_column_names(column_classification$covariateColumns)
  omics_cols <- get_column_names(column_classification$omicsColumns)
  
  write_log(paste("Covariate columns:", if(is.null(covariate_cols)) "None" else length(covariate_cols)))
  write_log(paste("Omics columns:", length(omics_cols)))
  
  tests_list <- unlist(analysis_options$statisticalTests)
  write_log(paste("Selected statistical tests:", paste(tests_list, collapse = ", ")))
  
  complete_results <- list()
  complete_results$id <- analysis_id
  complete_results$time_start <- Sys.time()
  
  # Add dataset information and configuration details
  complete_results$dataset_info <- list(
    original_dimensions = list(rows = nrow(dataset), cols = ncol(dataset)),
    outcome_column = outcome_col,
    id_column = id_col,
    covariate_columns = covariate_cols,
    omics_columns = omics_cols,
    num_covariates = if(is.null(covariate_cols)) 0 else length(covariate_cols),
    num_omics_vars = length(omics_cols),
    grouping_method = analysis_options$groupingMethod,
    selected_tests = tests_list
  )
  
  # Create grouping variable based on tertiles or thresholds
  write_log(paste("Grouping method:", analysis_options$groupingMethod))
  
  if(analysis_options$groupingMethod == "tertiles") {
    write_log("Creating tertile groups...")
    tertiles <- quantile(dataset[[outcome_col]], probs = c(0, 1/3, 2/3, 1), na.rm = TRUE)
    write_log(paste("Tertiles:", paste(round(tertiles, 3), collapse = ", ")))
    groups <- c("1t", "3t")
    dataset <- dataset %>% mutate(
      group = cut(!!sym(outcome_col),
                  breaks = tertiles,
                  labels = c("1t", "2t", "3t"),
                  include.lowest = TRUE)
    )
    group_counts <- table(dataset$group, useNA = "ifany")
    write_log(paste("Group counts:", paste(names(group_counts), "=", group_counts, collapse = ", ")))
    
    # Add grouping information to results
    complete_results$grouping_info <- list(
      method = "tertiles",
      tertile_values = as.numeric(tertiles),
      group_counts = as.list(group_counts),
      groups_used = groups
    )
    
  } else if(analysis_options$groupingMethod == "threshold") {
    write_log("Creating threshold-based groups...")
    write_log(paste("Threshold values:", paste(analysis_options$thresholdValues, collapse = ", ")))
    
    if(analysis_options$thresholdValues[[1]] == analysis_options$thresholdValues[[2]]) {
      write_log("Single threshold - creating 2 groups")
      thresholds <- c(min(dataset[[outcome_col]], na.rm = TRUE),
                      analysis_options$thresholdValues[1],
                      max(dataset[[outcome_col]], na.rm = TRUE))
      groups <- c("1t", "2t")
      dataset <- dataset %>% mutate(
        group = cut(!!sym(outcome_col),
                    breaks = thresholds,
                    labels = c("1t", "2t"),
                    include.lowest = TRUE)
      )
    } else {
      write_log("Double threshold - creating 3 groups")
      thresholds <- c(min(dataset[[outcome_col]], na.rm = TRUE),
                      analysis_options$thresholdValues[1],
                      analysis_options$thresholdValues[2],
                      max(dataset[[outcome_col]], na.rm = TRUE))
      groups <- c("1t", "3t")
      dataset <- dataset %>% mutate(
        group = cut(!!sym(outcome_col),
                    breaks = thresholds,
                    labels = c("1t", "2t", "3t"),
                    include.lowest = TRUE)
      )
    }
    group_counts <- table(dataset$group, useNA = "ifany")
    write_log(paste("Group counts:", paste(names(group_counts), "=", group_counts, collapse = ", ")))
    
    # Add threshold grouping information to results
    complete_results$grouping_info <- list(
      method = "threshold",
      threshold_values = analysis_options$thresholdValues,
      group_counts = as.list(group_counts),
      groups_used = groups,
      num_groups = length(unique(dataset$group))
    )
  }
  
  # Statistical Tests
  write_log("=== STARTING STATISTICAL TESTS ===")
  
  if("student-t" %in% tests_list && analysis_options$groupingMethod != "none") {
    write_log("Running Student's t-test...")
    student_t_test_results <- do_student_t_test(dataset, "group", groups, omics_cols)
    complete_results$results$`student-t`$testName <- "Student T-Test"
    complete_results$results$`student-t`$data <- student_t_test_results
    # Add summary statistics
    complete_results$results$`student-t`$summary <- list(
      total_tests = nrow(student_t_test_results),
      significant_p005 = sum(student_t_test_results$pValue < 0.05, na.rm = TRUE),
      significant_fdr005 = sum(student_t_test_results$fdr < 0.05, na.rm = TRUE),
      groups_compared = groups
    )
  }
  
  if("welch-t" %in% tests_list && analysis_options$groupingMethod != "none") {
    write_log("Running Welch's t-test...")
    welch_t_test_results <- do_welch_t_test(dataset, "group", groups, omics_cols)
    complete_results$results$`welch-t`$testName <- "Welch T-Test"
    complete_results$results$`welch-t`$data <- welch_t_test_results
    # Add summary statistics
    complete_results$results$`welch-t`$summary <- list(
      total_tests = nrow(welch_t_test_results),
      significant_p005 = sum(welch_t_test_results$pValue < 0.05, na.rm = TRUE),
      significant_fdr005 = sum(welch_t_test_results$fdr < 0.05, na.rm = TRUE),
      groups_compared = groups
    )
  }
  
  if("wilcoxon" %in% tests_list && analysis_options$groupingMethod != "none") {
    write_log("Running Wilcoxon test...")
    wilcoxon_test_results <- do_wilcoxon_test(dataset, "group", groups, omics_cols)
    complete_results$results$wilcoxon$testName <- "Wilcoxon Test"
    complete_results$results$wilcoxon$data <- wilcoxon_test_results
    # Add summary statistics
    complete_results$results$wilcoxon$summary <- list(
      total_tests = nrow(wilcoxon_test_results),
      significant_p005 = sum(wilcoxon_test_results$pValue < 0.05, na.rm = TRUE),
      significant_fdr005 = sum(wilcoxon_test_results$fdr < 0.05, na.rm = TRUE),
      groups_compared = groups
    )
  }
  
  if("anova" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        write_log("Running ANOVA test (multiple groups)...")
        anova_test_results <- do_anova_test(dataset, omics_cols)
        complete_results$results$anova$testName <- "ANOVA Test"
        complete_results$results$anova$data <- anova_test_results$results
        complete_results$results$anova$posthoc_data <- anova_test_results$posthoc_results
        # Add summary statistics
        complete_results$results$anova$summary <- list(
          total_tests = nrow(anova_test_results$results),
          significant_p005 = sum(anova_test_results$results$pValue < 0.05, na.rm = TRUE),
          significant_fdr005 = sum(anova_test_results$results$fdr < 0.05, na.rm = TRUE),
          posthoc_comparisons = if(!is.null(anova_test_results$posthoc_results)) nrow(anova_test_results$posthoc_results) else 0
        )
      } else {
        write_log("Skipping ANOVA test (only 2 groups available)")
      }
    } else {
      write_log("Running ANOVA test (tertiles)...")
      anova_test_results <- do_anova_test(dataset, omics_cols)
      complete_results$results$anova$testName <- "ANOVA Test"
      complete_results$results$anova$data <- anova_test_results$results
      complete_results$results$anova$posthoc_data <- anova_test_results$posthoc_results
      # Add summary statistics
      complete_results$results$anova$summary <- list(
        total_tests = nrow(anova_test_results$results),
        significant_p005 = sum(anova_test_results$results$pValue < 0.05, na.rm = TRUE),
        significant_fdr005 = sum(anova_test_results$results$fdr < 0.05, na.rm = TRUE),
        posthoc_comparisons = if(!is.null(anova_test_results$posthoc_results)) nrow(anova_test_results$posthoc_results) else 0
      )
    }
  }
  
  if("welch-anova" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        write_log("Running Welch ANOVA test (multiple groups)...")
        welch_anova_test_results <- do_welch_anova_test(dataset, omics_cols)
        complete_results$results$`welch-anova`$testName <- "Welch-ANOVA Test"
        complete_results$results$`welch-anova`$data <- welch_anova_test_results$results
        complete_results$results$`welch-anova`$posthoc_data <- welch_anova_test_results$posthoc_results
        # Add summary statistics
        complete_results$results$`welch-anova`$summary <- list(
          total_tests = nrow(welch_anova_test_results$results),
          significant_p005 = sum(welch_anova_test_results$results$pValue < 0.05, na.rm = TRUE),
          significant_fdr005 = sum(welch_anova_test_results$results$fdr < 0.05, na.rm = TRUE),
          posthoc_comparisons = if(!is.null(welch_anova_test_results$posthoc_results)) nrow(welch_anova_test_results$posthoc_results) else 0
        )
      } else {
        write_log("Skipping Welch ANOVA test (only 2 groups available)")
      }
    } else {
      write_log("Running Welch ANOVA test (tertiles)...")
      welch_anova_test_results <- do_welch_anova_test(dataset, omics_cols)
      complete_results$results$`welch-anova`$testName <- "Welch-ANOVA Test"
      complete_results$results$`welch-anova`$data <- welch_anova_test_results$results
      complete_results$results$`welch-anova`$posthoc_data <- welch_anova_test_results$posthoc_results
      # Add summary statistics
      complete_results$results$`welch-anova`$summary <- list(
        total_tests = nrow(welch_anova_test_results$results),
        significant_p005 = sum(welch_anova_test_results$results$pValue < 0.05, na.rm = TRUE),
        significant_fdr005 = sum(welch_anova_test_results$results$fdr < 0.05, na.rm = TRUE),
        posthoc_comparisons = if(!is.null(welch_anova_test_results$posthoc_results)) nrow(welch_anova_test_results$posthoc_results) else 0
      )
    }
  }
  
  if("kruskal-wallis" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        write_log("Running Kruskal-Wallis test (multiple groups)...")
        kw_test_results <- do_kw_test(dataset, omics_cols)
        complete_results$results$`kruskal-wallis`$testName <- "Kruskal-Wallis Test"
        complete_results$results$`kruskal-wallis`$data <- kw_test_results$results
        complete_results$results$`kruskal-wallis`$posthoc_data <- kw_test_results$posthoc_results
        # Add summary statistics
        complete_results$results$`kruskal-wallis`$summary <- list(
          total_tests = nrow(kw_test_results$results),
          significant_p005 = sum(kw_test_results$results$pValue < 0.05, na.rm = TRUE),
          significant_fdr005 = sum(kw_test_results$results$fdr < 0.05, na.rm = TRUE),
          posthoc_comparisons = if(!is.null(kw_test_results$posthoc_results)) nrow(kw_test_results$posthoc_results) else 0
        )
      } else {
        write_log("Skipping Kruskal-Wallis test (only 2 groups available)")
      }
    } else {
      write_log("Running Kruskal-Wallis test (tertiles)...")
      kw_test_results <- do_kw_test(dataset, omics_cols)
      complete_results$results$`kruskal-wallis`$testName <- "Kruskal-Wallis Test"
      complete_results$results$`kruskal-wallis`$data <- kw_test_results$results
      complete_results$results$`kruskal-wallis`$posthoc_data <- kw_test_results$posthoc_results
      # Add summary statistics
      complete_results$results$`kruskal-wallis`$summary <- list(
        total_tests = nrow(kw_test_results$results),
        significant_p005 = sum(kw_test_results$results$pValue < 0.05, na.rm = TRUE),
        significant_fdr005 = sum(kw_test_results$results$fdr < 0.05, na.rm = TRUE),
        posthoc_comparisons = if(!is.null(kw_test_results$posthoc_results)) nrow(kw_test_results$posthoc_results) else 0
      )
    }
  }
  
  if("pearson" %in% tests_list) {
    write_log("Running Pearson correlation test...")
    pearson_test_results <- do_pearson_test(dataset, outcome_col, omics_cols)
    complete_results$results$pearson$testName <- "Pearson Correlation Test"
    complete_results$results$pearson$data <- pearson_test_results$results
    # Add summary statistics
    complete_results$results$pearson$summary <- list(
      total_tests = nrow(pearson_test_results$results),
      significant_p005 = sum(pearson_test_results$results$pValue < 0.05, na.rm = TRUE),
      significant_fdr005 = sum(pearson_test_results$results$fdr < 0.05, na.rm = TRUE),
      strong_correlations = sum(abs(pearson_test_results$results$cor) > 0.5, na.rm = TRUE),
      outcome_variable = outcome_col
    )
  }
  
  if("spearman" %in% tests_list) {
    write_log("Running Spearman correlation test...")
    spearman_test_results <- do_spearman_test(dataset, outcome_col, omics_cols)
    complete_results$results$spearman$testName <- "Spearman Correlation Test"
    complete_results$results$spearman$data <- spearman_test_results$results
    # Add summary statistics
    complete_results$results$spearman$summary <- list(
      total_tests = nrow(spearman_test_results$results),
      significant_p005 = sum(spearman_test_results$results$pValue < 0.05, na.rm = TRUE),
      significant_fdr005 = sum(spearman_test_results$results$fdr < 0.05, na.rm = TRUE),
      strong_correlations = sum(abs(spearman_test_results$results$cor) > 0.5, na.rm = TRUE),
      outcome_variable = outcome_col
    )
  }
  
  if(analysis_options$linearRegression == TRUE) {
    write_log("Running linear regression analysis...")
    lr_results <- do_lr(dataset, outcome_col, covariate_cols, omics_cols, 
                       analysis_options$linearRegressionWithoutInfluentials)
    complete_results$results$linearregression$testName <- "Linear Regression"
    complete_results$results$linearregression$data <- lr_results$results
    complete_results$results$linearregression$data_removed_influentials <- lr_results$removed_influentials_results
    # Add summary statistics
    complete_results$results$linearregression$summary <- list(
      total_models = nrow(lr_results$results),
      significant_p005 = sum(lr_results$results$p.value < 0.05, na.rm = TRUE),
      outcome_variable = outcome_col,
      covariates_included = if(is.null(covariate_cols)) "None" else paste(covariate_cols, collapse = ", "),
      influential_removed = analysis_options$linearRegressionWithoutInfluentials,
      total_influential_obs = if(!is.null(lr_results$removed_influentials_results)) nrow(lr_results$removed_influentials_results) else 0
    )
  }
  
  # Multivariate Analysis
  write_log("=== STARTING MULTIVARIATE ANALYSIS ===")
  multivariate_analysis <- analysis_options$multivariateAnalysis
  
  # ENHANCED DIAGNOSTICS: Log all multivariate analysis settings
  write_log("=== MULTIVARIATE ANALYSIS CONFIGURATION ===")
  write_log(paste("Ridge enabled:", multivariate_analysis$ridge$enabled))
  write_log(paste("Lasso enabled:", multivariate_analysis$lasso$enabled))
  write_log(paste("ElasticNet enabled:", multivariate_analysis$elasticNet$enabled))
  write_log(paste("RandomForest enabled:", multivariate_analysis$randomForest$enabled))
  write_log(paste("Boruta enabled:", multivariate_analysis$boruta$enabled))
  write_log(paste("RFE enabled:", multivariate_analysis$rfe$enabled))
  
  if (multivariate_analysis$rfe$enabled) {
    write_log("=== RFE CONFIGURATION DETAILS ===")
    write_log(paste("RFE subsetSizeType:", multivariate_analysis$rfe$subsetSizeType))
    write_log(paste("RFE metric:", multivariate_analysis$rfe$metric))
    write_log(paste("RFE includeCovariates:", multivariate_analysis$rfe$includeCovariates))
    write_log(paste("RFE customSubsetSizes type:", class(multivariate_analysis$rfe$customSubsetSizes)))
    write_log(paste("RFE customSubsetSizes value:", toString(multivariate_analysis$rfe$customSubsetSizes)))
    write_log("=== END RFE CONFIGURATION ===")
  }
  write_log("=== END MULTIVARIATE CONFIGURATION ===")
  
  # Check for missing values before multivariate analysis
  if(any(is.na(dataset))) {
    write_log("Missing values detected - some multivariate methods may be skipped", "WARN")
  }
  
  # Ridge Regression
  if(multivariate_analysis$ridge$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Ridge regression...")
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$ridge$includeCovariates)
    log_data_info(mv_dataset, "ridge_dataset")
    
    ridge_results <- do_ridge(mv_dataset, outcome_col, 
                              multivariate_analysis$ridge$lambdaSelection,
                              multivariate_analysis$ridge$lambdaRange$min,
                              multivariate_analysis$ridge$lambdaRange$max,
                              multivariate_analysis$ridge$lambdaRange$step,
                              multivariate_analysis$ridge$lambdaRule,
                              multivariate_analysis$ridge$metric)
    
    complete_results$results$ridge$testName <- "Ridge Regression"
    complete_results$results$ridge$chosen_lambda <- ridge_results$chosen_lambda
    complete_results$results$ridge$best_metric <- ridge_results$best_metric
    complete_results$results$ridge$data <- ridge_results$coef_table
    complete_results$results$ridge$metric_lambda <- ridge_results$metric_lambda
    complete_results$results$ridge$coefs_lambda <- ridge_results$coefs_lambda
    # Add configuration and summary
    complete_results$results$ridge$config <- list(
      metric = multivariate_analysis$ridge$metric,
      lambda_rule = multivariate_analysis$ridge$lambdaRule,
      lambda_selection = multivariate_analysis$ridge$lambdaSelection,
      include_covariates = multivariate_analysis$ridge$includeCovariates
    )
    complete_results$results$ridge$summary <- list(
      total_features = nrow(ridge_results$coef_table),
      non_zero_coefficients = sum(abs(ridge_results$coef_table$Coefficient) > 1e-6),
      dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset))
    )
  } else if(multivariate_analysis$ridge$enabled == TRUE) {
    write_log("Skipping Ridge regression due to missing values", "WARN")
  }
  
  # Lasso Regression
  if(multivariate_analysis$lasso$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Lasso regression...")
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$lasso$includeCovariates)
    log_data_info(mv_dataset, "lasso_dataset")
    lasso_results <- do_lasso(mv_dataset, outcome_col, 
                              multivariate_analysis$lasso$lambdaSelection,
                              multivariate_analysis$lasso$lambdaRange$min,
                              multivariate_analysis$lasso$lambdaRange$max,
                              multivariate_analysis$lasso$lambdaRange$step,
                              multivariate_analysis$lasso$lambdaRule,
                              multivariate_analysis$lasso$metric)
    
    complete_results$results$lasso$testName <- "Lasso Regression"
    complete_results$results$lasso$chosen_lambda <- lasso_results$chosen_lambda
    complete_results$results$lasso$best_metric <- lasso_results$best_metric
    complete_results$results$lasso$data <- lasso_results$coef_table
    complete_results$results$lasso$metric_lambda <- lasso_results$metric_lambda
    complete_results$results$lasso$coefs_lambda <- lasso_results$coefs_lambda
    # Add configuration and summary
    complete_results$results$lasso$config <- list(
      metric = multivariate_analysis$lasso$metric,
      lambda_rule = multivariate_analysis$lasso$lambdaRule,
      lambda_selection = multivariate_analysis$lasso$lambdaSelection,
      include_covariates = multivariate_analysis$lasso$includeCovariates
    )
    complete_results$results$lasso$summary <- list(
      total_features = nrow(lasso_results$coef_table),
      selected_features = sum(abs(lasso_results$coef_table$Coefficient) > 1e-6),
      dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset))
    )
  } else if(multivariate_analysis$lasso$enabled == TRUE) {
    write_log("Skipping Lasso regression due to missing values", "WARN")
  }
  
  # Elastic Net
  if(multivariate_analysis$elasticNet$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Elastic Net regression...")
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$elasticNet$includeCovariates)
    log_data_info(mv_dataset, "elasticnet_dataset")
    
    enet_results <- do_enet(mv_dataset, outcome_col, 
                            multivariate_analysis$elasticNet$lambdaSelection,
                            multivariate_analysis$elasticNet$lambdaRange$min,
                            multivariate_analysis$elasticNet$lambdaRange$max,
                            multivariate_analysis$elasticNet$lambdaRange$step,
                            multivariate_analysis$elasticNet$lambdaRule,
                            multivariate_analysis$elasticNet$metric)
    
    complete_results$results$elasticNet$testName <- "Elastic Net"
    complete_results$results$elasticNet$chosen_lambda <- enet_results$chosen_lambda
    complete_results$results$elasticNet$chosen_alpha <- enet_results$chosen_alpha
    complete_results$results$elasticNet$best_metric <- enet_results$best_metric
    complete_results$results$elasticNet$data <- enet_results$coef_table
    complete_results$results$elasticNet$metric_lambda <- enet_results$metric_lambda
    complete_results$results$elasticNet$coefs_lambda <- enet_results$coefs_lambda
    # Add configuration and summary
    complete_results$results$elasticNet$config <- list(
      metric = multivariate_analysis$elasticNet$metric,
      lambda_rule = multivariate_analysis$elasticNet$lambdaRule,
      lambda_selection = multivariate_analysis$elasticNet$lambdaSelection,
      include_covariates = multivariate_analysis$elasticNet$includeCovariates
    )
    complete_results$results$elasticNet$summary <- list(
      total_features = nrow(enet_results$coef_table),
      selected_features = sum(abs(enet_results$coef_table$Coefficient) > 1e-6),
      dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset))
    )
  } else if(multivariate_analysis$elasticNet$enabled == TRUE) {
    write_log("Skipping Elastic Net regression due to missing values", "WARN")
  }
  
  # Random Forest
  if(multivariate_analysis$randomForest$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Random Forest...")
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$randomForest$includeCovariates)
    log_data_info(mv_dataset, "randomforest_dataset")
    
    rf_results <- do_rf(mv_dataset, outcome_col, 
                        multivariate_analysis$randomForest$ntree,
                        multivariate_analysis$randomForest$mtrySelection,
                        multivariate_analysis$randomForest$mtryValue)
    
    complete_results$results$randomForest$testName <- "Random Forest"
    complete_results$results$randomForest$data <- rf_results$results 
    complete_results$results$randomForest$best_metric <- rf_results$best_metric 
    complete_results$results$randomForest$chosen_mtry <- rf_results$chosen_mtry
    complete_results$results$randomForest$ntree <- rf_results$ntree
    complete_results$results$randomForest$mtry_tuning <- rf_results$mtry_tuning
    # Add configuration and summary
    complete_results$results$randomForest$config <- list(
      ntree = multivariate_analysis$randomForest$ntree,
      mtry_selection = multivariate_analysis$randomForest$mtrySelection,
      mtry_value = multivariate_analysis$randomForest$mtryValue,
      include_covariates = multivariate_analysis$randomForest$includeCovariates
    )
    complete_results$results$randomForest$summary <- list(
      total_features = nrow(rf_results$results),
      dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset)),
      top_5_features = head(rf_results$results[order(-rf_results$results$Importance), ]$Variable, 5)
    )
  } else if(multivariate_analysis$randomForest$enabled == TRUE) {
    write_log("Skipping Random Forest due to missing values", "WARN")
  }
  
  # Boruta
  if(multivariate_analysis$boruta$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Boruta feature selection...")
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$boruta$includeCovariates)
    log_data_info(mv_dataset, "boruta_dataset")
    
    boruta_results <- do_boruta(mv_dataset, outcome_col, 
                                multivariate_analysis$boruta$ntree,
                                multivariate_analysis$boruta$maxRuns,
                                multivariate_analysis$boruta$mtrySelection,
                                multivariate_analysis$boruta$mtryValue,
                                multivariate_analysis$boruta$roughFixTentativeFeatures)
    
    complete_results$results$boruta$testName <- "Boruta Feature Selection"
    complete_results$results$boruta$data <- boruta_results$results
    complete_results$results$boruta$selected_vars <- boruta_results$selected_vars
    complete_results$results$boruta$iterations <- boruta_results$iterations
    complete_results$results$boruta$maxRuns <- boruta_results$maxRuns
    complete_results$results$boruta$ntree <- multivariate_analysis$boruta$ntree
    # Add configuration and summary
    complete_results$results$boruta$config <- list(
      ntree = multivariate_analysis$boruta$ntree,
      max_runs = multivariate_analysis$boruta$maxRuns,
      mtry_selection = multivariate_analysis$boruta$mtrySelection,
      mtry_value = multivariate_analysis$boruta$mtryValue,
      rough_fix_tentative = multivariate_analysis$boruta$roughFixTentativeFeatures,
      include_covariates = multivariate_analysis$boruta$includeCovariates
    )
    complete_results$results$boruta$summary <- list(
      total_features = nrow(boruta_results$results),
      confirmed_features = sum(boruta_results$results$decision == "Confirmed", na.rm = TRUE),
      rejected_features = sum(boruta_results$results$decision == "Rejected", na.rm = TRUE),
      tentative_features = sum(boruta_results$results$decision == "Tentative", na.rm = TRUE),
      selected_features = length(boruta_results$selected_vars),
      iterations_completed = boruta_results$iterations,
      dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset))
    ) 
  } else if(multivariate_analysis$boruta$enabled == TRUE) {
    write_log("Skipping Boruta feature selection due to missing values", "WARN")
  }
  
  # RFE
  write_log("=== RFE EXECUTION CHECK ===")
  write_log(paste("RFE enabled status:", multivariate_analysis$rfe$enabled))
  write_log(paste("Dataset has missing values:", any(is.na(dataset))))
  write_log(paste("Number of missing values in dataset:", sum(is.na(dataset))))
  if(any(is.na(dataset))) {
    missing_by_col <- sapply(dataset, function(x) sum(is.na(x)))
    write_log(paste("Missing values by column:", paste(names(missing_by_col)[missing_by_col > 0], "=", missing_by_col[missing_by_col > 0], collapse = ", ")))
  }
  write_log("=== END RFE EXECUTION CHECK ===")
  
  if(multivariate_analysis$rfe$enabled == TRUE && !any(is.na(dataset))) {
    write_log("Preparing data for Recursive Feature Elimination...")
    write_log("=== RFE DIAGNOSTICS START ===")
    
    # Log RFE configuration
    write_log(paste("RFE enabled:", multivariate_analysis$rfe$enabled))
    write_log(paste("RFE subsetSizeType:", multivariate_analysis$rfe$subsetSizeType))
    write_log(paste("RFE metric:", multivariate_analysis$rfe$metric))
    write_log(paste("RFE includeCovariates:", multivariate_analysis$rfe$includeCovariates))
    
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$rfe$includeCovariates)
    log_data_info(mv_dataset, "rfe_dataset")
    
    # ENHANCED DIAGNOSTICS: Handle customSubsetSizes with detailed logging
    custom_sizes <- multivariate_analysis$rfe$customSubsetSizes
    write_log(paste("Raw customSubsetSizes type:", class(custom_sizes)))
    write_log(paste("Raw customSubsetSizes length:", length(custom_sizes)))
    write_log(paste("Raw customSubsetSizes content:", toString(custom_sizes)))
    
    if (is.character(custom_sizes)) {
      # Fallback for string format
      write_log("Converting custom subset sizes from string format")
      write_log(paste("String value:", custom_sizes))
      custom_sizes <- as.numeric(trimws(strsplit(custom_sizes, ",")[[1]]))
      write_log(paste("After string conversion:", paste(custom_sizes, collapse = ", ")))
    } else if (is.list(custom_sizes)) {
      write_log("Converting custom subset sizes from list format")
      custom_sizes <- as.numeric(unlist(custom_sizes))
      write_log(paste("After list conversion:", paste(custom_sizes, collapse = ", ")))
    } else if (is.null(custom_sizes)) {
      write_log("customSubsetSizes is NULL")
      custom_sizes <- numeric(0)
    }
    
    write_log(paste("Final custom_sizes before RFE:", paste(custom_sizes, collapse = ", ")))
    write_log("=== RFE DIAGNOSTICS END ===")
    
    tryCatch({
      rfe_results <- do_rfe(mv_dataset, outcome_col, 
                            multivariate_analysis$rfe$subsetSizeType,
                            custom_sizes,
                            multivariate_analysis$rfe$metric)
      
      write_log("RFE analysis completed successfully")
      
      # Store RFE results
      if (!is.null(rfe_results) && length(rfe_results$selected_vars) > 0) {
        complete_results$results$rfe$testName <- "Recursive Feature Elimination"
        complete_results$results$rfe$data <- rfe_results$results
        complete_results$results$rfe$selected_vars <- rfe_results$selected_vars
        complete_results$results$rfe$selected_size <- rfe_results$selected_size
        complete_results$results$rfe$best_metric <- rfe_results$best_metric
        complete_results$results$rfe$optimization <- rfe_results$optimization
        # Add configuration and summary
        complete_results$results$rfe$config <- list(
          subset_size_type = multivariate_analysis$rfe$subsetSizeType,
          metric = multivariate_analysis$rfe$metric,
          include_covariates = multivariate_analysis$rfe$includeCovariates,
          custom_subset_sizes = custom_sizes
        )
        complete_results$results$rfe$summary <- list(
          total_features = nrow(rfe_results$results),
          selected_features = length(rfe_results$selected_vars),
          optimal_subset_size = rfe_results$selected_size,
          subset_sizes_tested = if(!is.null(rfe_results$optimization)) unique(rfe_results$optimization$Variables) else NULL,
          dataset_dimensions = list(rows = nrow(mv_dataset), cols = ncol(mv_dataset))
        )
        write_log("RFE results stored successfully")
      } else {
        write_log("RFE returned no valid results", "WARN")
        complete_results$results$rfe$testName <- "Recursive Feature Elimination"
        complete_results$results$rfe$data <- data.frame()
        complete_results$results$rfe$selected_vars <- character(0)
        complete_results$results$rfe$selected_size <- 0
        complete_results$results$rfe$best_metric <- NA
        complete_results$results$rfe$optimization <- data.frame()
      }
      
    }, error = function(e) {
      error_msg <- paste("RFE analysis failed:", e$message)
      write_log(error_msg, "ERROR")
      write_log(paste("Error traceback:", toString(e)), "ERROR")
      # Don't stop the entire analysis, just log the error
      complete_results$results$rfe$testName <- "Recursive Feature Elimination"
      complete_results$results$rfe$error <- error_msg
      complete_results$results$rfe$data <- data.frame()
      complete_results$results$rfe$selected_vars <- character(0)
      complete_results$results$rfe$selected_size <- 0
      complete_results$results$rfe$best_metric <- NA
      complete_results$results$rfe$optimization <- data.frame()
    })
  } else if(multivariate_analysis$rfe$enabled == TRUE) {
    write_log("Skipping RFE due to missing values", "WARN")
  }
  
  complete_results$status <- "completed"
  complete_results$time_end <- as.character(Sys.time())
  complete_results$timestamp <- as.character(Sys.time())
  
  # Log completion summary
  analysis_duration <- difftime(complete_results$time_end, complete_results$time_start, units = "secs")
  
  # Add comprehensive analysis summary
  analysis_methods_run <- names(complete_results$results)
  total_sig_results <- 0
  total_fdr_sig_results <- 0
  
  # Calculate overall significance statistics
  for (method in analysis_methods_run) {
    if (!is.null(complete_results$results[[method]]$summary)) {
      if (!is.null(complete_results$results[[method]]$summary$significant_p005)) {
        total_sig_results <- total_sig_results + complete_results$results[[method]]$summary$significant_p005
      }
      if (!is.null(complete_results$results[[method]]$summary$significant_fdr005)) {
        total_fdr_sig_results <- total_fdr_sig_results + complete_results$results[[method]]$summary$significant_fdr005
      }
    }
  }
  
  complete_results$analysis_summary <- list(
    total_duration_seconds = as.numeric(analysis_duration),
    methods_completed = length(analysis_methods_run),
    methods_run = analysis_methods_run,
    total_significant_p005 = total_sig_results,
    total_significant_fdr005 = total_fdr_sig_results,
    bivariate_methods = length(intersect(analysis_methods_run, c("student-t", "welch-t", "wilcoxon", "anova", "welch-anova", "kruskal-wallis", "pearson", "spearman", "linearregression"))),
    multivariate_methods = length(intersect(analysis_methods_run, c("ridge", "lasso", "elasticNet", "randomForest", "boruta", "rfe")))
  )
  
  write_log("=== ANALYSIS COMPLETED ===")
  write_log(paste("Total analysis duration:", round(as.numeric(analysis_duration), 2), "seconds"))
  write_log(paste("Number of analysis types completed:", length(complete_results$results)))
  write_log(paste("Analysis methods run:", paste(names(complete_results$results), collapse = ", ")))
  write_log(paste("Total significant results (p < 0.05):", total_sig_results))
  write_log(paste("Total FDR significant results (FDR < 0.05):", total_fdr_sig_results))
  
  log_function("main_analysis", "EXIT", paste("- Duration:", round(as.numeric(analysis_duration), 2), "sec"))
  return(complete_results)
}

# Get command line arguments
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  stop("No arguments provided")
}

# Parse JSON arguments - either from command line or from file
if (file.exists(args[1])) {
  # Read from file (new method)
  tryCatch({
    input_data <- fromJSON(args[1], simplifyVector = FALSE)
  }, error = function(e) {
    stop(paste("Failed to parse JSON from file:", args[1], "Error:", e$message))
  })
} else {
  # Parse from command line string (fallback)
  tryCatch({
    input_data <- fromJSON(args[1], simplifyVector = FALSE)
  }, error = function(e) {
    stop(paste("Failed to parse JSON from command line. Error:", e$message))
  })
}

input_file <- input_data$input_file
output_dir <- input_data$output_dir
preprocessing_options <- input_data$preprocessing_options
analysis_options <- input_data$analysis_options
analysis_id <- input_data$analysis_id

# Initialize logging system FIRST, before any log messages
log_file_path <- init_logging(output_dir, analysis_id)

write_log("=== PARSING COMMAND LINE ARGUMENTS ===")
write_log(paste("Number of arguments:", length(args)))
write_log(paste("First argument:", args[1]))
write_log("Successfully parsed JSON configuration")

write_log("=== CONFIGURATION EXTRACTED ===")
write_log(paste("Input file:", input_file))
write_log(paste("Output directory:", output_dir))
write_log(paste("Analysis ID:", analysis_id))
write_log(paste("Log file initialized:", log_file_path))

# Validate input file exists
if (!file.exists(input_file)) {
  write_log(paste("Input file does not exist:", input_file), "ERROR")
  stop(paste("Input file does not exist:", input_file))
}
write_log("Input file validation: PASSED")

write_log("Output directory validation: PASSED")

write_log("=== STARTING ANALYSIS EXECUTION ===")

# Initialize final_result variable
final_result <- NULL

tryCatch({
  # Perform the main analysis
  final_result <- main_analysis(input_file, preprocessing_options, analysis_options, analysis_id)
  write_log("Analysis completed successfully")
  
}, error = function(e) {
  write_log(paste("Analysis failed with error:", e$message), "ERROR")
  final_result <- list(
    success = FALSE,
    message = paste("Analysis failed:", e$message),
    results = NULL,
    analysis_id = analysis_id,
    error = e$message,
    status = "error",
    timestamp = as.character(Sys.time())
  )
})

# Output JSON result
write_log("=== GENERATING OUTPUT ===")

# Safety check for final_result
if (is.null(final_result)) {
  write_log("final_result is NULL - creating error result", "ERROR")
  final_result <- list(
    success = FALSE,
    message = "Analysis failed: final_result is NULL",
    results = NULL,
    analysis_id = analysis_id,
    error = "final_result is NULL",
    status = "error",
    timestamp = as.character(Sys.time())
  )
}

json_output <- toJSON(final_result, auto_unbox = TRUE, pretty = FALSE)
json_size <- nchar(json_output)
write_log(paste("JSON output size:", json_size, "characters"))

if (final_result$status == "completed") {
  write_log("Analysis completed successfully - outputting results")
} else {
  write_log("Analysis had errors - outputting error information", "WARN")
}

write_log("=== ANALYSIS SCRIPT FINISHED ===")
cat(json_output)
