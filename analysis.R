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

# Helper functions for analysis
do_student_t_test <- function(data, group_var, groups, omics_vars) {
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
    select(Variable, estimate, estimate1, estimate2, statistic, p.value, parameter, conf.low, conf.high, method) %>% 
    rename("pValue" = "p.value")
  
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  results
}

do_welch_t_test <- function(data, group_var, groups, omics_vars) {
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
    select(Variable, estimate, estimate1, estimate2, statistic, p.value, parameter, conf.low, conf.high, method) %>% 
    rename("pValue" = "p.value") 
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  results
}

do_wilcoxon_test <- function(data, group_var, groups, omics_vars) {
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
    select(Variable, statistic, p.value, method, alternative, median_diff) %>% 
    rename("pValue" = "p.value", "estimate" = "median_diff") 
  results$fdr <- p.adjust(results$pValue, method = "fdr")
  results
}

do_anova_test <- function(data, omics_vars) {
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
  
  return(list("results" = anova_results, "posthoc_results" = posthoc_results))
}

do_welch_anova_test <- function(data, omics_vars) {
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
  
  return(list("results" = anova_results, "posthoc_results" = posthoc_results))
}

do_kw_test <- function(data, omics_vars) {
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
  
  return(list("results" = kw_results, "posthoc_results" = posthoc_results))
}

do_pearson_test <- function(data, outcome, omics_vars) {
  pearson_results <- NULL
  
  for(var in omics_vars) {
    results <- cor_test(outcome, var, data = data, method = "pearson") %>% 
      dplyr::select(-c("var1", "statistic", "conf.low", "conf.high", "method")) %>% 
      dplyr::rename("Variable" = "var2") %>% 
      dplyr::rename("pValue" = "p")
    pearson_results <- bind_rows(pearson_results, results)
  }
  return(list("results" = pearson_results))
}

do_spearman_test <- function(data, outcome, omics_vars) {
  spearman_results <- NULL
  
  for(var in omics_vars) {
    results <- cor_test(outcome, var, data = data, method = "spearman") %>% 
      dplyr::select(-c("var1", "statistic", "method")) %>% 
      dplyr::rename("Variable" = "var2") %>% 
      dplyr::rename("pValue" = "p")
    spearman_results <- bind_rows(spearman_results, results)
  }
  return(list("results" = spearman_results))
}

do_lr <- function(data, outcome, covariates, omics_vars, remove_infl) {
  results <- NULL
  remove_infl_results <- NULL
  
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
      
      remove_infl_data <- data[as.numeric(dplyr::filter(infl_points, influential == FALSE) %>% pull(obs_id)),]
      
      remove_infl_model <- lm(as.formula(form), data = remove_infl_data)
      remove_infl_results <- bind_rows(remove_infl_results, tidy(remove_infl_model) %>% 
                                      dplyr::filter(term == var) %>% 
                                      mutate("removed_influentials" = nrow(dplyr::filter(infl_points, influential == TRUE))) %>% 
                                      rename("Variable" = "term"))
    }
  }
  
  return(list("results" = results, "removed_influentials_results" = remove_infl_results))
}

prepare_mv_dataset <- function(data, id_column, group_column, covariates, remove_cov) {
  dt <- data %>% dplyr::select(-c(!!sym(id_column), !!sym(group_column)))
  
  if(remove_cov == TRUE & !is.null(covariates)) {
    dt <- dt %>% dplyr::select(!any_of(covariates))
  }
  
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
  } else {
    lambda_grid <- expand.grid(
      alpha = 0,
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
  }
  
  set.seed(1234)
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
  
  return(list("chosen_lambda" = chosen_lambda, "best_metric" = chosen_metric, "coef_table" = coef_table, 
              "metric_lambda" = ridge_model$results, "coefs_lambda"= coefs_lambdas))
}

