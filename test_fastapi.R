# test_fastapi.R

# Questi sono gli argomenti 
args <- commandArgs(trailingOnly = TRUE)

if (length(args) == 0) {
  # se è vuoto
  result <- list(
    message = "Sei su R ora, brutto cogli...",
    timestamp = Sys.time(),
    numbers = 1:10
  )
} else {
  
  library(jsonlite)
  
  #JSONIZZO
  input_data <- fromJSON(args[1])
  numbers <- as.numeric(input_data$numbers)
  
  #Genero roba a caso con R
  result <- list(
    message = "R script ha funzionato",
    timestamp = Sys.time(),
    input_numbers = numbers,
    random_data = rnorm(numbers, mean = 50, sd = 10),
    summary_stats = list(
      mean = mean(rnorm(numbers, mean = 50, sd = 10)),
      sd = sd(rnorm(numbers, mean = 50, sd = 10)),
      count = numbers
    )
  )
}

#Restituisco il JSON
cat(toJSON(result, auto_unbox = TRUE, pretty = FALSE))
