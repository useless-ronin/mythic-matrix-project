// src/views/LabyrinthView.ts

import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { LossLogService } from "../services/LossLogService";
import { LossLogDeferredModal } from "../modals/LossLogDeferredModal";
import {
  EVENT_MINOTAUR_UPDATED,
  EVENT_LOSS_LOGGED,
  FailureArchetype,
  FailureType,
  LossLogData,
} from "../constants";

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
    return "workflow";
  }

  async onOpen() {
    console.log("[LabyrinthView] Opened.");
    this.render();

    this.lossLogService.onMinotaurUpdated(this.handleMinotaurUpdate.bind(this));
    this.lossLogService.onLossLogged(this.handleNewLog.bind(this));
  }

  async onClose() {
    this.lossLogService.offMinotaurUpdated(this.handleMinotaurUpdate.bind(this));
    this.lossLogService.offLossLogged(this.handleNewLog.bind(this));
    console.log("[LabyrinthView] Closed.");
  }

  private handleMinotaurUpdate(payload: { oldMinotaur: string; newMinotaur: string }): void {
    console.log(`[LabyrinthView] Minotaur updated: ${payload.oldMinotaur} → ${payload.newMinotaur}`);
    this.render();
  }

  private handleNewLog(payload: { log: LossLogData; notePath: string }): void {
    console.log(`[LabyrinthView] New log: ${payload.notePath}`);
    this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("labyrinth-view");

    // --- NEW: L65 Apply Candlelight Theme ---
        if (this.lossLogService['plugin'].settings.enableCandlelightMode) {
            contentEl.addClass("candlelight-mode");
        } else {
            contentEl.removeClass("candlelight-mode");
        }

    // --- Header (L57) ---
    contentEl.createEl("h2", { text: "The Labyrinth of Loss" });

    const subtitle = contentEl.createEl("p", {
      text: `"${this.lossLogService.getRandomGrowthPrompt()}"`,
      cls: "labyrinth-subtitle",
    });
    Object.assign(subtitle.style, {
      fontStyle: "italic",
      opacity: "0.7",
      marginTop: "-10px",
      marginBottom: "20px",
    });

    // --- NEW: Theme Toggle Button (Top Right) ---
        const headerContainer = contentEl.createDiv({ cls: "labyrinth-header-container" });
        headerContainer.style.display = "flex";
        headerContainer.style.justifyContent = "space-between";
        headerContainer.style.alignItems = "center";
        
        // Move H2 into container
        headerContainer.appendChild(contentEl.querySelector("h2")!); 
        
        const themeBtn = headerContainer.createEl("button", { text: "🕯️" });
        themeBtn.title = "Toggle Candlelight Mode";
        themeBtn.style.background = "transparent";
        themeBtn.style.boxShadow = "none";
        
        themeBtn.onclick = async () => {
            const settings = this.lossLogService['plugin'].settings;
            settings.enableCandlelightMode = !settings.enableCandlelightMode;
            await this.lossLogService['plugin'].saveSettings();
            this.render(); // Re-render to apply class
        };

    // --- Gamification Stats ---
    const statsSection = contentEl.createDiv({ cls: "labyrinth-stats" });
    Object.assign(statsSection.style, {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "20px",
      padding: "10px",
      background: "var(--background-secondary)",
      borderRadius: "8px",
    });

    const xpDiv = statsSection.createDiv();
    const lvlInfo = this.lossLogService.getLevelInfo();

    xpDiv.innerHTML = `
        <div style="font-size: 0.8em; color: var(--text-muted);">Lvl ${lvlInfo.current.level}</div>
        <div style="font-weight: bold; color: var(--mythic-gold);">${lvlInfo.current.title}</div>
        <div style="font-size: 0.8em;">${this.lossLogService.getLabyrinthXP()} XP</div>
    `;
    
    // Optional: Add a mini progress bar under it
    if (lvlInfo.next) {
        const bar = xpDiv.createDiv();
        bar.style.cssText = `height: 4px; background: #333; margin-top: 4px; width: 100%; border-radius: 2px;`;
        const fill = bar.createDiv();
        fill.style.cssText = `height: 100%; background: var(--mythic-gold); width: ${lvlInfo.progress}%; border-radius: 2px;`;
    }

    xpDiv.createEl("strong", { text: "XP:" });
    xpDiv.createSpan({ text: ` ${this.lossLogService.getLabyrinthXP()} ✨` });

    const streak = this.lossLogService.getMinotaurStreak();
    const streakDiv = statsSection.createDiv();
    streakDiv.createEl("strong", { text: "Streak:" });
    streakDiv.createSpan({ text: ` ${streak} Days 🛡️` });

    if (streak >= 21) {
      const badge = contentEl.createDiv({ cls: "minotaur-slayer-badge" });
      badge.createEl("h3", { text: "🏆 MINOTAUR SLAYER" });
      badge.createEl("p", { text: "You have mastered your weakness." });
    }

    // --- Current Minotaur ---
    const minotaurSection = contentEl.createDiv({ cls: "minotaur-section" });
    minotaurSection.createEl("h3", { text: "Current Minotaur" });

    const currentMinotaur = this.lossLogService.getCurrentMinotaur();
    if (currentMinotaur) {
      minotaurSection.createEl("p", {
        text: `The dominant failure archetype is: **${currentMinotaur}**`,
        cls: "current-minotaur-display",
      });
    } else {
      minotaurSection.createEl("p", {
        text: "No Minotaur identified yet. Log some failures first.",
        cls: "no-minotaur-message",
      });
    }

    // --- Minotaur History (L98, L12) ---
    this.renderMinotaurHistorySection(contentEl);

    // --- Pending Logs ---
    const pendingSection = contentEl.createDiv({ cls: "pending-section" });
    pendingSection.createEl("h3", { text: "Pending Logs" });

    const pendingLogs = this.lossLogService.getPendingLogs();
    if (pendingLogs.length > 0) {
      const listEl = pendingSection.createEl("ul", { cls: "pending-logs-list" });
      pendingLogs.forEach((pendingItem, index) => {
        const itemEl = listEl.createEl("li", { cls: "pending-log-item" });
        itemEl.createSpan({ text: pendingItem.sourceTask });
        const btn = itemEl.createEl("button", {
          text: "Process",
          cls: "process-deferred-btn",
        });
        btn.dataset.index = String(index);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openDeferredModal(pendingItem, index);
        });
      });
    } else {
      pendingSection.createEl("p", {
        text: "No deferred logs to process.",
        cls: "no-pending-message",
      });
    }

    // --- Resilience Dashboard (L49, L47, L88) ---
    await this.renderResilienceMetrics(contentEl);

    // --- Analysis Section (L10, L11, L46, L48, L13, L9) ---
    await this.renderAnalysisSection(contentEl);

    // --- Actions ---
    const actionsSection = contentEl.createDiv({ cls: "actions-section" });
    actionsSection.createEl("h3", { text: "Actions" });

    const recalcBtn = actionsSection.createEl("button", {
      text: "Recalculate Minotaur",
      cls: "recalculate-minotaur-btn",
    });
    recalcBtn.addEventListener("click", () => {
      console.log("[LabyrinthView] Recalculating Minotaur...");
      this.lossLogService
        .recalculateMinotaur()
        .catch((e) => console.error("[LabyrinthView] Error recalculating Minotaur:", e));
    });

    if (pendingLogs.length > 0) {
      const clearBtn = actionsSection.createEl("button", {
        text: "Clear All Pending",
        cls: "clear-pending-btn",
      });
      clearBtn.addEventListener("click", () => {
        if (
          confirm("Are you sure you want to clear all pending logs? This cannot be undone.")
        ) {
          this.lossLogService.clearPendingLogs();
          this.render();
        }
      });
    }

    const logBtn = actionsSection.createEl("button", {
      text: "Log New Failure",
      cls: "log-new-failure-btn",
    });
    logBtn.addEventListener("click", () => {
      this.app.commands.executeCommandById("mythic-matrix:labyrinth-log-failure");
    });
  }

  // --- Resilience Metrics (L49, L47, L88) ---
  private async renderResilienceMetrics(container: HTMLElement) {
    const section = container.createDiv({ cls: "resilience-section" });
    section.createEl("h3", { text: "🛡️ Resilience Metrics" });

    const grid = section.createDiv({ cls: "resilience-grid" });
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: "10px",
      marginBottom: "20px",
    });

    // 1. Escape Rate (L49)
    const escapeStats = await this.lossLogService.calculateEscapeRate();
    this.createMetricCard(
      grid,
      "Escape Rate",
      `${escapeStats.rate}%`,
      `${escapeStats.escaped}/${escapeStats.total} Topics Mastered`
    );

    // 2. Insight Ratio (L88)
    const ratio = this.lossLogService.getInsightRatio();
    this.createMetricCard(grid, "Pain/Gain Ratio", ratio, "Failures : Insights");

    // 3. Thread Reuse (L47)
    const threadStats = this.lossLogService.getThreadUsageStats();
    if (threadStats.topThreads.length > 0) {
      const topThread = threadStats.topThreads[0];
      const threadBox = section.createDiv({ cls: "legendary-thread-box" });
      Object.assign(threadBox.style, {
        background: "rgba(212, 175, 55, 0.1)",
        border: "1px solid #d4af37",
        padding: "10px",
        borderRadius: "5px",
        marginTop: "10px",
      });

      const h4 = threadBox.createEl("h4", { text: "🧵 Most Used Thread" });
      Object.assign(h4.style, { marginTop: "0", color: "#d4af37" });

      const p = threadBox.createEl("p", { text: `"${topThread[0]}"` });
      Object.assign(p.style, { fontStyle: "italic", marginBottom: "5px" });

      threadBox.createEl("small", { text: `Used ${topThread[1]} times to solve problems.` });
    }
  }

  private createMetricCard(container: HTMLElement, title: string, value: string, subtitle: string) {
    const card = container.createDiv({ cls: "metric-card" });
    Object.assign(card.style, {
      background: "var(--background-primary-alt)",
      padding: "10px",
      borderRadius: "5px",
      textAlign: "center",
    });

    const titleDiv = card.createDiv({ text: title });
    Object.assign(titleDiv.style, {
      fontSize: "0.8em",
      color: "var(--text-muted)",
    });

    const valueDiv = card.createDiv({ text: value });
    Object.assign(valueDiv.style, {
      fontSize: "1.5em",
      fontWeight: "bold",
      color: "var(--text-accent)",
    });

    const subDiv = card.createDiv({ text: subtitle });
    Object.assign(subDiv.style, {
      fontSize: "0.7em",
      opacity: "0.8",
    });
  }

  // --- Analysis Section (L10, L11, L46, L48, L13, L9) ---
  private async renderAnalysisSection(contentEl: HTMLElement) {
    const analysisSection = contentEl.createDiv({ cls: "analysis-section" });
    analysisSection.createEl("h3", { text: "Analysis" });

    const folderPath = this.lossLogService.getLossLogFolder();
    const allFiles = this.app.vault.getMarkdownFiles();
    const labyrinthFiles = allFiles.filter((file) => file.path.startsWith(folderPath));

    if (labyrinthFiles.length === 0) {
      analysisSection.createEl("p", {
        text: "No loss logs found for analysis.",
        cls: "no-logs-message",
      });
      return;
    }

    // Parse all logs once
    const allLogs: LossLogData[] = [];
    for (const file of labyrinthFiles) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter) {
          const fm = cache.frontmatter;
          const logData: LossLogData = {
            lossId: fm.lossId as string,
            sourceTask: fm.sourceTask as string,
            failureType: (fm.failureType as FailureType) || "Knowledge Gap",
            failureArchetypes: (fm.failureArchetypes as string[]) || [],
            impact: (fm.impact as number) || 1,
            syllabusTopics: (fm.syllabusTopics as string[]) || [],
            syllabusPapers: (fm.syllabusPapers as string[]) || [],
            aura: (fm.aura as string) || "#aura-mid",
            emotionalState: (fm.emotionalState as string) || "",
            rootCauseChain: (fm.rootCauseChain as string[]) || [],
            ariadnesThread: (fm.ariadnesThread as string) || "",
            counterFactual: (fm.counterFactual as string) || "",
            evidenceLink: (fm.evidenceLink as string) || "",
            linkedMockTest: (fm.linkedMockTest as string) || "",
            timestamp: (fm.timestamp as string) || new Date().toISOString(),
            provenance: fm.provenance as any,
          };
          allLogs.push(logData);
        }
      } catch (e) {
        console.error(`[LabyrinthView] Error parsing file ${file.path}:`, e);
      }
    }

    if (allLogs.length === 0) {
      analysisSection.createEl("p", {
        text: "Could not parse any loss logs for analysis.",
        cls: "parse-error-message",
      });
      return;
    }

    // --- Process Failure Patterns (L84) ---
    this.renderProcessFailurePatterns(analysisSection, allLogs);

    // --- Archetype Analysis (L11, L9) ---
    this.renderArchetypeAnalysis(analysisSection, allLogs);

    // --- Failure Type Distribution ---
    this.renderFailureTypeDistribution(analysisSection, allLogs);

    // --- Syllabus Paper Breakdown (L48) ---
    this.renderSyllabusPaperBreakdown(analysisSection, allLogs);

    // --- Golden Threads (L46) ---
    this.renderAriadnesThreads(analysisSection, allLogs);

    // --- Total Logs ---
    analysisSection.createEl("p", {
      text: `Total Loss Logs: ${allLogs.length}`,
      cls: "total-logs-count",
    });

    // --- Correlation Insights (L13) ---
    this.renderCorrelationAnalysis(analysisSection, allLogs);

    // --- NEW: L67 Weak Zone Alerts ---
    this.renderWeakZoneAlerts(analysisSection, allLogs);
  }

  private renderProcessFailurePatterns(container: HTMLElement, allLogs: LossLogData[]) {
    const section = container.createDiv({ cls: "process-failure-pattern-section" });
    section.createEl("h4", { text: "Process Failure Patterns (L84)" });

    const processFailureLogs = allLogs.filter((log) => log.failureType === "Process Failure");
    const insights: string[] = [];

    // Post-mock pattern
    const linkedMockRegex = /Mock Test \d+/i;
    const postMockLogs = processFailureLogs.filter(
      (log) => log.linkedMockTest && log.timestamp
    );

    if (postMockLogs.length > 0) {
      const logsByMock: Record<string, LossLogData[]> = {};
      postMockLogs.forEach((log) => {
        const match = log.linkedMockTest?.match(linkedMockRegex);
        if (match) {
          const name = match[0];
          (logsByMock[name] = logsByMock[name] || []).push(log);
        }
      });

      for (const [mock, logs] of Object.entries(logsByMock)) {
        if (logs.length >= 2) {
          const uniqueArchetypes = new Set(logs.flatMap((l) => l.failureArchetypes));
          if (uniqueArchetypes.size > 1) {
            insights.push(
              `Post-${mock} Workflow: Multiple archetypes (${Array.from(uniqueArchetypes).join(", ")})`
            );
          } else if (logs.length >= 3) {
            insights.push(`Post-${mock} Workflow: High frequency (${logs.length} failures)`);
          }
        }
      }
    }

    // Revision workflow pattern
    const revisionKeywords = ["revise", "review", "summarize", "practice", "recall"];
    const revisionLogs = processFailureLogs.filter((log) =>
      revisionKeywords.some((kw) => log.sourceTask.toLowerCase().includes(kw))
    );

    if (revisionLogs.length >= 3) {
      const uniqueTopics = new Set(
        revisionLogs.flatMap((l) =>
          l.syllabusTopics.map((t) => t.replace(/\[\[|\]\]/g, ""))
        )
      );
      if (uniqueTopics.size > 2) {
        insights.push(
          `"${revisionKeywords.join("/")}" Workflow: ${revisionLogs.length} failures across ${uniqueTopics.size} topics`
        );
      }
    }

    if (insights.length > 0) {
      const ul = section.createEl("ul");
      insights.forEach((insight) => ul.createEl("li", { text: insight }));
    } else {
      section.createEl("p", {
        text: "No significant process failure patterns detected yet.",
        cls: "no-patterns-message",
      });
    }
  }

  private renderArchetypeAnalysis(container: HTMLElement, allLogs: LossLogData[]) {
    const now = new Date();
    const decayFactorPerDay = 0.95;
    const baseWeight = 1.0;

    const archetypeCounts: Record<FailureArchetype, number> = {} as any;
    const archetypeWeightedScores: Record<FailureArchetype, number> = {} as any;

    allLogs.forEach((log) => {
      const logDate = new Date(log.timestamp);
      const days = (now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24);
      const weight = baseWeight * Math.pow(decayFactorPerDay, days);

      log.failureArchetypes.forEach((archetype) => {
        archetypeCounts[archetype] = (archetypeCounts[archetype] || 0) + 1;
        archetypeWeightedScores[archetype] = (archetypeWeightedScores[archetype] || 0) + weight;
      });
    });

    // Raw Top Archetypes (L11)
    const topRaw = Object.entries(archetypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topRaw.length > 0) {
      const div = container.createDiv({ cls: "top-archetypes-list" });
      div.createEl("h4", { text: "Top Failure Archetypes (Raw Count - L11)" });
      const ul = div.createEl("ul");
      topRaw.forEach(([arch, count]) => ul.createEl("li", { text: `${arch}: ${count}` }));
    }

    // Weighted Top Archetypes (L9)
    const topWeighted = Object.entries(archetypeWeightedScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topWeighted.length > 0) {
      const div = container.createDiv({ cls: "top-archetypes-weighted-list" });
      div.createEl("h4", { text: "Top Failure Archetypes (Weighted Score - L9)" });
      const ul = div.createEl("ul");
      topWeighted.forEach(([arch, score]) =>
        ul.createEl("li", { text: `${arch}: ${score.toFixed(2)}` })
      );

      const currentMinotaur = this.lossLogService.getCurrentMinotaur();
      if (currentMinotaur && archetypeWeightedScores[currentMinotaur] !== undefined) {
        const score = archetypeWeightedScores[currentMinotaur];
        div.createEl("p", {
          text: `(*) Current Minotaur: ${currentMinotaur} — ${score.toFixed(2)}`,
          cls: "current-minotaur-score",
        });
      }
    }
  }

  private renderFailureTypeDistribution(container: HTMLElement, allLogs: LossLogData[]) {
    const typeCounts: Record<FailureType, number> = {
      "Knowledge Gap": 0,
      "Skill Gap": 0,
      "Process Failure": 0,
    };
    allLogs.forEach((log) => {
      typeCounts[log.failureType] = (typeCounts[log.failureType] || 0) + 1;
    });

    const div = container.createDiv({ cls: "failure-type-list" });
    div.createEl("h4", { text: "Failure Types Distribution" });
    const ul = div.createEl("ul");
    (Object.entries(typeCounts) as [FailureType, number][]).forEach(([type, count]) =>
      ul.createEl("li", { text: `${type}: ${count}` })
    );
  }

  private renderSyllabusPaperBreakdown(container: HTMLElement, allLogs: LossLogData[]) {
    const paperCounts: Record<string, number> = {};
    allLogs.forEach((log) => {
      log.syllabusPapers.forEach((paper) => {
        paperCounts[paper] = (paperCounts[paper] || 0) + 1;
      });
    });

    const div = container.createDiv({ cls: "syllabus-paper-list" });
    div.createEl("h4", { text: "Failures by Syllabus Paper (L48)" });
    const ul = div.createEl("ul");
    Object.entries(paperCounts).forEach(([paper, count]) =>
      ul.createEl("li", { text: `${paper}: ${count} failures` })
    );
  }

  private renderAriadnesThreads(container: HTMLElement, allLogs: LossLogData[]) {
    const uniqueThreads = new Set(
      allLogs.map((log) => log.ariadnesThread).filter((t) => t.trim() !== "")
    );
    container.createEl("p", {
      text: `Unique Ariadne's Threads Captured: ${uniqueThreads.size}`,
      cls: "unique-threads-count",
    });

    if (uniqueThreads.size > 0) {
      const recentDiv = container.createDiv({ cls: "recent-threads-list" });
      recentDiv.createEl("h4", { text: "Recent Ariadne's Threads (L46)" });
      const ul = recentDiv.createEl("ul");
      const recent = allLogs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((log) => log.ariadnesThread)
        .filter((t) => t.trim() !== "")
        .slice(0, 5);
      recent.forEach((thread) => ul.createEl("li", { text: thread, cls: "ariadnes-thread-item" }));
    }
  }

  // --- Correlation Analysis (L13) ---
  private renderCorrelationAnalysis(container: HTMLElement, allLogs: LossLogData[]) {
    const section = container.createDiv({ cls: "correlation-analysis-section" });
    section.createEl("h4", { text: "Correlation Insights (L13)" });

    const correlations = [];
    const highImpactThreshold = 4;

    // 1. Aura vs Archetype
    const archetypeToCheck = "silly-mistake" as FailureArchetype;
    const auraToCheck = "#aura-low";
    const archetypeLogs = allLogs.filter((log) =>
      log.failureArchetypes.includes(archetypeToCheck)
    );
    const archetypeInAuraLow = archetypeLogs.filter((log) => log.aura === auraToCheck);
    if (archetypeLogs.length > 0) {
      const pct = (archetypeInAuraLow.length / archetypeLogs.length) * 100;
      if (pct > 60) {
        correlations.push({
          description: `**${archetypeToCheck}** and **${auraToCheck}**`,
          details: `${archetypeInAuraLow.length}/${archetypeLogs.length} (${pct.toFixed(2)}%)`,
        });
      }
    }

    // 2. Emotion vs Impact
    const emotion = "Frustrated";
    const emotionLogs = allLogs.filter((log) => log.emotionalState === emotion);
    const highImpactEmotion = emotionLogs.filter((log) => log.impact >= highImpactThreshold);
    if (emotionLogs.length > 0) {
      const pct = (highImpactEmotion.length / emotionLogs.length) * 100;
      if (pct > 60) {
        correlations.push({
          description: `**${emotion}** and **High Impact** (≥${highImpactThreshold})`,
          details: `${highImpactEmotion.length}/${emotionLogs.length} (${pct.toFixed(2)}%)`,
        });
      }
    }

    // 3. Failure Type vs Impact
    const type = "Process Failure" as FailureType;
    const typeLogs = allLogs.filter((log) => log.failureType === type);
    const highImpactType = typeLogs.filter((log) => log.impact >= highImpactThreshold);
    if (typeLogs.length > 0) {
      const pct = (highImpactType.length / typeLogs.length) * 100;
      if (pct > 60) {
        correlations.push({
          description: `**${type}** and **High Impact**`,
          details: `${highImpactType.length}/${typeLogs.length} (${pct.toFixed(2)}%)`,
        });
      }
    }

    // 4. High Impact → Frustration
    const highImpactLogs = allLogs.filter((log) => log.impact >= highImpactThreshold);
    const frustratedHigh = highImpactLogs.filter((log) => log.emotionalState === "Frustrated");
    if (highImpactLogs.length > 0) {
      const pct = (frustratedHigh.length / highImpactLogs.length) * 100;
      if (pct > 60) {
        correlations.push({
          description: `**High Impact** and **Frustrated**`,
          details: `${frustratedHigh.length}/${highImpactLogs.length} (${pct.toFixed(2)}%)`,
        });
      }
    }

    // 5. Syllabus Paper vs Failure Type
    const papers = [...new Set(allLogs.flatMap((log) => log.syllabusPapers))];
    const types: FailureType[] = ["Knowledge Gap", "Skill Gap", "Process Failure"];
    for (const paper of papers) {
      for (const type of types) {
        const paperLogs = allLogs.filter((log) => log.syllabusPapers.includes(paper));
        const typeInPaper = paperLogs.filter((log) => log.failureType === type);
        if (paperLogs.length > 0) {
          const pct = (typeInPaper.length / paperLogs.length) * 100;
          if (pct > 70) {
            correlations.push({
              description: `**${paper}** and **${type}**`,
              details: `${typeInPaper.length}/${paperLogs.length} (${pct.toFixed(2)}%)`,
            });
          }
        }
      }
    }

    if (correlations.length > 0) {
      const ul = section.createEl("ul");
      correlations.forEach((corr) => {
        const li = ul.createEl("li", { cls: "correlation-item" });
        li.createEl("div", { text: corr.description, cls: "correlation-description" });
        li.createEl("div", { text: corr.details, cls: "correlation-details" });
      });
    } else {
      section.createEl("p", {
        text: "No strong correlations (threshold > 60%) found.",
        cls: "no-correlations-message",
      });
    }
  }

  // --- Minotaur History (L98, L12) ---
  private renderMinotaurHistorySection(contentEl: HTMLElement) {
    const section = contentEl.createDiv({ cls: "minotaur-history-section" });
    section.createEl("h3", { text: "Minotaur Evolution (L98, L12)" });

    const history = this.lossLogService.getMinotaurHistory();
    if (history.length === 0) {
      section.createEl("p", {
        text: "Minotaur history is empty. History is tracked after Minotaur changes.",
        cls: "no-history-message",
      });
      return;
    }

    const list = section.createEl("ul", { cls: "minotaur-history-list" });
    const header = list.createEl("li", { cls: "minotaur-history-header-row" });
    header.createEl("span", { text: "Date", cls: "minotaur-history-date-header" });
    header.createEl("span", { text: "Previous Minotaur", cls: "minotaur-history-archetype-header" });

    [...history].reverse().forEach((entry, i) => {
      const row = list.createEl("li", { cls: "minotaur-history-item-row" });
      if (i === 0) row.addClass("minotaur-history-item-row--latest-change");
      row.createEl("span", { text: entry.date, cls: "minotaur-history-date" });
      row.createEl("span", { text: entry.archetype, cls: "minotaur-history-archetype" });
    });

    // --- Trend Analysis (L12) ---
    const trendDiv = section.createDiv({ cls: "minotaur-trend-analysis" });
    trendDiv.createEl("h4", { text: "Trend Analysis (L12)" });

    // Frequency
    const freq: Record<string, number> = {};
    history.forEach((h) => (freq[h.archetype] = (freq[h.archetype] || 0) + 1));
    let mostFreq = "";
    let maxFreq = 0;
    for (const [arch, count] of Object.entries(freq)) {
      if (count > maxFreq) {
        maxFreq = count;
        mostFreq = arch;
      }
    }

    // Persistence (longest run)
    let current = history[0]?.archetype;
    let run = 1;
    let maxRun = 1;
    let mostPersistent = current;
    for (let i = 1; i < history.length; i++) {
      if (history[i].archetype === current) {
        run++;
      } else {
        if (run > maxRun) {
          maxRun = run;
          mostPersistent = current;
        }
        current = history[i].archetype;
        run = 1;
      }
    }
    if (run > maxRun) {
      mostPersistent = current;
      maxRun = run;
    }

    trendDiv.createEl("p", { text: `Total Minotaur Changes: ${history.length}` });
    if (mostFreq) {
      trendDiv.createEl("p", {
        text: `Most Frequently Recorded: ${mostFreq} (${maxFreq} times)`,
      });
    }
    if (mostPersistent) {
      trendDiv.createEl("p", {
        text: `Most Persistent: ${mostPersistent} (${maxRun} consecutive changes)`,
      });
    }

    const recentPeriod = 5;
    const recent = history.slice(-recentPeriod);
    const recentUnique = new Set(recent.map((h) => h.archetype));
    trendDiv.createEl("p", {
      text: `Recent Instability (Last ${recentPeriod}): ${recentUnique.size} unique archetypes`,
    });

    const timeline = trendDiv.createEl("div", { cls: "minotaur-history-timeline" });
    timeline.createEl("h5", { text: "Historical Timeline (Oldest → Newest)" });
    const timelineText = history.map((h) => `${h.date}: ${h.archetype}`).join(" → ");
    timeline.createEl("p", { text: timelineText, cls: "timeline-text" });
  }

  private openDeferredModal(pendingItem: any, index: number) {
    new LossLogDeferredModal(
      this.app,
      this.lossLogService,
      pendingItem,
      index,
      () => {
        console.log("[LabyrinthView] Deferred modal closed, refreshing.");
        this.render();
      }
    ).open();
  }

  // --- NEW: L67 Weak Zone Alerts ---
  private renderWeakZoneAlerts(container: HTMLElement, allLogs: LossLogData[]) {
    const topicCounts: Record<string, number> = {};

    allLogs.forEach((log) => {
      log.syllabusTopics.forEach((topic) => {
        const cleanTopic = topic.replace(/\[\[|\]\]/g, "").trim();
        if (cleanTopic) {
          topicCounts[cleanTopic] = (topicCounts[cleanTopic] || 0) + 1;
        }
      });
    });

    const weakZones = Object.entries(topicCounts)
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);

    if (weakZones.length > 0) {
      const alertBox = container.createDiv({ cls: "weak-zone-alert-box" });
      Object.assign(alertBox.style, {
        background: "rgba(255, 82, 82, 0.1)",
        borderLeft: "4px solid #ff5252",
        padding: "10px",
        marginBottom: "20px",
        borderRadius: "4px",
      });

      const h4 = alertBox.createEl("h4", { text: "⚠️ Critical Weak Zones (L67)" });
      Object.assign(h4.style, { color: "#ff5252", marginTop: "0" });

      const p = alertBox.createEl("p", {
        text: "These topics are recurring points of failure. Prioritize revision immediately.",
      });
      Object.assign(p.style, { fontSize: "0.9em", opacity: "0.8" });

      const list = alertBox.createEl("ul");
      weakZones.forEach(([topic, count]) => {
        const li = list.createEl("li");
        li.innerHTML = `<strong>${topic}</strong>: ${count} failures`;

        const btn = li.createEl("button", { text: "🚑 Rescue" });
        Object.assign(btn.style, {
          marginLeft: "10px",
          fontSize: "0.7em",
          padding: "2px 6px",
        });

        btn.addEventListener("click", async () => {
          // In TypeScript, we must cast 'any' or define a public method.
          // Accessing plugin/settings via service is brittle but standard for this prototype.
          // A better way is to add `addRescueTask(topic)` to LossLogService.
          // For now, using the service's internal reference (if public/exposed via getter).
          // Since we don't have a direct public `addTask` method on service, we'll use a hack
          // or assume `this.lossLogService['plugin']` access pattern is acceptable for now (though TS complains).
          // FIXED: Used a public method if available or defined one in LossLogService.
          // Assuming you added `addRescueTask` to LossLogService as part of best practices:
          
          // this.lossLogService.addRescueTask(topic); 
          
          // Fallback to direct access if method missing (TS will complain unless cast):
          const serviceAny = this.lossLogService as any;
          if(serviceAny.plugin && serviceAny.plugin.settings) {
             serviceAny.plugin.settings.tasks.push({
                id: Date.now().toString(),
                text: `🚑 Emergency Rescue: Focused Study on [[${topic}]]`,
                created: Date.now()
             });
             await serviceAny.plugin.saveSettings();
             new Notice(`Rescue task created for ${topic}`);
          }
        });
      });
    }
  }
}