do_lasso <- function(data, outcome, lambdasel, lbdmin, lbdmax, lbdstep, lbdrule, metric) {
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
  } else {
    lambda_grid <- expand.grid(
      alpha = 1,
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
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
  
  return(list("chosen_lambda" = chosen_lambda, "best_metric" = chosen_metric, "coef_table" = coef_table, 
              "metric_lambda" = lasso_model$results, "coefs_lambda"= coefs_lambdas))
}

do_enet <- function(data, outcome, lambdasel, lbdmin, lbdmax, lbdstep, lbdrule, metric) {
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
  } else {
    lambda_grid <- expand.grid(
      alpha = seq(0.1, 1, by = 0.1), 
      lambda = 10^seq(lbdmin, lbdmax, by = lbdstep)
    )
  }
  
  set.seed(1234)
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
  
  return(list("chosen_lambda" = chosen_lambda, "chosen_alpha" = chosen_alpha, "best_metric" = chosen_metric, 
              "coef_table" = coef_table, "metric_lambda" = enet_model$results, "coefs_lambda"= coefs_lambdas))
}

do_rf <- function(data, outcome, my_ntree, mtry_opt, my_mtry) {
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
  } else if(mtry_opt == "tuning") {
    grid <- NULL
    tl <- 10
  } else {
    grid <- expand.grid(mtry = my_mtry)
    tl <- NULL
  }
  
  set.seed(1234)
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
  
  return(list("results" = importance, "chosen_mtry" = chosen_mtry, "best_metric" = chosen_metric, 
              "mtry_tuning" = rf_caret$results))
}

do_boruta <- function(data, outcome, my_ntree, max_runs, mtry_opt, my_mtry, rft) {
  form <- paste0(outcome, " ~ .")
  
  if(mtry_opt == "automatic") {
    my_mtry <- max(floor((ncol(data)-1)/3), 1)
  } 
  
  set.seed(1234)
  boruta <- Boruta(as.formula(form), data = data, 
                   ntree = my_ntree, maxRuns = max_runs, doTrace = 0)
  
  if(rft == TRUE) {
    boruta <- TentativeRoughFix(boruta)
  }
  
  results <- attStats(boruta) %>% as_tibble(rownames = "Variable")
  selected_vars <- getSelectedAttributes(boruta) 
  
  return(list("results" = results, "selected_vars" = selected_vars))
}

do_rfe <- function(data, outcome, subset_selection, my_subset_size, metric) {
  form <- paste0(outcome, " ~ .")
  
  if(subset_selection == "automatic") {
    my_subset_size <- exp(seq(log(5), log(ncol(data)-1), length.out = 10))
    my_subset_size <- round(my_subset_size / 5) * 5
    my_subset_size <- unique(my_subset_size)
  }
  
  if(metric == "rmse") {
    metric <- "RMSE"
  } else {
    metric <- "Rsquared"
  }
  
  rfe_control <- rfeControl(functions = rfFuncs,
                            method = "cv", 
                            number = 10,
                            verbose = FALSE,
                            saveDetails = TRUE,
                            returnResamp = "all")
  
  set.seed(1234)
  rfe_results <- rfe(as.formula(form), data = data, 
                     sizes = my_subset_size, metric = metric,
                     rfeControl = rfe_control,
                     preProcess = c("center", "scale", "nzv"))
  
  selected_vars <- rfe_results$optVariables
  selected_size <- rfe_results$optsize
  best_metric <- rfe_results$results %>% dplyr::filter(Variables == selected_size) %>% pull(!!sym(metric))
  optimization <- rfe_results$results
  
  importance <- varImp(rfe_results$fit, scale = TRUE) %>% 
    as_tibble(rownames = "Variable") %>% 
    rename("importance" = "Overall")
  
  return(list("selected_vars" = selected_vars, "selected_size" = selected_size, "best_metric" = best_metric, 
              "optimization" = optimization, "results" = importance))
}

