// src/views/LabyrinthView.ts (Enhanced Correlation Analysis and Minotaur Display)

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { LossLogService } from "../services/LossLogService";
import { LossLogDeferredModal } from "../modals/LossLogDeferredModal";
import { EVENT_MINOTAUR_UPDATED, EVENT_LOSS_LOGGED, FailureArchetype, FailureType, LossLogData } from "../constants";

export const LABYRINTH_VIEW_TYPE = "labyrinth-view";

export class LabyrinthView extends ItemView {
  private lossLogService: LossLogService;

  constructor(leaf: WorkspaceLeaf, lossLogService: LossLogService) {
    super(leaf);
    this.lossLogService = lossLogService;
  }

  getViewType(): string {
    return LABYRINTH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Labyrinth of Loss";
  }

  getIcon(): string {
    return "workflow"; // Placeholder icon
  }

  async onOpen() {
    console.log("[LabyrinthView] Opened.");
    this.render();

    // Listen for Minotaur updates to refresh the view
    this.lossLogService.onMinotaurUpdated(this.handleMinotaurUpdate.bind(this));
    // Listen for new logs to potentially update stats/lists if needed
    this.lossLogService.onLossLogged(this.handleNewLog.bind(this));
  }

  async onClose() {
    // Unregister event listeners to prevent memory leaks
    this.lossLogService.offMinotaurUpdated(this.handleMinotaurUpdate.bind(this));
    this.lossLogService.offLossLogged(this.handleNewLog.bind(this));
    console.log("[LabyrinthView] Closed.");
  }

  private handleMinotaurUpdate(payload: { oldMinotaur: string; newMinotaur: string }): void {
    console.log(`[LabyrinthView] Received Minotaur update event: ${payload.oldMinotaur} -> ${payload.newMinotaur}`);
    this.render(); // Re-render the view when the Minotaur changes
  }

