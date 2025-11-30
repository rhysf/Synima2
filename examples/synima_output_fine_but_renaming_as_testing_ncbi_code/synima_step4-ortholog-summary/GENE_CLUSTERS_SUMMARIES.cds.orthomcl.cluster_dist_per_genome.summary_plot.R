core1_counts <- c(5897, 5897, 5897, 5897)
corem_counts <- c(179, 193, 185, 183)
aux_counts <- c(476, 214, 481, 388)
uniq_counts <- c(131, 152, 133, 97)
genomes <- c('CA1280', 'CNB2', 'IND107', 'WM276')

library(ggplot2)

df <- data.frame(
  genome = rep(genomes, times = 4),
  class = factor(
    rep(c("core_1to1", "core_multi", "aux", "unique"), each = length(genomes)),
    levels = c("core_1to1", "core_multi", "aux", "unique")
  ),
  count  = c(core1_counts, corem_counts, aux_counts, uniq_counts)
)

p <- ggplot(df, aes(x = genome, y = count, fill = class)) +
  geom_bar(
    stat = "identity", 
    position = position_stack(reverse = TRUE)
  ) +
  theme_minimal(base_size = 12) +
  theme(
    axis.text.x = element_text(angle = 45, hjust = 1),
    legend.position = "right"
  ) +
  labs(
    title = "Distribution of core (1:1 and multi), accessory, and unique genes",
    x = "Genome Assembly",
    y = "Number of genes",
    fill = "Class"
  ) +
  scale_fill_brewer(
    palette = "Set2",
    guide = guide_legend(reverse = TRUE)
  )

# PDF output
ggsave(filename = "examples/synima_output/synima_step4-ortholog-summary/GENE_CLUSTERS_SUMMARIES.cds.orthomcl.cluster_dist_per_genome.summary_plot.pdf", 
plot = p, width = 7, height = 5)

# PNG output
ggsave(filename = "examples/synima_output/synima_step4-ortholog-summary/GENE_CLUSTERS_SUMMARIES.cds.orthomcl.cluster_dist_per_genome.summary_plot.png", 
plot = p, width = 7, height = 5, dpi = 300)