# Main analysis function
main_analysis <- function(input_file, preprocessing_options, analysis_options, analysis_id) {
  
  # Read the input file
  file_ext <- tolower(tools::file_ext(input_file))
  
  if (file_ext %in% c("csv")) {
    dataset <- read_csv(input_file, show_col_types = FALSE)
  } else if (file_ext %in% c("txt", "tsv")) {
    dataset <- read_tsv(input_file, show_col_types = FALSE)
  } else {
    stop(paste("Unsupported file format:", file_ext))
  }
  
  # Get column classifications
  column_classification <- preprocessing_options$columnClassification
  
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
  
  if (is.numeric(column_classification$outcomeColumn)) {
    outcome_col <- names(dataset)[column_classification$outcomeColumn + 1]
  } else {
    outcome_col <- column_classification$outcomeColumn
  }
  
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
  
  # DIAGNOSTIC: Print column identification results
  cat("=== COLUMN IDENTIFICATION ===\n", file = stderr())
  cat("Dataset dimensions:", nrow(dataset), "x", ncol(dataset), "\n", file = stderr())
  cat("ID column:", id_col, "\n", file = stderr())
  cat("Outcome column:", outcome_col, "\n", file = stderr())
  cat("Covariate columns:", length(covariate_cols %||% c()), "columns\n", file = stderr())
  cat("Omics columns:", length(omics_cols %||% c()), "columns\n", file = stderr())
  cat("Grouping method:", analysis_options$groupingMethod, "\n", file = stderr())
  cat("============================\n", file = stderr())
  
  tests_list <- unlist(analysis_options$statisticalTests)
  
  # DIAGNOSTIC: Print selected tests
  cat("=== SELECTED TESTS ===\n", file = stderr())
  cat("Statistical tests:", paste(tests_list, collapse = ", "), "\n", file = stderr())
  cat("Linear regression:", analysis_options$linearRegression, "\n", file = stderr())
  cat("Multivariate enabled:", !is.null(analysis_options$multivariateAnalysis), "\n", file = stderr())
  cat("=====================\n", file = stderr())
  complete_results <- list()
  complete_results$id <- analysis_id
  complete_results$time_start <- Sys.time()
  
  # Create grouping variable based on tertiles or thresholds
  if(analysis_options$groupingMethod == "tertiles") {
    tertiles <- quantile(dataset[[outcome_col]], probs = c(0, 1/3, 2/3, 1), na.rm = TRUE)
    groups <- c("1t", "3t")
    dataset <- dataset %>% mutate(
      group = cut(!!sym(outcome_col),
                  breaks = tertiles,
                  labels = c("1t", "2t", "3t"),
                  include.lowest = TRUE)
    )
  } else if(analysis_options$groupingMethod == "threshold") {
    if(analysis_options$thresholdValues[[1]] == analysis_options$thresholdValues[[2]]) {
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
  }
  
  # Statistical Tests
  if("student-t" %in% tests_list && analysis_options$groupingMethod != "none") {
    student_t_test_results <- do_student_t_test(dataset, "group", groups, omics_cols)
    complete_results$results$`student-t`$testName <- "Student T-Test"
    complete_results$results$`student-t`$data <- student_t_test_results
  }
  
  if("welch-t" %in% tests_list && analysis_options$groupingMethod != "none") {
    welch_t_test_results <- do_welch_t_test(dataset, "group", groups, omics_cols)
    complete_results$results$`welch-t`$testName <- "Welch T-Test"
    complete_results$results$`welch-t`$data <- welch_t_test_results
  }
  
  if("wilcoxon" %in% tests_list && analysis_options$groupingMethod != "none") {
    wilcoxon_test_results <- do_wilcoxon_test(dataset, "group", groups, omics_cols)
    complete_results$results$wilcoxon$testName <- "Wilcoxon Test"
    complete_results$results$wilcoxon$data <- wilcoxon_test_results
  }
  
  if("anova" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        anova_test_results <- do_anova_test(dataset, omics_cols)
        complete_results$results$anova$testName <- "ANOVA Test"
        complete_results$results$anova$data <- anova_test_results$results
        complete_results$results$anova$posthoc_data <- anova_test_results$posthoc_results
      }
    } else {
      anova_test_results <- do_anova_test(dataset, omics_cols)
      complete_results$results$anova$testName <- "ANOVA Test"
      complete_results$results$anova$data <- anova_test_results$results
      complete_results$results$anova$posthoc_data <- anova_test_results$posthoc_results
    }
  }
  
  if("welch-anova" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        welch_anova_test_results <- do_welch_anova_test(dataset, omics_cols)
        complete_results$results$`welch-anova`$testName <- "Welch-ANOVA Test"
        complete_results$results$`welch-anova`$data <- welch_anova_test_results$results
        complete_results$results$`welch-anova`$posthoc_data <- welch_anova_test_results$posthoc_results
      }
    } else {
      welch_anova_test_results <- do_welch_anova_test(dataset, omics_cols)
      complete_results$results$`welch-anova`$testName <- "Welch-ANOVA Test"
      complete_results$results$`welch-anova`$data <- welch_anova_test_results$results
      complete_results$results$`welch-anova`$posthoc_data <- welch_anova_test_results$posthoc_results
    }
  }
  
  if("kruskal-wallis" %in% tests_list && analysis_options$groupingMethod != "none") {
    if(analysis_options$groupingMethod != "tertiles") {
      if(analysis_options$thresholdValues[[1]] != analysis_options$thresholdValues[[2]]) {
        kw_test_results <- do_kw_test(dataset, omics_cols)
        complete_results$results$`kruskal-wallis`$testName <- "Kruskal-Wallis Test"
        complete_results$results$`kruskal-wallis`$data <- kw_test_results$results
        complete_results$results$`kruskal-wallis`$posthoc_data <- kw_test_results$posthoc_results
      }
    } else {
      kw_test_results <- do_kw_test(dataset, omics_cols)
      complete_results$results$`kruskal-wallis`$testName <- "Kruskal-Wallis Test"
      complete_results$results$`kruskal-wallis`$data <- kw_test_results$results
      complete_results$results$`kruskal-wallis`$posthoc_data <- kw_test_results$posthoc_results
    }
  }
  
  if("pearson" %in% tests_list) {
    pearson_test_results <- do_pearson_test(dataset, outcome_col, omics_cols)
    complete_results$results$pearson$testName <- "Pearson Correlation Test"
    complete_results$results$pearson$data <- pearson_test_results$results
  }
  
  if("spearman" %in% tests_list) {
    spearman_test_results <- do_spearman_test(dataset, outcome_col, omics_cols)
    complete_results$results$spearman$testName <- "Spearman Correlation Test"
    complete_results$results$spearman$data <- spearman_test_results$results
  }
  
  if(analysis_options$linearRegression == TRUE) {
    lr_results <- do_lr(dataset, outcome_col, covariate_cols, omics_cols, 
                       analysis_options$linearRegressionWithoutInfluentials)
    complete_results$results$linearregression$testName <- "Linear Regression"
    complete_results$results$linearregression$data <- lr_results$results
    complete_results$results$linearregression$data_removed_influentials <- lr_results$removed_influentials_results
  }
  
  # Multivariate Analysis
  multivariate_analysis <- analysis_options$multivariateAnalysis
  
  # Ridge Regression
  if(multivariate_analysis$ridge$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$ridge$includeCovariates)
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
  }
  
  # Lasso Regression
  if(multivariate_analysis$lasso$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$lasso$includeCovariates)
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
  }
  
  # Elastic Net
  if(multivariate_analysis$elasticNet$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$elasticNet$includeCovariates)
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
  }
  
  # Random Forest
  if(multivariate_analysis$randomForest$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$randomForest$includeCovariates)
    rf_results <- do_rf(mv_dataset, outcome_col, 
                        multivariate_analysis$randomForest$ntree,
                        multivariate_analysis$randomForest$mtrySelection,
                        multivariate_analysis$randomForest$mtryValue)
    
    complete_results$results$randomForest$testName <- "Random Forest"
    complete_results$results$randomForest$data <- rf_results$results 
    complete_results$results$randomForest$best_metric <- rf_results$best_metric 
    complete_results$results$randomForest$chosen_mtry <- rf_results$chosen_mtry
    complete_results$results$randomForest$mtry_tuning <- rf_results$mtry_tuning
  }
  
  # Boruta
  if(multivariate_analysis$boruta$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$boruta$includeCovariates)
    boruta_results <- do_boruta(mv_dataset, outcome_col, 
                                multivariate_analysis$boruta$ntree,
                                multivariate_analysis$boruta$maxRuns,
                                multivariate_analysis$boruta$mtrySelection,
                                multivariate_analysis$boruta$mtryValue,
                                multivariate_analysis$boruta$roughFixTentativeFeatures)
    
    complete_results$results$boruta$testName <- "Boruta Feature Selection"
    complete_results$results$boruta$data <- boruta_results$results
    complete_results$results$boruta$selected_vars <- boruta_results$selected_vars 
  }
  
  # RFE
  if(multivariate_analysis$rfe$enabled == TRUE && !any(is.na(dataset))) {
    mv_dataset <- prepare_mv_dataset(dataset, id_col, "group", covariate_cols, 
                                     !multivariate_analysis$rfe$includeCovariates)
    
    # Handle customSubsetSizes - should now be an array from FastAPI transformation
    custom_sizes <- multivariate_analysis$rfe$customSubsetSizes
    if (is.character(custom_sizes)) {
      # Fallback for string format
      custom_sizes <- as.numeric(trimws(strsplit(custom_sizes, ",")[[1]]))
    }
    
    rfe_results <- do_rfe(mv_dataset, outcome_col, 
                          multivariate_analysis$rfe$subsetSizeType,
                          custom_sizes,
                          multivariate_analysis$rfe$metric)
    
    complete_results$results$rfe$testName <- "Recursive Feature Elimination"
    complete_results$results$rfe$data <- rfe_results$results
    complete_results$results$rfe$selected_vars <- rfe_results$selected_vars
    complete_results$results$rfe$selected_size <- rfe_results$selected_size
    complete_results$results$rfe$best_metric <- rfe_results$best_metric
    complete_results$results$rfe$optimization <- rfe_results$optimization
  }
  
  complete_results$status <- "completed"
  complete_results$time_end <- as.character(Sys.time())
  complete_results$timestamp <- as.character(Sys.time())
  
  return(complete_results)
}