  private handleNewLog(payload: { log: LossLogData, notePath: string }): void {
    console.log(`[LabyrinthView] Received new log event for: ${payload.notePath}`);
    // For now, just re-render to potentially update stats/lists
    // In a more complex view, you might update specific parts of the DOM.
    this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty(); // Clear previous content
    contentEl.addClass("labyrinth-view"); // Add a class for potential custom styling

    // --- Header ---
    contentEl.createEl("h2", { text: "The Labyrinth of Loss" });

    // --- Current Minotaur Section ---
    const minotaurSection = contentEl.createDiv({ cls: "minotaur-section" });
    minotaurSection.createEl("h3", { text: "Current Minotaur" });

    const currentMinotaur = this.lossLogService.getCurrentMinotaur(); // Use public getter
    if (currentMinotaur) {
      minotaurSection.createEl("p", { text: `The dominant failure archetype is: **${currentMinotaur}**`, cls: "current-minotaur-display" });
    } else {
      minotaurSection.createEl("p", { text: "No Minotaur identified yet. Log some failures first.", cls: "no-minotaur-message" });
    }

    // --- Minotaur History Section (L98) ---
    this.renderMinotaurHistorySection(contentEl);

    // --- Pending Logs Section ---
    const pendingSection = contentEl.createDiv({ cls: "pending-section" });
    pendingSection.createEl("h3", { text: "Pending Logs" });

    const pendingLogs = this.lossLogService.getPendingLogs();
    if (pendingLogs.length > 0) {
      const listEl = pendingSection.createEl("ul", { cls: "pending-logs-list" });
      pendingLogs.forEach((pendingItem, index) => {
        const itemEl = listEl.createEl("li", { cls: "pending-log-item" });
        itemEl.createSpan({ text: pendingItem.sourceTask });
        itemEl.createEl("button", {
          text: "Process",
          cls: "process-deferred-btn",
          attr: { "data-index": index },
        }).addEventListener("click", (event) => {
          event.preventDefault();
          this.openDeferredModal(pendingItem, index);
        });
      });
    } else {
      pendingSection.createEl("p", { text: "No deferred logs to process.", cls: "no-pending-message" });
    }

    // --- Analysis Section ---
    await this.renderAnalysisSection(contentEl);

    // --- Action Buttons Section (Optional) ---
    const actionsSection = contentEl.createDiv({ cls: "actions-section" });
    actionsSection.createEl("h3", { text: "Actions" });

    actionsSection.createEl("button", {
      text: "Recalculate Minotaur",
      cls: "recalculate-minotaur-btn",
    }).addEventListener("click", () => {
        console.log("[LabyrinthView] Recalculating Minotaur...");
        this.lossLogService.recalculateMinotaur().catch((e) =>
            console.error("[LabyrinthView] Error recalculating Minotaur:", e)
        );
    });

    if (pendingLogs.length > 0) {
        actionsSection.createEl("button", {
        text: "Clear All Pending",
        cls: "clear-pending-btn",
        }).addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all pending logs? This cannot be undone.")) {
                this.lossLogService.clearPendingLogs();
                this.render(); // Re-render to update the list
            }
        });
    }

    actionsSection.createEl("button", {
      text: "Log New Failure",
      cls: "log-new-failure-btn",
    }).addEventListener("click", () => {
        this.app.commands.executeCommandById('mythic-matrix:labyrinth-log-failure');
    });

    
  }

  // --- NEW/REFINED: Render Analysis Section (L10, L11, L46, L48, L13, L9) ---
  private async renderAnalysisSection(contentEl: HTMLElement) {
    const analysisSection = contentEl.createDiv({ cls: "analysis-section" });
    analysisSection.createEl("h3", { text: "Analysis" });

    const folderPath = this.lossLogService.getLossLogFolder(); // Use public getter
    const allFiles = this.app.vault.getMarkdownFiles();
    const labyrinthFiles = allFiles.filter(file => file.path.startsWith(folderPath));

    

    if (labyrinthFiles.length === 0) {
        analysisSection.createEl("p", { text: "No loss logs found for analysis.", cls: "no-logs-message" });
        return;
    }

    // Read and parse frontmatter for *all* logs to calculate stats
    const allLogs: LossLogData[] = [];
    for (const file of labyrinthFiles) {
      try {
        const fileContent = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache && cache.frontmatter) {
          // Reconstruct LossLogData from frontmatter (as done in updateMinotaurAsync and LossLogService)
          const logData: LossLogData = {
            lossId: cache.frontmatter.lossId as string,
            sourceTask: cache.frontmatter.sourceTask as string,
            failureType: cache.frontmatter.failureType as FailureType,
            failureArchetypes: (cache.frontmatter.failureArchetypes as string[]) || [],
            impact: cache.frontmatter.impact as number || 1,
            syllabusTopics: (cache.frontmatter.syllabusTopics as string[]) || [],
            syllabusPapers: (cache.frontmatter.syllabusPapers as string[]) || [],
            aura: cache.frontmatter.aura as string || "#aura-mid",
            emotionalState: cache.frontmatter.emotionalState as string,
            rootCauseChain: (cache.frontmatter.rootCauseChain as string[]) || [],
            ariadnesThread: cache.frontmatter.ariadnesThread as string || "",
            counterFactual: cache.frontmatter.counterFactual as string,
            evidenceLink: cache.frontmatter.evidenceLink as string,
            linkedMockTest: cache.frontmatter.linkedMockTest as string,
            timestamp: cache.frontmatter.timestamp as string || new Date().toISOString(), // Fallback to now if missing
            provenance: cache.frontmatter.provenance as any
          };
          allLogs.push(logData);
        }
      } catch (e) {
        console.error(`[LabyrinthView] Error reading/parsing file ${file.path} for analysis:`, e);
      }
    }

    if (allLogs.length === 0) {
        analysisSection.createEl("p", { text: "Could not parse any loss logs for analysis.", cls: "parse-error-message" });
        return;
    }

    // --- NEW: Process Failure Pattern Detection (L84) ---
    const processFailurePatternSection = contentEl.createDiv({ cls: "process-failure-pattern-section" });
    processFailurePatternSection.createEl("h4", { text: "Process Failure Patterns (L84)" });

    const processFailureLogs = allLogs.filter(log => log.failureType === "Process Failure");
    const patternInsights: string[] = [];

    // Example: Check for failures occurring shortly *after* mock tests (post-mock review)
    const linkedMockRegex = /Mock Test \d+/i; // Basic regex to find mock test references
    const postMockLogs = processFailureLogs.filter(log => log.linkedMockTest && log.timestamp);

    if (postMockLogs.length > 0) {
        // Group by the linked mock test
        const logsByMock: Record<string, LossLogData[]> = {};
        postMockLogs.forEach(log => {
            const mockMatch = log.linkedMockTest?.match(linkedMockRegex);
            if (mockMatch) {
                const mockName = mockMatch[0];
                if (!logsByMock[mockName]) logsByMock[mockName] = [];
                logsByMock[mockName].push(log);
            }
        });

        for (const [mockName, logs] of Object.entries(logsByMock)) {
            if (logs.length >= 2) { // At least 2 failures after the same mock
                // Calculate average time between mock completion and failure log creation
                // (This requires knowing *when* the mock *started/completed*. Using log timestamp as a proxy for *failure discovery/acknowledgment*).
                // For simplicity, just check if multiple *different* types of process failures happened after the same mock.
                const uniqueArchetypes = new Set(logs.flatMap(log => log.failureArchetypes));
                if (uniqueArchetypes.size > 1) {
                    patternInsights.push(`Post-${mockName} Workflow: Multiple different process failure archetypes (${Array.from(uniqueArchetypes).join(", ")}) occurred after this mock test.`);
                } else if (logs.length >= 3) { // Or just a high frequency of *any* process failure after a specific mock
                    patternInsights.push(`Post-${mockName} Workflow: High frequency (${logs.length} logs) of process failures occurred after this mock test.`);
                }
            }
        }
    }

    // Example: Check for failures occurring during specific recurring tasks (e.g., "Review [[Topic X]]" tasks from Crucible)
    // This requires identifying recurring task patterns in the sourceTask text.
    // Example: "Review [[Constitution]]" or "Summarize [[Economy]]" or tasks containing specific keywords like "revise", "review", "practice".
    const revisionKeywords = ["revise", "review", "summarize", "practice", "recall"];
    const revisionRelatedLogs = processFailureLogs.filter(log =>
        revisionKeywords.some(keyword => log.sourceTask.toLowerCase().includes(keyword))
    );

    if (revisionRelatedLogs.length > 0) {
        // Group by the specific revision task pattern found
        const logsByKeyword: Record<string, LossLogData[]> = {};
        revisionRelatedLogs.forEach(log => {
            const foundKeyword = revisionKeywords.find(k => log.sourceTask.toLowerCase().includes(k));
            if (foundKeyword) {
                if (!logsByKeyword[foundKeyword]) logsByKeyword[foundKeyword] = [];
                logsByKeyword[foundKeyword].push(log);
            }
        });

        for (const [keyword, logs] of Object.entries(logsByKeyword)) {
            if (logs.length >= 3) { // At least 3 failures related to this type of task
                const uniqueTopics = new Set(logs.flatMap(log => log.syllabusTopics.map(t => t.replace(/\[\[|\]\]/g, ''))));
                if (uniqueTopics.size > 2) { // Across multiple different topics
                    patternInsights.push(`"${keyword}" Workflow: Frequent process failures (${logs.length} logs) occur across multiple topics (${Array.from(uniqueTopics).join(", ")}).`);
                }
            }
        }
    }

    // Example: Check for failures occurring within a short time *after* other specific failures (cascade effect)
    // This requires more complex temporal analysis, potentially grouping logs by time windows.
    // For now, let's keep it simpler and focus on the 'post-mock' and 'revision-workflow' examples above.

    if (patternInsights.length > 0) {
        const listEl = processFailurePatternSection.createEl("ul");
        patternInsights.forEach(insight => {
            listEl.createEl("li", { text: insight, cls: "pattern-insight-item" });
        });
    } else {
        processFailurePatternSection.createEl("p", { text: "No significant process failure patterns detected yet.", cls: "no-patterns-message" });
    }
    // --- END NEW ---

    // --- Perform View-Based Analysis (L13, L9) ---
    // Calculate archetype frequencies and weighted scores (using decay) within the view
    const now = new Date();
    const archetypeCounts: Record<FailureArchetype, number> = {} as Record<FailureArchetype, number>; // Count raw occurrences
    const archetypeWeightedScores: Record<FailureArchetype, number> = {} as Record<FailureArchetype, number>; // Sum weighted scores
    const decayFactorPerDay = 0.95; // Match the factor used in LossLogService
    const baseWeight = 1.0;

    allLogs.forEach(log => {
        const logDate = new Date(log.timestamp);
        const daysSinceLog = (now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24);
        const weight = baseWeight * Math.pow(decayFactorPerDay, daysSinceLog);

        log.failureArchetypes.forEach(archetype => {
            if (!archetypeCounts[archetype]) {
                archetypeCounts[archetype] = 0;
                archetypeWeightedScores[archetype] = 0;
            }
            archetypeCounts[archetype]++;
            archetypeWeightedScores[archetype] += weight;
        });
    });

    // --- Statistic 1: Top Failure Archetypes (L11) - Raw Count ---
    const topArchetypesRaw = Object.entries(archetypeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 by raw count

    if (topArchetypesRaw.length > 0) {
        const archetypeList = analysisSection.createEl("div", { cls: "top-archetypes-list" });
        archetypeList.createEl("h4", { text: "Top Failure Archetypes (Raw Count - L11)" });
        const listEl = archetypeList.createEl("ul");
        topArchetypesRaw.forEach(([archetype, count]) => {
            listEl.createEl("li", { text: `${archetype}: ${count} occurrences` });
        });
    }

    // --- NEW: Top Failure Archetypes (L9) - Weighted Score ---
    const topArchetypesWeighted = Object.entries(archetypeWeightedScores)
        .sort((a, b) => b[1] - a[1]) // Sort by weighted score descending
        .slice(0, 5); // Top 5 by weighted score

    if (topArchetypesWeighted.length > 0) {
        const weightedList = analysisSection.createEl("div", { cls: "top-archetypes-weighted-list" });
        weightedList.createEl("h4", { text: "Top Failure Archetypes (Weighted Score - L9)" });
        const listEl = weightedList.createEl("ul");
        topArchetypesWeighted.forEach(([archetype, score]) => {
            // Round the score for readability
            listEl.createEl("li", { text: `${archetype}: ${score.toFixed(2)} weighted score` });
        });
        // Optionally, highlight the current Minotaur within this list
        const currentMinotaur = this.lossLogService.getCurrentMinotaur();
        if (currentMinotaur) {
            const currentScore = archetypeWeightedScores[currentMinotaur];
            if (currentScore !== undefined) {
                weightedList.createEl("p", { text: `(*) Current Minotaur: ${currentMinotaur} has a weighted score of ${currentScore.toFixed(2)}.`, cls: "current-minotaur-score" });
            }
        }
    }

    // --- Statistic 2: Failure Types Distribution ---
    const typeCounts: Record<FailureType, number> = {
        "Knowledge Gap": 0,
        "Skill Gap": 0,
        "Process Failure": 0
    };
    allLogs.forEach(log => {
        typeCounts[log.failureType]++;
    });

    const typeList = analysisSection.createEl("div", { cls: "failure-type-list" });
    typeList.createEl("h4", { text: "Failure Types Distribution" });
    const typeListEl = typeList.createEl("ul");
    (Object.entries(typeCounts) as [FailureType, number][]).forEach(([type, count]) => {
        typeListEl.createEl("li", { text: `${type}: ${count}` });
    });

    // --- Statistic 3: Syllabus Paper Breakdown (L48) ---
    const paperCounts: Record<string, number> = {};
    allLogs.forEach(log => {
        log.syllabusPapers.forEach(paper => {
            if (!paperCounts[paper]) {
                paperCounts[paper] = 0;
            }
            paperCounts[paper]++;
        });
    });

    const paperList = analysisSection.createEl("div", { cls: "syllabus-paper-list" });
    paperList.createEl("h4", { text: "Failures by Syllabus Paper (L48)" });
    const paperListEl = paperList.createEl("ul");
    Object.entries(paperCounts).forEach(([paper, count]) => {
        paperListEl.createEl("li", { text: `${paper}: ${count} failures` });
    });

    // --- Statistic 4: Total Logs Count ---
    analysisSection.createEl("p", { text: `Total Loss Logs: ${allLogs.length}`, cls: "total-logs-count" });

    // --- Statistic 5: Golden Threads (Ariadne's Threads) (L46) ---
    const uniqueThreads = new Set(allLogs.map(log => log.ariadnesThread).filter(thread => thread.trim() !== ""));
    analysisSection.createEl("p", { text: `Unique Ariadne's Threads Captured: ${uniqueThreads.size}`, cls: "unique-threads-count" });

    // List recent threads
    if (uniqueThreads.size > 0) {
        const recentThreadsList = analysisSection.createEl("div", { cls: "recent-threads-list" });
        recentThreadsList.createEl("h4", { text: "Recent Ariadne's Threads (L46)" });
        const threadListEl = recentThreadsList.createEl("ul");
        const sortedLogs = allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const recentThreads = sortedLogs
            .map(log => log.ariadnesThread)
            .filter(thread => thread.trim() !== "")
            .slice(0, 5);

        recentThreads.forEach(thread => {
            threadListEl.createEl("li", { text: thread, cls: "ariadnes-thread-item" });
        });
    }

    // --- Correlation Analysis (L13) ---
    // Call the new method to render correlations, passing the collected logs
    this.renderCorrelationAnalysis(analysisSection, allLogs);

  }
  // --- END NEW/REFINED ---


  // --- NEW/REFINED: Render Correlation Analysis (L13) ---
  private renderCorrelationAnalysis(container: HTMLElement, allLogs: LossLogData[]) {
    const correlationSection = container.createDiv({ cls: "correlation-analysis-section" });
    correlationSection.createEl("h4", { text: "Correlation Insights (L13)" });

    const correlations = [];

    // Example 1: Aura vs. Specific Archetype (L83 concept applied broadly)
    const archetypeToCheck = 'silly-mistake';
    const auraToCheck = '#aura-low';
    const archetypeLogs = allLogs.filter(log => log.failureArchetypes.includes(archetypeToCheck));
    const auraLowLogs = allLogs.filter(log => log.aura === auraToCheck);
    const archetypeInAuraLowLogs = archetypeLogs.filter(log => log.aura === auraToCheck);

    if (archetypeLogs.length > 0 && auraLowLogs.length > 0) {
        const percentage = (archetypeInAuraLowLogs.length / archetypeLogs.length) * 100;
        if (percentage > 60) { // Threshold
            correlations.push({
                description: `**${archetypeToCheck}** and **${auraToCheck}**`,
                details: `${archetypeInAuraLowLogs.length}/${archetypeLogs.length} (${percentage.toFixed(2)}%) of '${archetypeToCheck}' logs occurred when aura was '${auraToCheck}'.`
            });
        }
    }

    // Example 2: Emotional State vs. Impact
    const emotionToCheck = 'Frustrated';
    const highImpactThreshold = 4;
    const emotionLogs = allLogs.filter(log => log.emotionalState === emotionToCheck);
    const highImpactLogs = allLogs.filter(log => log.impact >= highImpactThreshold);
    const emotionHighImpactLogs = emotionLogs.filter(log => log.impact >= highImpactThreshold);

    if (emotionLogs.length > 0 && highImpactLogs.length > 0) {
        const percentage = (emotionHighImpactLogs.length / emotionLogs.length) * 100;
        if (percentage > 60) {
            correlations.push({
                description: `**${emotionToCheck}** and **High Impact** (>=${highImpactThreshold})`,
                details: `${emotionHighImpactLogs.length}/${emotionLogs.length} (${percentage.toFixed(2)}%) of logs marked '${emotionToCheck}' were high impact.`
            });
        }
    }

    // Example 3: Failure Type vs. Impact
    const typeToCheck = 'Process Failure';
    const typeLogs = allLogs.filter(log => log.failureType === typeToCheck);
    const typeHighImpactLogs = typeLogs.filter(log => log.impact >= highImpactThreshold);

    if (typeLogs.length > 0) {
        const percentage = (typeHighImpactLogs.length / typeLogs.length) * 100;
        if (percentage > 60) {
            correlations.push({
                description: `**${typeToCheck}** and **High Impact** (>=${highImpactThreshold})`,
                details: `${typeHighImpactLogs.length}/${typeLogs.length} (${percentage.toFixed(2)}%) of '${typeToCheck}' logs were high impact.`
            });
        }
    }

    // --- NEW: Add more diverse correlation examples (L13) ---
    // Example 4: Impact vs. Emotional State
    const highImpactLogsForEmotion = allLogs.filter(log => log.impact >= highImpactThreshold);
    const frustratedHighImpactLogs = highImpactLogsForEmotion.filter(log => log.emotionalState === 'Frustrated');
    if (highImpactLogsForEmotion.length > 0) {
        const frustratedPercentage = (frustratedHighImpactLogs.length / highImpactLogsForEmotion.length) * 100;
        if (frustratedPercentage > 60) {
            correlations.push({
                description: `**High Impact** and **Frustrated**`,
                details: `${frustratedHighImpactLogs.length}/${highImpactLogsForEmotion.length} (${frustratedPercentage.toFixed(2)}%) of high impact logs were associated with feeling 'Frustrated'.`
            });
        }
    }

    // Example 5: Syllabus Paper vs. Failure Type
    // This requires iterating through papers and types
    const papers = [...new Set(allLogs.flatMap(log => log.syllabusPapers))];
    const types = ['Knowledge Gap', 'Skill Gap', 'Process Failure'];
    for (const paper of papers) {
        for (const type of types) {
            const paperLogs = allLogs.filter(log => log.syllabusPapers.includes(paper));
            const typeLogsInPaper = paperLogs.filter(log => log.failureType === type);
            if (paperLogs.length > 0) {
                const typePercentage = (typeLogsInPaper.length / paperLogs.length) * 100;
                // Use a lower threshold for this more exploratory correlation
                if (typePercentage > 70) {
                    correlations.push({
                        description: `**${paper}** and **${type}**`,
                        details: `${typeLogsInPaper.length}/${paperLogs.length} (${typePercentage.toFixed(2)}%) of logs for ${paper} were categorized as '${type}'.`
                    });
                }
            }
        }
    }
    // --- END NEW ---

    // --- Render Correlations (Refined) ---
    if (correlations.length > 0) {
        const listEl = correlationSection.createEl("ul");
        correlations.forEach(correlation => {
            const itemEl = listEl.createEl("li", { cls: "correlation-item" });
            // Create a summary line and a details line
            itemEl.createEl("div", { text: correlation.description, cls: "correlation-description" });
            itemEl.createEl("div", { text: correlation.details, cls: "correlation-details" });
        });
    } else {
        correlationSection.createEl("p", { text: "No strong correlations (threshold > 60%) found in the current logs.", cls: "no-correlations-message" });
    }
  }
  // --- END NEW/REFINED ---


   // --- REFINED: Render Minotaur History Section (L98, L12) ---
  private renderMinotaurHistorySection(contentEl: HTMLElement) {
    const historySection = contentEl.createDiv({ cls: "minotaur-history-section" });
    historySection.createEl("h3", { text: "Minotaur Evolution (L98, L12)" });

    const history = this.lossLogService.getMinotaurHistory(); // Get history from the service (now a copy)

    if (history.length > 0) {
        const historyList = historySection.createEl("ul", { cls: "minotaur-history-list" });
        // Add a header row for clarity
        const headerRow = historyList.createEl("li", { cls: "minotaur-history-header-row" });
        headerRow.createEl("span", { text: "Date", cls: "minotaur-history-date-header" });
        headerRow.createEl("span", { text: "Previous Minotaur", cls: "minotaur-history-archetype-header" });

        // Reverse the array to show the most recent history entries first
        [...history].reverse().forEach((entry, index) => {
            const itemRow = historyList.createEl("li", { cls: "minotaur-history-item-row" });
            // Highlight the *first* entry in the reversed list (i.e., the most recent change) differently
            if (index === 0) {
                itemRow.addClass("minotaur-history-item-row--latest-change");
            }
            itemRow.createEl("span", { text: entry.date, cls: "minotaur-history-date" });
            itemRow.createEl("span", { text: entry.archetype, cls: "minotaur-history-archetype" });
        });

        // --- NEW: Analyze and Display Trends from History (L12) ---
        const trendAnalysisDiv = historySection.createEl("div", { cls: "minotaur-trend-analysis" });
        trendAnalysisDiv.createEl("h4", { text: "Trend Analysis (L12)" });

        // 1. Calculate frequency of each archetype appearing in history
        const archetypeFrequency: Record<string, number> = {};
        history.forEach(h => {
            if (!archetypeFrequency[h.archetype]) {
                archetypeFrequency[h.archetype] = 0;
            }
            archetypeFrequency[h.archetype]++;
        });

        // 2. Identify the most frequently occurring Minotaur (not necessarily the current one)
        let mostFrequentArchetype = "";
        let maxFrequency = 0;
        for (const [arch, freq] of Object.entries(archetypeFrequency)) {
            if (freq > maxFrequency) {
                maxFrequency = freq;
                mostFrequentArchetype = arch;
            }
        }

        // 3. Identify the most persistent Minotaur (longest consecutive period holding the title)
        // This requires grouping consecutive occurrences.
        let currentArchetype = history[0]?.archetype;
        let currentRunLength = 1;
        let maxRunLength = 1;
        let mostPersistentArchetype = currentArchetype;

        for (let i = 1; i < history.length; i++) {
            if (history[i].archetype === currentArchetype) {
                currentRunLength++;
            } else {
                // Archetype changed, check if the previous run was the longest so far
                if (currentRunLength > maxRunLength) {
                    maxRunLength = currentRunLength;
                    mostPersistentArchetype = currentArchetype;
                }
                // Reset for the new archetype
                currentArchetype = history[i].archetype;
                currentRunLength = 1;
            }
        }
        // Check the last run
        if (currentRunLength > maxRunLength) {
            maxRunLength = currentRunLength;
            mostPersistentArchetype = currentArchetype;
        }

        // 4. Count total number of changes
        const totalChanges = history.length;

        // 5. Identify recent shifts (e.g., changes in the last N entries)
        const recentPeriod = 5; // Look at the last 5 history entries for recent changes
        const recentChanges = history.slice(-recentPeriod);
        const uniqueRecentArchetypes = new Set(recentChanges.map(h => h.archetype));
        const recentShiftsCount = uniqueRecentArchetypes.size; // Number of unique archetypes in the recent period

        // Display the analysis
        trendAnalysisDiv.createEl("p", { text: `Total Minotaur Changes Recorded: ${totalChanges}` });
        if (mostFrequentArchetype) {
            trendAnalysisDiv.createEl("p", { text: `Most Frequently Recorded Minotaur: ${mostFrequentArchetype} (${maxFrequency} times)` });
        }
        if (mostPersistentArchetype) {
            trendAnalysisDiv.createEl("p", { text: `Most Persistently Dominant Minotaur: ${mostPersistentArchetype} (held title for ${maxRunLength} consecutive changes)` });
        }
        trendAnalysisDiv.createEl("p", { text: `Recent Instability (Last ${recentPeriod} changes): ${recentShiftsCount} unique archetypes appeared.` });

        // Example: Show a simple textual representation of the history
        const historyTimelineDiv = trendAnalysisDiv.createEl("div", { cls: "minotaur-history-timeline" });
        historyTimelineDiv.createEl("h5", { text: "Historical Timeline (Oldest -> Newest)" });
        const timelineText = history.map(h => `${h.date}: ${h.archetype}`).join(" -> ");
        historyTimelineDiv.createEl("p", { text: timelineText, cls: "timeline-text" });

        // --- END NEW ---
    } else {
        historySection.createEl("p", { text: "Minotaur history is empty. History is tracked after Minotaur changes.", cls: "no-history-message" });
    }
  }
  // --- END REFINED ---

  private openDeferredModal(pendingItem: any, index: number) {
    new LossLogDeferredModal(
      this.app,
      this.lossLogService,
      pendingItem,
      index,
      () => {
        console.log("[LabyrinthView] Deferred modal closed, refreshing pending list.");
        this.render(); // Re-render the view to update the pending logs list
      }
    ).open();
  }
}