# Get command line arguments
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  stop("No arguments provided")
}

# Parse JSON arguments
input_data <- fromJSON(args[1])

input_file <- input_data$input_file
output_dir <- input_data$output_dir
preprocessing_options <- input_data$preprocessing_options
analysis_options <- input_data$analysis_options
analysis_id <- input_data$analysis_id

# DIAGNOSTIC: Print received options to stderr for PowerShell visibility
cat("=== ANALYSIS.R DIAGNOSTICS ===\n", file = stderr())
cat("Analysis ID:", analysis_id, "\n", file = stderr())
cat("Input file:", input_file, "\n", file = stderr())
cat("Output directory:", output_dir, "\n", file = stderr())
cat("Preprocessing options:\n", file = stderr())
cat(toJSON(preprocessing_options, auto_unbox = TRUE, pretty = TRUE), "\n", file = stderr())
cat("Analysis options:\n", file = stderr())
cat(toJSON(analysis_options, auto_unbox = TRUE, pretty = TRUE), "\n", file = stderr())
cat("===============================\n", file = stderr())

tryCatch({
  # DIAGNOSTIC: Print analysis start
  cat("=== STARTING ANALYSIS ===\n", file = stderr())
  cat("Time:", as.character(Sys.time()), "\n", file = stderr())
  cat("========================\n", file = stderr())
  
  # Perform the main analysis
  final_result <- main_analysis(input_file, preprocessing_options, analysis_options, analysis_id)
  
  # DIAGNOSTIC: Print analysis completion
  cat("=== ANALYSIS COMPLETED ===\n", file = stderr())
  cat("Status:", final_result$status, "\n", file = stderr())
  if (!is.null(final_result$results)) {
    cat("Number of analysis results:", length(final_result$results), "\n", file = stderr())
    cat("Analysis types completed:", paste(names(final_result$results), collapse = ", "), "\n", file = stderr())
  }
  cat("Time end:", final_result$time_end, "\n", file = stderr())
  cat("==========================\n", file = stderr())
  
}, error = function(e) {
  # DIAGNOSTIC: Print error info
  cat("=== ANALYSIS ERROR ===\n", file = stderr())
  cat("Error message:", e$message, "\n", file = stderr())
  cat("======================\n", file = stderr())
  
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

# DIAGNOSTIC: Print final result summary
cat("=== FINAL ANALYSIS RESULT ===\n", file = stderr())
cat("Analysis ID:", final_result$analysis_id, "\n", file = stderr())
cat("Status:", final_result$status, "\n", file = stderr())
if (!is.null(final_result$message)) {
  cat("Message:", final_result$message, "\n", file = stderr())
}
if (!is.null(final_result$error)) {
  cat("Error:", final_result$error, "\n", file = stderr())
}
cat("=============================\n", file = stderr())

# Output JSON result
cat(toJSON(final_result, auto_unbox = TRUE, pretty = FALSE))
